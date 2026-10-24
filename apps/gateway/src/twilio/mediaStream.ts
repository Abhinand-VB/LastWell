// WS /twilio/media (docs/05 §3): the inbound call's forked audio, both tracks. One STT session per
// track (dispatcher track optional); `stop` or socket close ends the call.
import type { Logger } from "pino";
import { TwilioMediaMessage } from "@lastwell/core";
import type { CallService } from "../pipeline/calls.js";
import type { LiveCall } from "../pipeline/callRegistry.js";
import type { SttSession, SttSessionFactory } from "../stt/sessions.js";
import { attachSession } from "../stt/utteranceAssembler.js";

export interface MediaStreamDeps {
  calls: CallService;
  stt: SttSessionFactory;
  log: Logger;
  expectedAccountSid: string;
  dispatcherTrack: boolean;
}

type Track = "inbound" | "outbound";

export class MediaStreamSession {
  private call: LiveCall | null = null;
  private sessions: Partial<Record<Track, SttSession>> = {};
  private lastTs: Record<Track, number> = { inbound: 0, outbound: 0 };
  private frames = 0;
  private ended = false;

  constructor(
    private readonly deps: MediaStreamDeps,
    private readonly close: (code: number, reason: string) => void,
  ) {}

  /** Raw text frame from Twilio. Never throws. */
  handleRaw(raw: string): void {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return;
    }
    this.handle(json);
  }

  handle(json: unknown): void {
    try {
      this.handleInner(json);
    } catch (err) {
      this.deps.log.error({ event: "media.handler_error", callId: this.call?.id, err: err instanceof Error ? err.stack : String(err) }, "media handler error");
    }
  }

  private handleInner(json: unknown): void {
    const parsed = TwilioMediaMessage.safeParse(json);
    if (!parsed.success) {
      this.deps.log.debug({ event: "media.unknown", json }, "ignored message");
      return;
    }
    const msg = parsed.data;
    switch (msg.event) {
      case "connected":
        this.deps.log.info({ event: "media.connected" }, "twilio media connected");
        return;
      case "start": {
        const callId = msg.start.customParameters?.callId;
        const call = callId ? this.deps.calls.registry.get(callId) : undefined;
        if (msg.start.accountSid !== this.deps.expectedAccountSid || !call || call.status !== "live") {
          this.deps.log.warn({ event: "media.rejected", callId, accountSidOk: msg.start.accountSid === this.deps.expectedAccountSid }, "rejected stream");
          this.close(1008, "unknown call");
          return;
        }
        this.call = call;
        this.deps.calls.markStreamStarted(call);
        const open = (track: Track, speaker: "caller" | "dispatcher") => {
          const s = this.deps.stt({ speaker, encoding: "pcm_mulaw", sampleRate: 8000, profile: "call", getTs: () => this.lastTs[track] });
          attachSession(this.deps.calls, call, s, this.deps.log);
          this.sessions[track] = s;
        };
        open("inbound", "caller");
        if (this.deps.dispatcherTrack) open("outbound", "dispatcher");
        call.onEnd.push(() => this.closeSessions());
        this.deps.log.info({ event: "media.start", callId: call.id, streamSid: msg.streamSid, tracks: msg.start.tracks }, "stream started");
        return;
      }
      case "media": {
        const track: Track = msg.media.track ?? "inbound";
        const ts = Number(msg.media.timestamp);
        if (Number.isFinite(ts)) this.lastTs[track] = ts;
        const s = this.sessions[track];
        if (!s) return;
        s.sendAudio(Buffer.from(msg.media.payload, "base64"));
        if (++this.frames % 500 === 0) this.deps.log.debug({ event: "media.frames", callId: this.call?.id, frames: this.frames }, "frames");
        return;
      }
      case "stop":
        void this.end();
        return;
      default:
        return; // mark, dtmf
    }
  }

  private async closeSessions(): Promise<void> {
    const all = Object.values(this.sessions);
    this.sessions = {};
    await Promise.all(all.map((s) => s.close()));
  }

  /** stop, or socket close/error without stop (docs/05 §9: treat as call end). */
  async end(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    if (this.call) await this.deps.calls.end(this.call);
    else await this.closeSessions();
  }

  get callId(): string | null {
    return this.call?.id ?? null;
  }
}
