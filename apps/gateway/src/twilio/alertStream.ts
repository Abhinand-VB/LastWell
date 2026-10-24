// WS /twilio/alert-media (docs/05 §8, up to the `briefing` mark; FEATURE_QA_ENABLED=false hangs up
// after it). Transport-agnostic: the real route and FakeTelephony both drive AlertStreamSession.
import type { Logger } from "pino";
import { TwilioMediaMessage } from "@lastwell/core";
import type { AlertRecord } from "../alerts/alertRegistry.js";
import type { AlertService } from "../alerts/approve.js";
import { briefingMessages, type TwilioOutMessage } from "../tts/audioChunks.js";

export interface AlertStreamDeps {
  alerts: AlertService;
  log: Logger;
  expectedAccountSid: string;
}

export class AlertStreamSession {
  private alert: AlertRecord | null = null;
  private streamSid: string | null = null;
  private ended = false;

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
        this.playBriefing(alert, msg.streamSid);
        return;
      }
      case "mark":
        if (this.alert && msg.mark.name === "briefing") void this.deps.alerts.onBriefingPlayed(this.alert);
        return;
      case "stop":
        this.end();
        return;
      default:
        return; // connected, media (inbound audio: no Q&A yet, D-32), dtmf
    }
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
    if (this.alert) this.deps.alerts.onStreamEnded(this.alert);
  }

  get sid(): string | null {
    return this.streamSid;
  }
}
