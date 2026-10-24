import { afterEach, describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import type { InkSessionEvents } from "@lastwell/stt";
import { createLogger } from "../log.js";
import { MediaStreamSession } from "./mediaStream.js";
import { AlertStreamSession } from "./alertStream.js";
import { FAKE_ACCOUNT_SID } from "./fake.js";
import type { SttSession, SttSessionOptions } from "../stt/sessions.js";
import type { TwilioOutMessage } from "../tts/audioChunks.js";
import { ALLOWED, auth, testGateway, until, type TestGateway } from "../testkit.js";

const log = createLogger("silent");

class ScriptedStt extends EventEmitter<InkSessionEvents> implements SttSession {
  readonly degraded = false;
  audio: Buffer[] = [];
  closed = false;
  constructor(readonly opts: SttSessionOptions) {
    super();
  }
  get speaker() {
    return this.opts.speaker;
  }
  sendAudio(b: Buffer) {
    this.audio.push(b);
  }
  sendSilence() {}
  async close() {
    this.closed = true;
  }
}

let gw: TestGateway | null = null;
afterEach(async () => {
  await gw?.app.close();
  gw = null;
});

const start = (callId: string, accountSid = FAKE_ACCOUNT_SID) => ({
  event: "start",
  sequenceNumber: "1",
  streamSid: "MZ1",
  start: { accountSid, callSid: "CA1", streamSid: "MZ1", tracks: ["inbound", "outbound"], customParameters: { callId }, mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 } },
});

