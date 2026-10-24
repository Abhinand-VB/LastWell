// FakeTelephony (docs/10 §4): records the request, checks the allowlist, then plays Twilio's part:
// `ringing` (+1 s), `in-progress` (+2 s) with the alert media stream (start → our media + mark → mark
// echoed after the audio's playback time), and `completed` when the call is ended. No phone is dialled.
import { randomBytes } from "node:crypto";
import type { TwilioOutMessage } from "../tts/audioChunks.js";
import { assertAllowed, type PlaceCallRequest, type TelephonyClient } from "./client.js";

export const FAKE_ACCOUNT_SID = "AC-fake-telephony";

export interface FakeStream {
  handle(json: unknown): void;
  end(): void;
}

export interface FakeTelephonyHooks {
  /** Same entry point as POST /twilio/alert-status. */
  status(sid: string, callStatus: string): void;
  /** Opens an alert media stream session wired to the fake "phone". */
  openStream(send: (m: TwilioOutMessage) => void, close: (code: number, reason: string) => void): FakeStream;
}

interface FakeCall {
  sid: string;
  req: PlaceCallRequest;
  stream: FakeStream | null;
  timers: NodeJS.Timeout[];
  ended: boolean;
  mediaBytes: number;
}

export class FakeTelephony implements TelephonyClient {
  readonly fake = true;
  readonly placed: PlaceCallRequest[] = [];
  readonly sent: Array<{ sid: string; msg: TwilioOutMessage }> = [];
  private hooks: FakeTelephonyHooks | null = null;
  private calls = new Map<string, FakeCall>();

  /** speed > 1 shortens every delay (tests). */
  constructor(
    private readonly allowed: readonly string[],
    private readonly speed = 1,
  ) {}

  bind(hooks: FakeTelephonyHooks): void {
    this.hooks = hooks;
  }

  private later(c: FakeCall, ms: number, f: () => void): void {
    const t = setTimeout(() => {
      if (!c.ended) f();
    }, ms / this.speed);
    t.unref();
    c.timers.push(t);
  }

  async placeCall(req: PlaceCallRequest): Promise<{ sid: string }> {
    assertAllowed(this.allowed, req.to);
    this.placed.push(req);
    const sid = `CA${randomBytes(16).toString("hex")}`;
    const c: FakeCall = { sid, req, stream: null, timers: [], ended: false, mediaBytes: 0 };
    this.calls.set(sid, c);
    this.later(c, 1000, () => this.hooks?.status(sid, "ringing"));
    this.later(c, 2000, () => {
      this.hooks?.status(sid, "in-progress");
      this.answer(c);
    });
    return { sid };
  }

  private answer(c: FakeCall): void {
    if (!this.hooks) return;
    const streamSid = `MZ${randomBytes(16).toString("hex")}`;
    const send = (m: TwilioOutMessage) => {
      if (c.ended) return;
      this.sent.push({ sid: c.sid, msg: m });
      if (m.event === "media" && m.media) c.mediaBytes += Buffer.from(m.media.payload, "base64").length;
      if (m.event === "mark" && m.mark) {
        const name = m.mark.name;
        const playMs = c.mediaBytes / 8;
        c.mediaBytes = 0;
        this.later(c, playMs, () => c.stream?.handle({ event: "mark", streamSid, sequenceNumber: "1", mark: { name } }));
      }
      if (m.event === "clear") c.mediaBytes = 0;
    };
    const close = () => void this.endCall(c.sid);
    c.stream = this.hooks.openStream(send, close);
    c.stream.handle({ event: "connected", protocol: "Call", version: "1.0.0" });
    c.stream.handle({
      event: "start",
      sequenceNumber: "1",
      streamSid,
      start: {
        accountSid: FAKE_ACCOUNT_SID,
        callSid: c.sid,
        streamSid,
        tracks: ["inbound"],
        customParameters: { alertId: c.req.alertId },
        mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 },
      },
    });
  }

  async endCall(sid: string): Promise<void> {
    const c = this.calls.get(sid);
    if (!c || c.ended) return;
    const answered = c.stream !== null;
    c.ended = true;
    for (const t of c.timers) clearTimeout(t);
    if (c.stream) {
      c.stream.handle({ event: "stop", sequenceNumber: "2", streamSid: "fake", stop: { callSid: sid } });
      c.stream.end();
    }
    this.hooks?.status(sid, answered ? "completed" : "canceled");
  }
}
