// Outbound briefing calls (docs/05 §7) behind TelephonyClient (docs/10 §4). Real: Twilio REST.
// Both implementations refuse numbers outside ALERT_ALLOWED_NUMBERS (D-35), as a second line behind
// the 409 in the approve route.
import twilio from "twilio";
import { alertTwiml } from "./twiml.js";

export class NotAllowedError extends Error {
  constructor(to: string) {
    super(`${to} is not in ALERT_ALLOWED_NUMBERS`);
    this.name = "NotAllowedError";
  }
}

export interface PlaceCallRequest {
  to: string;
  alertId: string;
}

export interface TelephonyClient {
  readonly fake: boolean;
  /** Dial `to` with the <Connect><Stream> briefing TwiML; resolves with the call sid once Twilio accepted it. */
  placeCall(req: PlaceCallRequest): Promise<{ sid: string }>;
  /** End a call (G-07: the only way to end a bidirectional stream). */
  endCall(sid: string): Promise<void>;
}

export function assertAllowed(allowed: readonly string[], to: string): void {
  if (!allowed.includes(to)) throw new NotAllowedError(to);
}

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  from: string;
  publicBaseUrl: string;
  allowed: readonly string[];
}

export class TwilioTelephony implements TelephonyClient {
  readonly fake = false;
  private readonly client: ReturnType<typeof twilio>;

  constructor(private readonly cfg: TwilioConfig) {
    this.client = twilio(cfg.accountSid, cfg.authToken, { timeout: 10_000 });
  }

  async placeCall(req: PlaceCallRequest): Promise<{ sid: string }> {
    assertAllowed(this.cfg.allowed, req.to);
    const call = await this.client.calls.create({
      to: req.to,
      from: this.cfg.from,
      timeout: 25,
      twiml: alertTwiml(this.cfg.publicBaseUrl, req.alertId),
      statusCallback: `${this.cfg.publicBaseUrl}/twilio/alert-status`,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      statusCallbackMethod: "POST",
    });
    return { sid: call.sid };
  }

  async endCall(sid: string): Promise<void> {
    await this.client.calls(sid).update({ status: "completed" });
  }
}
