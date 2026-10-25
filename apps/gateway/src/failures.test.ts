// docs/05 §9 failure rows not covered elsewhere, and the latency log lines the corner readout and the
// rehearsal notes read (docs/01 §10, docs/08 rehearsal step 5).
import { afterEach, describe, expect, it } from "vitest";
import { ALLOWED, auth, captureLog, testGateway, until, type TestGateway } from "./testkit.js";
import { stats } from "./pipeline/callRunner.js";
import type { Store } from "./store/types.js";
import type { FakeSttSession, SttSessionOptions } from "./stt/sessions.js";

let gw: TestGateway | null = null;
afterEach(async () => {
  await gw?.app.close();
  gw = null;
});

async function likelyCall(g: TestGateway) {
  const call = g.calls.create({ mode: "phone", label: "dev", streamStartedNow: true });
  g.calls.addFinal(call, { speaker: "caller", text: "It's my father, he's 78.", tStartMs: 0, tEndMs: 900, sttMs: 310 });
  g.calls.addFinal(call, { speaker: "caller", text: "His words come out all mixed up and he can't lift his coffee cup.", tStartMs: 1000, tEndMs: 2000, sttMs: 420 });
  await until(() => g.calls.registry.get(call.id)?.runner?.state.level === "likely");
  return call;
}

const approve = (g: TestGateway, callId: string) =>
  g.app.inject({ method: "POST", url: `/api/calls/${callId}/alert`, headers: auth, payload: { targetPhone: ALLOWED, confirm: true } });

describe("failure handling (docs/05 §9)", () => {
  it("Ink 401/403 → /healthz cartesia degraded; other degradations leave it ok", async () => {
    gw = testGateway();
    const health = async () => (await gw!.app.inject({ method: "GET", url: "/healthz" })).json().cartesia;
    const opts: SttSessionOptions = { speaker: "caller", encoding: "pcm_mulaw", sampleRate: 8000, profile: "call", getTs: () => 0 };
    const open = () => gw!.stt(opts) as FakeSttSession; // testGateway fakes STT
    open().emit("degraded", { message: "network", statusCode: null });
    expect(await health()).toBe("ok");
    open().emit("degraded", { message: "Unexpected server response: 401", statusCode: 401 });
    expect(await health()).toBe("degraded");
  });

  it("outbound no-answer / busy → failed with the reason; Call again re-dials; the old call's callbacks are ignored", async () => {
    gw = testGateway({ telephonySpeed: 0.0001 }); // the fake never progresses: this test plays Twilio's callbacks
    const call = await likelyCall(gw);
    const alert = gw.alerts.registry.get((await approve(gw, call.id)).json().alert.id)!;
    expect(alert.status).toBe("calling");
    const first = alert.twilioCallSid!;
    gw.alerts.onTwilioStatus(first, "ringing");
    gw.alerts.onTwilioStatus(first, "no-answer");
    expect(alert).toMatchObject({ status: "failed", lastError: "no-answer" });
    const retry = await gw.app.inject({ method: "POST", url: `/api/alerts/${alert.id}/retry`, headers: auth, payload: {} });
    expect(retry.json().alert).toMatchObject({ status: "calling", lastError: null });
    expect(alert.twilioCallSid).not.toBe(first);
    gw.alerts.onTwilioStatus(first, "completed"); // late callback for the superseded call
    expect(alert.status).toBe("calling");
    gw.alerts.onTwilioStatus(alert.twilioCallSid!, "busy");
    expect(alert).toMatchObject({ status: "failed", lastError: "busy" });
    expect(gw.tts.calls).toHaveLength(1); // the retry reused the cached audio
  });

  it("a terminal callback after the phone was answered means completed, not failed", async () => {
    gw = testGateway({ telephonySpeed: 0.0001 });
    const call = await likelyCall(gw);
    const alert = gw.alerts.registry.get((await approve(gw, call.id)).json().alert.id)!;
    gw.alerts.onAnswered(alert);
    gw.alerts.onTwilioStatus(alert.twilioCallSid!, "canceled");
    expect(alert.status).toBe("completed");
  });

  it("Convex down: every store call fails, the call, the card and the briefing still complete; store.error is logged", async () => {
    const down = new Proxy({} as Store, { get: () => async () => Promise.reject(new Error("convex down")) });
    const { log, events } = captureLog();
    gw = testGateway({ store: down, log, telephonySpeed: 1000 });
    const call = await likelyCall(gw);
    const res = await approve(gw, call.id);
    expect(res.statusCode).toBe(200);
    const alert = gw.alerts.registry.get(res.json().alert.id)!;
    await until(() => alert.status === "completed", 5000);
    await gw.calls.end(call);
    expect(events.some((e) => e.event === "store.error" && e.op === "insertUtterance")).toBe(true);
    expect(events.some((e) => e.event === "store.error" && e.op === "insertAlert")).toBe(true);
    const snap = await gw.app.inject({ method: "GET", url: `/api/calls/${call.id}`, headers: auth });
    expect(snap.json().state.level).toBe("likely");
    const board = await gw.app.inject({ method: "GET", url: "/api/alerts?sinceHours=24", headers: auth });
    expect(board.json().alerts.map((a: { id: string }) => a.id)).toEqual([alert.id]);
  });
});

describe("latency logging (docs/01 §10)", () => {
  it("stt.turn_end, fastpass.done and reasoner.done carry callId + integer ms; call end logs a call.latency summary", async () => {
    const { log, events } = captureLog();
    gw = testGateway({ log });
    const call = await likelyCall(gw);
    await gw.calls.end(call);
    const of = (name: string) => events.filter((e) => e.event === name);
    expect(of("stt.turn_end").map((e) => [e.callId, e.ms])).toEqual([
      [call.id, 310],
      [call.id, 420],
    ]);
    for (const name of ["fastpass.done", "reasoner.done"]) {
      expect(of(name).length).toBeGreaterThan(0);
      for (const e of of(name)) expect(e).toMatchObject({ callId: call.id, ms: expect.any(Number) });
      for (const e of of(name)) expect(Number.isInteger(e.ms)).toBe(true);
    }
    const [summary] = of("call.latency");
    expect(summary).toMatchObject({ callId: call.id, sttMs: { n: 2, p50: 310, p95: 420, max: 420 } });
    expect((summary!.fastPassMs as { n: number }).n).toBe(of("fastpass.done").length);
    expect((summary!.reasonerMs as { n: number }).n).toBe(of("reasoner.done").length);
  });

  it("alert.created, alert.answered (ring time) and alert.briefing_done carry ms", async () => {
    const { log, events } = captureLog();
    gw = testGateway({ log, telephonySpeed: 1000 });
    const call = await likelyCall(gw);
    const alert = gw.alerts.registry.get((await approve(gw, call.id)).json().alert.id)!;
    await until(() => alert.status === "completed", 5000);
    for (const name of ["alert.created", "alert.answered", "alert.briefing_done"]) {
      const e = events.find((x) => x.event === name);
      expect(e, name).toMatchObject({ alertId: alert.id, ms: expect.any(Number) });
    }
  });

  it("stats: nearest-rank p50/p95", () => {
    expect(stats([])).toBeNull();
    expect(stats([5])).toEqual({ n: 1, p50: 5, p95: 5, max: 5 });
    expect(stats([400, 100, 300, 200])).toEqual({ n: 4, p50: 200, p95: 400, max: 400 });
    expect(stats(Array.from({ length: 20 }, (_, i) => i + 1))).toMatchObject({ p50: 10, p95: 19, max: 20 });
  });
});
