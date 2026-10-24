// WS /twilio/alert-media (docs/05 §8): the briefing, then (FEATURE_QA_ENABLED) the Q&A loop with
// barge-in; with Q&A off it hangs up after the `briefing` mark. Transport-agnostic: the real route and
// FakeTelephony both drive AlertStreamSession.
import type { Logger } from "pino";
import { TwilioMediaMessage } from "@lastwell/core";
import type { AlertRecord } from "../alerts/alertRegistry.js";
import type { AlertService } from "../alerts/approve.js";
import type { SttSession, SttSessionFactory } from "../stt/sessions.js";
import { briefingMessages, type TwilioOutMessage } from "../tts/audioChunks.js";
import type { TtsStream, TtsStreamFactory } from "../tts/sonicWs.js";

export interface AlertStreamDeps {
  alerts: AlertService;
  log: Logger;
  expectedAccountSid: string;
  /** Q&A (V-08); unused when FEATURE_QA_ENABLED=false. */
  stt?: SttSessionFactory;
  ttsStream?: TtsStreamFactory;
  /** Hang up after this long without a question (docs/05 §8: 60 s). */
  qaIdleMs?: number;
}

type Phase = "briefing" | "qa" | "answering";

export class AlertStreamSession {
  private alert: AlertRecord | null = null;
  private streamSid: string | null = null;
  private ended = false;
  private phase: Phase = "briefing";
  private ink: SttSession | null = null;
  private tts: TtsStream | null = null;
  private answerSeq = 0;
  private currentContext: string | null = null;
  private lastInboundTs = 0;
  private idle: NodeJS.Timeout | null = null;

  constructor(
    private readonly deps: AlertStreamDeps,
    private readonly send: (m: TwilioOutMessage) => void,
    private readonly close: (code: number, reason: string) => void,
  ) {}

  handle(json: unknown): void {
    try {
      this.handleInner(json);
    } catch (err) {
      this.deps.log.error({ event: "alert_media.handler_error", alertId: this.alert?.id, err: err instanceof Error ? err.stack : String(err) }, "alert stream error");
    }
  }

  private handleInner(json: unknown): void {
    const parsed = TwilioMediaMessage.safeParse(json);
    if (!parsed.success) {
      this.deps.log.debug({ event: "alert_media.unknown", json }, "ignored message");
      return;
    }
    const msg = parsed.data;
    switch (msg.event) {
      case "start": {
        const alertId = msg.start.customParameters?.alertId;
        const alert = alertId ? this.deps.alerts.registry.get(alertId) : undefined;
        if (msg.start.accountSid !== this.deps.expectedAccountSid || !alert) {
          this.deps.log.warn({ event: "alert_media.rejected", alertId, accountSidOk: msg.start.accountSid === this.deps.expectedAccountSid }, "rejected stream");
          this.close(1008, "unknown alert");
          return;
        }
        this.alert = alert;
        this.streamSid = msg.streamSid;
        this.deps.alerts.onAnswered(alert);
        // Open the TTS socket now so its handshake is not on the answer path.
        if (this.qaOn) this.tts = this.deps.ttsStream!();
        this.playBriefing(alert, msg.streamSid);
        return;
      }
      case "mark":
        if (!this.alert) return;
        if (msg.mark.name === "briefing") {
          void this.deps.alerts.onBriefingPlayed(this.alert);
          if (this.qaOn) this.openQa(this.alert);
        } else if (msg.mark.name === `answer-${this.answerSeq}` && this.phase === "answering") {
          this.phase = "qa";
          this.armIdle();
        }
        return;
      case "media": {
        const ts = Number(msg.media.timestamp);
        if (Number.isFinite(ts)) this.lastInboundTs = ts;
        if (this.phase !== "briefing") this.ink?.sendAudio(Buffer.from(msg.media.payload, "base64"));
        return;
      }
      case "stop":
        this.end();
        return;
      default:
        return; // connected, dtmf
    }
  }

  private get qaOn(): boolean {
    return this.deps.alerts.qaEnabled && this.deps.stt !== undefined && this.deps.ttsStream !== undefined;
  }

  private openQa(alert: AlertRecord): void {
    this.phase = "qa";
    this.deps.alerts.onQaOpen(alert);
    const ink = this.deps.stt!({ speaker: "caller", encoding: "pcm_mulaw", sampleRate: 8000, profile: "qa", getTs: () => this.lastInboundTs });
    this.ink = ink;
    ink.on("final", (f) => void this.onQuestion(alert, f.text).catch((err: unknown) => this.logError(err)));
    ink.on("turn.start", () => this.bargeIn());
    ink.on("error", (e) => this.deps.log.warn({ event: "qa.stt_error", alertId: alert.id, ...e }, "qa stt error"));
    this.armIdle();
  }

