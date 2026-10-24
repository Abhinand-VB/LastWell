// @vitest-environment edge-runtime
// The Convex functions in ../../convex, run in memory with convex-test (no deployment needed).
import { convexTest } from "convex-test";
import { api } from "./convexApi.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema.js";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

// convex-test locates the functions relative to convex/_generated, which only `npx convex dev`
// creates (S-06). A stand-in entry marks the directory until then.
const modules = {
  ...import.meta.glob("../../convex/**/*.ts"),
  "../../convex/_generated/api.js": async () => ({}),
};

const SECRET = "test-secret";
const s = { secret: SECRET };

const CALL = "6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f607";
const TEST_CALL = "7e570000-0000-4000-8000-000000000000";
const ALERT = "9e8d7c6b-5a49-4382-a716-05f4e3d2c1b0";

function call(callId: string, label: string | null = null) {
  return {
    callId,
    mode: "phone" as const,
    twilioCallSid: "CA123",
    callerNumber: "+14155550123",
    label,
    timezone: "America/Los_Angeles",
    startedAt: "2026-10-25T14:47:00-07:00",
  };
}

function utt(callId: string, seq: number) {
  return { utteranceId: `u-${callId}-${seq}`, callId, seq, speaker: "caller" as const, text: `utterance ${seq}`, tStartMs: seq * 1000, tEndMs: seq * 1000 + 500 };
}

describe("convex store (docs/02)", () => {
  beforeEach(() => vi.stubEnv("INTERNAL_API_KEY", SECRET));
  afterEach(() => vi.unstubAllEnvs());

  it("rejects a wrong secret and fails closed without INTERNAL_API_KEY", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.store.insertCall, { secret: "nope", call: call(CALL) })).rejects.toThrow(/unauthorized/);
    await expect(t.query(api.store.listCalls, { secret: "nope" })).rejects.toThrow(/unauthorized/);
    vi.stubEnv("INTERNAL_API_KEY", "");
    await expect(t.query(api.store.listCalls, { secret: "" })).rejects.toThrow(/unauthorized/);
  });

  it("writes a call through its lifecycle and reads it back as a snapshot", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.store.insertCall, { ...s, call: call(CALL) });
    await t.mutation(api.store.insertCall, { ...s, call: call(CALL) }); // idempotent
    await t.mutation(api.store.patchCall, { ...s, callId: CALL, patch: { streamStartedAt: "2026-10-25T14:47:01-07:00" } });
    await t.mutation(api.store.insertUtterance, { ...s, utterance: utt(CALL, 2) });
    await t.mutation(api.store.insertUtterance, { ...s, utterance: utt(CALL, 1) });
    await t.mutation(api.store.insertUtterance, { ...s, utterance: utt(CALL, 1) }); // (callId, seq) unique

    const state = (version: number, level: string) => ({ ...s, callId: CALL, version, state: { version, level }, fastPassMs: 800, reasonerMs: null, updatedAt: "2026-10-25T14:47:10-07:00" });
    expect(await t.mutation(api.store.upsertCaseState, state(1, "possible"))).toBe(true);
    expect(await t.mutation(api.store.upsertCaseState, state(3, "likely"))).toBe(true);
    expect(await t.mutation(api.store.upsertCaseState, state(2, "possible"))).toBe(false); // older version ignored

    await t.mutation(api.store.insertAlert, {
      ...s,
      alert: { alertId: ALERT, callId: CALL, targetPhone: "+14155550123", status: "queued", briefingText: "Stroke pre-alert…", caseSnapshot: { level: "likely" }, transcriptSnapshot: [], twilioCallSid: null, createdAt: "2026-10-25T14:48:00-07:00" },
    });
    expect(await t.mutation(api.store.patchAlert, { ...s, alertId: ALERT, updatedAt: "2026-10-25T14:48:05-07:00", patch: { status: "ringing", twilioCallSid: "CA999" } })).toBe(true);
    await t.mutation(api.store.insertQaTurn, { ...s, turn: { alertId: ALERT, seq: 1, question: "Is he on blood thinners?", answer: "Yes, Eliquis.", known: true, evidence: [], ms: 900 } });
    await t.mutation(api.store.setCallError, { ...s, callId: CALL, lastError: "boom" });
    await t.mutation(api.store.patchCall, { ...s, callId: CALL, patch: { endedAt: "2026-10-25T14:49:00-07:00", status: "ended" } });

    const snap = await t.query(api.store.getCall, { ...s, callId: CALL });
    if (snap === null) throw new Error("call not found");
    expect(snap.call).toMatchObject({ callId: CALL, status: "ended", streamStartedAt: "2026-10-25T14:47:01-07:00", lastError: "boom" });
    expect(snap.utterances.map((u) => u.seq)).toEqual([1, 2]);
    expect(snap.caseState).toMatchObject({ version: 3, state: { level: "likely" }, lastError: "boom" });
    expect(snap.alerts).toHaveLength(1);
    expect(snap.alerts[0]).toMatchObject({ status: "ringing", twilioCallSid: "CA999", updatedAt: "2026-10-25T14:48:05-07:00" });
    expect(snap.alerts[0]?.qaTurns).toHaveLength(1);

    const list = await t.query(api.store.listCalls, s);
    expect(list).toHaveLength(1);
    expect(list[0]?.level).toBe("likely");
    expect(await t.query(api.store.getCall, { ...s, callId: "unknown" })).toBeNull();
    expect(await t.query(api.store.listAlerts, { ...s, sinceMs: 0 })).toHaveLength(1);
    expect(await t.query(api.store.listAlerts, { ...s, sinceMs: Date.now() + 60_000 })).toHaveLength(0);
  });

  it("deleteTestCalls removes only TEST calls with everything attached", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.store.insertCall, { ...s, call: call(CALL) });
    await t.mutation(api.store.insertCall, { ...s, call: { ...call(TEST_CALL, "TEST"), mode: "replay", callerNumber: null } });
    await t.mutation(api.store.insertUtterance, { ...s, utterance: utt(TEST_CALL, 1) });
    await t.mutation(api.store.insertAlert, {
      ...s,
      alert: { alertId: "a-test", callId: TEST_CALL, targetPhone: "+14155550123", status: "queued", briefingText: "Test", caseSnapshot: {}, transcriptSnapshot: [], twilioCallSid: null, createdAt: "2026-10-25T06:00:00-07:00" },
    });
    await t.mutation(api.store.insertQaTurn, { ...s, turn: { alertId: "a-test", seq: 1, question: "q", answer: "a", known: false, evidence: [], ms: null } });

    expect(await t.mutation(api.store.deleteTestCalls, s)).toEqual({ deletedCalls: 1, deletedAlerts: 1, alertIds: ["a-test"] });
    expect(await t.query(api.store.getCall, { ...s, callId: TEST_CALL })).toBeNull();
    expect(await t.query(api.store.getCall, { ...s, callId: CALL })).not.toBeNull();
    expect(await t.query(api.store.listAlerts, { ...s, sinceMs: 0 })).toHaveLength(0);
  });

  it("wipe empties every table", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.store.insertCall, { ...s, call: call(CALL) });
    await t.mutation(api.store.insertUtterance, { ...s, utterance: utt(CALL, 1) });
    expect(await t.mutation(api.store.wipe, { ...s, batch: 1 })).toEqual({ deleted: 2, remaining: 0 });
    expect(await t.query(api.store.listCalls, s)).toEqual([]);
  });
});
