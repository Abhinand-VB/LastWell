// Browser-microphone fallback (docs/05 §10, D-13, D-36): POST /api/calls/browser creates a `browser`
// call; WS /browser/media/:callId?token= carries pcm_s16le 16 kHz frames from one laptop mic, so every
// utterance is speaker `mixed`. A {"type":"end"} text frame or socket close ends the call.
import type { FastifyInstance } from "fastify";
import { actorOf } from "../audit/auditTrail.js";
import type { Logger } from "pino";
import { BrowserMediaControl } from "@lastwell/core";
import type { CallService } from "../pipeline/calls.js";
import type { SttSessionFactory } from "../stt/sessions.js";
import { attachSession } from "../stt/utteranceAssembler.js";
import type { TokenStore } from "../ui/tokens.js";
import { wssBase } from "../twilio/twiml.js";

export interface BrowserMediaDeps {
  calls: CallService;
  stt: SttSessionFactory;
  tokens: TokenStore;
  log: Logger;
  publicBaseUrl: string;
  enabled: boolean;
}

/** 16 kHz × 2 bytes. */
const BYTES_PER_MS = 32;

export function registerBrowserMedia(app: FastifyInstance, deps: BrowserMediaDeps): void {
  app.post("/api/calls/browser", async (req, reply) => {
    if (!deps.enabled) return reply.code(409).send({ error: { code: "disabled", message: "FEATURE_BROWSER_MIC=false" } });
    const call = deps.calls.create({ mode: "browser" });
    const { token } = deps.tokens.issue();
    // The mic page connects from the browser; use the host it reached us on when it is local.
    const host = req.headers.host;
    const base = host && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? `ws://${host}` : wssBase(deps.publicBaseUrl);
    return { callId: call.id, micWsUrl: `${base}/browser/media/${call.id}?token=${token}` };
  });

  app.post("/api/calls/:callId/end", async (req, reply) => {
    const { callId } = req.params as { callId: string };
    const call = deps.calls.registry.get(callId);
    if (!call) return reply.code(404).send({ error: { code: "unknown_call", message: `unknown call ${callId}` } });
    if (call.mode !== "browser") return reply.code(409).send({ error: { code: "bad_mode", message: "only browser calls end this way" } });
    call.audit.push({ at: new Date().toISOString(), type: "dispatcher", action: "end_call", actor: actorOf(req.headers["x-lastwell-actor"]), alertId: null, targetPhoneMasked: null, detail: "browser call ended from the console" });
    void deps.calls.end(call);
    return { ok: true };
  });

  app.get("/browser/media/:callId", { websocket: true }, (socket, req) => {
    const { callId } = req.params as { callId: string };
    const token = (req.query as { token?: string }).token;
    const call = deps.calls.registry.get(callId);
    if (!deps.tokens.valid(token) || !call || call.mode !== "browser" || call.status !== "live") {
      deps.log.warn({ event: "browser.rejected", callId, tokenOk: deps.tokens.valid(token) }, "mic socket rejected");
      socket.close(1008, "unauthorized");
      return;
    }
    let bytes = 0;
    const session = deps.stt({ speaker: "mixed", encoding: "pcm_s16le", sampleRate: 16000, profile: "call", getTs: () => bytes / BYTES_PER_MS });
    attachSession(deps.calls, call, session, deps.log);
    call.onEnd.push(() => session.close());
    const end = () => void deps.calls.end(call);
    socket.on("message", (data, isBinary) => {
      try {
        if (isBinary) {
          const buf = Buffer.isBuffer(data) ? data : Buffer.concat(Array.isArray(data) ? data : [Buffer.from(data as ArrayBuffer)]);
          if (bytes === 0) deps.calls.markStreamStarted(call);
          bytes += buf.length;
          session.sendAudio(buf);
          return;
        }
        if (BrowserMediaControl.safeParse(JSON.parse(data.toString())).success) end();
      } catch (err) {
        deps.log.warn({ event: "browser.handler_error", callId, err: String(err) }, "mic frame error");
      }
    });
    socket.on("close", end);
    socket.on("error", end);
  });
}