  private logError(err: unknown): void {
    this.deps.log.error({ event: "qa.error", alertId: this.alert?.id, err: err instanceof Error ? err.stack : String(err) }, "qa error");
  }

  /** The neurologist talks over an answer: empty Twilio's buffer and cancel the TTS context. */
  private bargeIn(): void {
    if (this.phase !== "answering" || this.streamSid === null) return;
    this.send({ event: "clear", streamSid: this.streamSid });
    if (this.currentContext) this.tts?.cancel(this.currentContext);
    this.deps.log.info({ event: "qa.barge_in", alertId: this.alert?.id, seq: this.answerSeq }, "barge-in");
    this.phase = "qa";
  }

  private armIdle(): void {
    if (this.idle) clearTimeout(this.idle);
    this.idle = setTimeout(() => {
      if (this.ended || this.phase === "answering" || !this.alert) return;
      this.deps.log.info({ event: "qa.idle_hangup", alertId: this.alert.id }, "no question: hanging up");
      void this.deps.alerts.hangupAlert(this.alert);
    }, this.deps.qaIdleMs ?? 60_000);
    this.idle.unref?.();
  }

  private async onQuestion(alert: AlertRecord, question: string): Promise<void> {
    if (this.ended || this.streamSid === null) return;
    if (this.phase === "answering") this.bargeIn();
    const turnEnd = Date.now();
    const seq = ++this.answerSeq;
    this.phase = "answering";
    if (this.idle) clearTimeout(this.idle);
    const r = await this.deps.alerts.answerQuestion(alert, question);
    if (seq !== this.answerSeq || this.ended) return; // superseded by a newer question
    const streamSid = this.streamSid;
    const ctx = `a-${seq}`;
    this.currentContext = ctx;
    let first: number | null = null;
    try {
      // docs/05 §9: if the answer cannot start within 6 s, speak nothing.
      await Promise.race([
        this.tts!.speak(r.answer, ctx, (b64) => {
          if (seq !== this.answerSeq || this.phase !== "answering") return;
          if (first === null) {
            first = Date.now() - turnEnd;
            this.deps.log.info({ event: "qa.answer", alertId: alert.id, seq, ms: first, modelMs: r.modelMs, known: r.known }, "answer started");
          }
          this.send({ event: "media", streamSid, media: { payload: b64 } });
        }),
        new Promise((_, reject) => setTimeout(() => (first === null ? reject(new Error("answer did not start within 6 s")) : undefined), 6000).unref?.()),
      ]);
    } catch (err) {
      this.deps.log.warn({ event: "qa.tts_error", alertId: alert.id, seq, err: err instanceof Error ? err.message : String(err) }, "answer not spoken");
      this.tts?.cancel(ctx);
      this.tts?.close();
      this.tts = this.deps.ttsStream!(); // the next question gets a fresh socket
      if (seq === this.answerSeq) {
        this.phase = "qa";
        this.armIdle();
      }
      return;
    }
    this.deps.alerts.recordQaTurn(alert, seq, question, r, first);
    if (seq === this.answerSeq && this.phase === "answering") this.send({ event: "mark", streamSid, mark: { name: `answer-${seq}` } });
    else if (seq === this.answerSeq) this.armIdle();
  }

  private playBriefing(alert: AlertRecord, streamSid: string): void {
    if (alert.audio !== null) {
      this.sendBriefing(alert, alert.audio, streamSid);
      return;
    }
    // Answered before Sonic finished (the call is dialled in parallel with synthesis): wait for it.
    void (alert.audioPending ?? Promise.resolve(null)).then((audio) => {
      if (this.ended) return;
      if (audio === null) {
        this.deps.log.error({ event: "alert_media.no_audio", alertId: alert.id }, "no briefing audio");
        this.deps.alerts.setStatus(alert, "failed", { lastError: "No briefing audio — call again", force: true });
        return;
      }
      this.sendBriefing(alert, audio, streamSid);
    });
  }

  private sendBriefing(alert: AlertRecord, audio: Buffer, streamSid: string): void {
    const msgs = briefingMessages(streamSid, audio);
    for (const m of msgs) this.send(m);
    this.deps.log.info(
      { event: "alert.briefing_sent", alertId: alert.id, messages: msgs.length, ms: alert.answeredAtMs === null ? null : Date.now() - alert.answeredAtMs },
      "briefing queued to Twilio",
    );
  }

  /** stop or socket close. */
  end(): void {
    if (this.ended) return;
    this.ended = true;
    if (this.idle) clearTimeout(this.idle);
    void this.ink?.close();
    this.tts?.close();
    if (this.alert) this.deps.alerts.onStreamEnded(this.alert);
  }

  get sid(): string | null {
    return this.streamSid;
  }
}