describe("media stream (V-03, mock Twilio socket)", () => {
  function setup(dispatcherTrack = true) {
    gw = testGateway();
    const sessions: ScriptedStt[] = [];
    const closes: number[] = [];
    const call = gw.calls.create({ mode: "phone", callerNumber: "+14155550123" });
    const s = new MediaStreamSession(
      { calls: gw.calls, log, expectedAccountSid: FAKE_ACCOUNT_SID, dispatcherTrack, stt: (o) => {
        const x = new ScriptedStt(o);
        sessions.push(x);
        return x;
      } },
      (code) => closes.push(code),
    );
    return { s, call, sessions, closes };
  }

  it("a start with a wrong accountSid closes with 1008", () => {
    const { s, call, sessions, closes } = setup();
    s.handle(start(call.id, "ACwrong"));
    expect(closes).toEqual([1008]);
    expect(sessions).toHaveLength(0);
  });

  it("a start for an unknown callId closes with 1008", () => {
    const { s, closes } = setup();
    s.handle(start("6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f607"));
    expect(closes).toEqual([1008]);
  });

  it("routes tracks to two sessions; media without track is inbound; finals become utterances with track timestamps", async () => {
    const { s, call, sessions } = setup();
    s.handle({ event: "connected" });
    s.handle(start(call.id));
    expect(call.streamStartedAt).not.toBeNull();
    expect(sessions.map((x) => x.opts.speaker)).toEqual(["caller", "dispatcher"]);
    expect(sessions[0]!.opts).toMatchObject({ encoding: "pcm_mulaw", sampleRate: 8000, profile: "call" });
    s.handle({ event: "media", streamSid: "MZ1", media: { track: "outbound", timestamp: "40", payload: Buffer.from([1]).toString("base64") } });
    s.handle({ event: "media", streamSid: "MZ1", media: { timestamp: "60", payload: Buffer.from([2, 3]).toString("base64") } });
    s.handle({ event: "weird.future" });
    expect(sessions[0]!.audio.map((b) => [...b])).toEqual([[2, 3]]);
    expect(sessions[1]!.audio.map((b) => [...b])).toEqual([[1]]);
    expect(sessions[0]!.opts.getTs()).toBe(60);
    sessions[1]!.emit("final", { text: "911, what is the address?", tStartMs: 0, tEndMs: 40, sttMs: 300 });
    sessions[0]!.emit("final", { text: "He can't lift his coffee cup.", tStartMs: 60, tEndMs: 900, sttMs: 500 });
    expect(call.utterances.map((u) => [u.seq, u.speaker, u.tStartMs])).toEqual([
      [1, "dispatcher", 0],
      [2, "caller", 60],
    ]);
    await until(() => (call.runner?.state.signs.length ?? 0) > 0);
    s.handle({ event: "stop", streamSid: "MZ1" });
    await until(() => call.status === "ended");
    expect(sessions.every((x) => x.closed)).toBe(true);
  });

  it("STT_DISPATCHER_TRACK=false opens only the caller session and drops outbound frames", () => {
    const { s, call, sessions } = setup(false);
    s.handle(start(call.id));
    s.handle({ event: "media", streamSid: "MZ1", media: { track: "outbound", timestamp: "20", payload: "AA==" } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.audio).toHaveLength(0);
  });

  it("socket close without stop ends the call; a degraded session raises stt_degraded", async () => {
    const { s, call, sessions } = setup();
    s.handle(start(call.id));
    sessions[0]!.emit("degraded", { message: "gone", statusCode: null });
    expect(call.runner?.state.warnings).toContain("stt_degraded");
    await s.end();
    expect(call.status).toBe("ended");
  });
});

describe("alert media stream (V-07, mock Twilio socket)", () => {
  it("start → answered; 300 ms silence, media×N in 1280-byte chunks, then the briefing mark; mark echo → briefed → hang-up → completed", async () => {
    gw = testGateway({ telephonySpeed: 0.0001 }); // the fake never answers: this test plays Twilio
    const call = gw.calls.create({ mode: "replay", label: "X", streamStartedNow: true });
    gw.calls.addFinal(call, { speaker: "caller", text: "his words come out all mixed up and he can't lift his coffee cup", tStartMs: 0, tEndMs: 1000 });
    await until(() => call.runner?.state.level !== "none");
    const res = await gw.app.inject({ method: "POST", url: `/api/calls/${call.id}/alert`, headers: auth, payload: { targetPhone: ALLOWED, confirm: true } });
    expect(res.statusCode).toBe(200);
    const alertId = res.json().alert.id as string;
    const alert = gw.alerts.registry.get(alertId)!;
    // Drive the session by hand, like Twilio would.
    const sent: TwilioOutMessage[] = [];
    const closes: number[] = [];
    const s = new AlertStreamSession({ alerts: gw.alerts, log, expectedAccountSid: "ACreal" }, (m) => sent.push(m), (c) => closes.push(c));
    s.handle({ event: "start", streamSid: "MZ9", start: { accountSid: "ACwrong", callSid: "CA9", customParameters: { alertId } } });
    expect(closes).toEqual([1008]);
    const s2 = new AlertStreamSession({ alerts: gw.alerts, log, expectedAccountSid: "ACreal" }, (m) => sent.push(m), (c) => closes.push(c));
    s2.handle({ event: "start", streamSid: "MZ9", start: { accountSid: "ACreal", callSid: "CA9", customParameters: { alertId } } });
    expect(alert.status).toBe("answered");
    const kinds = sent.map((m) => m.event);
    expect(kinds.at(-1)).toBe("mark");
    expect(kinds.slice(0, -1).every((k) => k === "media")).toBe(true);
    expect(sent.at(-1)).toEqual({ event: "mark", streamSid: "MZ9", mark: { name: "briefing" } });
    const payloads = sent.slice(0, -1).map((m) => Buffer.from(m.media!.payload, "base64"));
    expect(payloads[0]!.length).toBe(2400);
    expect(payloads[0]!.every((b) => b === 0xff)).toBe(true);
    expect(payloads.slice(1, -1).every((p) => p.length === 1280)).toBe(true);
    expect(Buffer.concat(payloads.slice(1)).equals(alert.audio!)).toBe(true);
    s2.handle({ event: "mark", streamSid: "MZ9", mark: { name: "briefing" } });
    await until(() => alert.status === "briefed" || alert.status === "completed");
    s2.handle({ event: "stop", streamSid: "MZ9" });
    expect(alert.status).toBe("completed");
  });
});
