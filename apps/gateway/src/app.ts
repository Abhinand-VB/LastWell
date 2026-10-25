// The Fastify app: every route and WebSocket of docs/03 §6, wired to real or fake services.
import Fastify, { type FastifyInstance } from "fastify";
import formbody from "@fastify/formbody";
import websocket from "@fastify/websocket";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION, type ConfigResponse } from "@lastwell/core";
import { AlertRegistry } from "./alerts/alertRegistry.js";
import { AlertService } from "./alerts/approve.js";
import type { Env } from "./env.js";
import type { Logger } from "./log.js";
import { CallRegistry } from "./pipeline/callRegistry.js";
import { CallService } from "./pipeline/calls.js";
import type { Services } from "./services.js";
import { Repo } from "./store/repo.js";
import { AlertStreamSession } from "./twilio/alertStream.js";
import { FakeTelephony } from "./twilio/fake.js";
import { MediaStreamSession } from "./twilio/mediaStream.js";
import { registerTwilioRoutes } from "./twilio/voiceWebhook.js";
import { callSnapshot, registerRest } from "./ui/rest.js";
import { TokenStore } from "./ui/tokens.js";
import { UiHub } from "./ui/wsHub.js";
import { registerBrowserMedia } from "./browser/browserMedia.js";

const GATEWAY_DIR = fileURLToPath(new URL("..", import.meta.url));

/** WebSocket upgrades: no Origin (Twilio, scripts) or a local web app (docs/03 §6, G-30). */
export function originAllowed(origin: string | undefined): boolean {
  if (origin === undefined || origin === "") return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

export interface Gateway {
  app: FastifyInstance;
  calls: CallService;
  alerts: AlertService;
  hub: UiHub;
  tokens: TokenStore;
  services: Services;
  /** The STT factory every stream uses (health-wrapped: a 401/403 marks `cartesia` degraded). */
  stt: Services["stt"];
}

export function buildApp(env: Env, services: Services, log: Logger): Gateway {
  // Typed as the default instance so plugins and helpers accept it (pino Logger ≠ FastifyBaseLogger in the types).
  const app = Fastify({ loggerInstance: log }) as unknown as FastifyInstance;
  const bootedAt = Date.now();
  const repo = new Repo(services.store, log);
  const tokens = new TokenStore();
  const registry = new CallRegistry();
  const alertRegistry = new AlertRegistry();
  const health = { cartesia: "ok" as "ok" | "degraded" };

  // The hub needs snapshots from calls+alerts, which need the hub: late-bound.
  let snapshotFn: (id: string) => ReturnType<typeof callSnapshot> = async () => null;
  let boardFn: () => ReturnType<AlertService["board"]> = async () => [];
  const hub = new UiHub({ tokens, log, snapshot: (id) => snapshotFn(id), boardAlerts: () => boardFn() });

  const calls = new CallService({
    registry,
    repo,
    hub,
    log,
    model: services.model,
    timezone: env.CALL_TIMEZONE,
    likelyMinDistinctSigns: env.LIKELY_MIN_DISTINCT_SIGNS,
    reasonerIntervalMs: env.REASONER_INTERVAL_MS,
  });
  const alerts = new AlertService({
    alerts: alertRegistry,
    calls,
    repo,
    hub,
    log,
    tts: services.tts,
    telephony: services.telephony,
    allowedNumbers: env.ALERT_ALLOWED_NUMBERS,
    timezone: env.CALL_TIMEZONE,
    qaEnabled: env.FEATURE_QA_ENABLED,
    delivery: env.ALERT_DELIVERY,
    model: services.model,
  });
  snapshotFn = (id) => callSnapshot({ calls, alerts, repo }, id);
  boardFn = () => alerts.board(Date.now() - 24 * 3600_000);

  const sttFactory = services.stt;
  const stt: Services["stt"] = (o) => {
    const s = sttFactory(o);
    s.on("degraded", (e) => {
      if (e.statusCode === 401 || e.statusCode === 403) health.cartesia = "degraded";
    });
    return s;
  };

  const alertStreamDeps = { alerts, log, expectedAccountSid: services.expectedAccountSid, stt, ttsStream: services.ttsStream };
  if (services.telephony instanceof FakeTelephony) {
    services.telephony.bind({
      status: (sid, s) => alerts.onTwilioStatus(sid, s),
      openStream: (send, close) => new AlertStreamSession(alertStreamDeps, send, close),
    });
  }


  app.register(formbody);
  app.register(websocket);

  app.addHook("onRequest", async (req, reply) => {
    if (req.headers.upgrade?.toLowerCase() !== "websocket") return;
    if (!originAllowed(req.headers.origin)) {
      log.warn({ event: "ws.origin_refused", origin: req.headers.origin, url: req.url }, "origin refused");
      return reply.code(403).send({ error: { code: "forbidden", message: "origin not allowed" } });
    }
  });

  app.get("/healthz", async () => ({
    ok: true,
    uptimeS: Math.round((Date.now() - bootedAt) / 1000),
    liveCalls: registry.liveCount,
    cartesia: health.cartesia,
    version: VERSION,
    fakes: [...env.fakes],
  }));

  // alertDelivery (D-43) until reasoning adds it to ConfigResponse in core.
  const config: ConfigResponse & { alertDelivery: "phone" | "local" } = {
    demoAlertToCaller: env.DEMO_ALERT_TO_CALLER,
    featureBrowserMic: env.FEATURE_BROWSER_MIC,
    featureQa: env.FEATURE_QA_ENABLED,
    callTimezone: env.CALL_TIMEZONE,
    alertDefaultTargetPhone: env.ALERT_DEFAULT_TARGET_PHONE ?? null,
    alertDelivery: env.ALERT_DELIVERY,
  };

  registerRest(app, {
    calls,
    alerts,
    repo,
    tokens,
    internalKey: env.INTERNAL_API_KEY,
    config,
    evalScriptsDir: path.resolve(GATEWAY_DIR, env.EVAL_SCRIPTS_DIR),
    devRoutes: env.fakes.size > 0 && !env.DEMO_MODE,
  });
  registerTwilioRoutes(app, {
    calls,
    alerts,
    publicBaseUrl: env.PUBLIC_BASE_URL,
    authToken: env.TWILIO_AUTH_TOKEN,
    validateSignature: env.TWILIO_VALIDATE_SIGNATURE,
    twilioPhoneNumber: env.TWILIO_PHONE_NUMBER,
    dispatcherPhone: env.DISPATCHER_PHONE,
  });

  app.register(async (scoped) => {
    scoped.get("/ws/ui", { websocket: true }, (socket) => {
      const h = hub.attach(socket);
      socket.on("message", (data) => h.onMessage(data.toString()));
      socket.on("close", h.onClose);
      socket.on("error", () => h.onClose());
    });

    scoped.get("/twilio/media", { websocket: true }, (socket) => {
      const s = new MediaStreamSession(
        { calls, stt, log, expectedAccountSid: services.expectedAccountSid, dispatcherTrack: env.STT_DISPATCHER_TRACK },
        (code, reason) => socket.close(code, reason),
      );
      socket.on("message", (data) => s.handleRaw(data.toString()));
      socket.on("close", () => void s.end());
      socket.on("error", () => void s.end());
    });

    scoped.get("/twilio/alert-media", { websocket: true }, (socket) => {
      const s = new AlertStreamSession(
        alertStreamDeps,
        (m) => {
          if (socket.readyState === 1) socket.send(JSON.stringify(m));
        },
        (code, reason) => socket.close(code, reason),
      );
      socket.on("message", (data) => {
        let json: unknown;
        try {
          json = JSON.parse(data.toString());
        } catch {
          return;
        }
        s.handle(json);
      });
      socket.on("close", () => s.end());
      socket.on("error", () => s.end());
    });

    registerBrowserMedia(scoped, { calls, stt, tokens, log, publicBaseUrl: env.PUBLIC_BASE_URL, enabled: env.FEATURE_BROWSER_MIC });
  });

  app.addHook("onClose", async () => registry.disposeAll());

  return { app, calls, alerts, hub, tokens, services, stt };
}
