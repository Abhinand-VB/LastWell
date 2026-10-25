// @vitest-environment edge-runtime
// Proposed D-57: board.callEvidence, the stroke team's live evidence page, in memory with convex-test.
import { convexTest } from "convex-test";
import { api } from "./convexApi.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema.js";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const modules = {
  ...import.meta.glob("../../convex/**/*.ts"),
  "../../convex/_generated/api.js": async () => ({}),
};

const SECRET = "test-secret";
const s = { secret: SECRET };
const TOKEN = "a".repeat(64);
const CALL = "6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f607";
const NOT_SENT = "7e570000-0000-4000-8000-000000000000";
const U1 = "a0100000-0000-4000-8000-000000000001";
const U2 = "a0100000-0000-4000-8000-000000000002";

const ref = (quote: string, tMs: number, utteranceId = U1) => ({ quote, tMs, utteranceId, speaker: "caller" });

function state(version: number, extra: { signs?: unknown[]; level?: string } = {}) {
  return {
    callId: CALL,
    version,
    level: extra.level ?? "possible",
    modelLevel: "possible",
    signs: extra.signs ?? [{ kind: "speech", ref: ref("his words come out all mixed up", 2000), source: "fast" }],
    facts: [
      { kind: "age", value: "78", ref: ref("he's 78", 1000), source: "fast" },
      { kind: "address", value: "12 Main St", ref: ref("we're at 12 Main St", 500), source: "fast" },
    ],
    lkw: { phrase: "about 2 PM", ref: ref("He was fine at about 2 PM", 7000), lkwAt: "2026-10-25T14:00:00-07:00", rangeStart: null, rangeEnd: null, confidence: "medium", note: null, display: "2:00 PM (1:45–2:15 PM)", minutesAgo: null },
    lookalikes: [{ name: "low blood sugar", ask: "Is he diabetic?", ref: null }],
    nextQuestion: { kind: "face", text: "Ask him to smile." },
    summary: "Speech trouble since about 2 PM.",
    reasonerQuestion: null,
    droppedCount: 0,
    warnings: [],
    latency: { fastPassMs: 800, reasonerMs: null, sttMs: null },
    updatedAt: `2026-10-25T14:47:${String(version).padStart(2, "0")}-07:00`,
  };
}

async function seed(t: ReturnType<typeof convexTest>) {
  for (const callId of [CALL, NOT_SENT]) {
    await t.mutation(api.store.insertCall, {
      ...s,
      call: { callId, mode: "phone", twilioCallSid: "CA1", callerNumber: "+14155550123", label: "A01", timezone: "America/Los_Angeles", startedAt: "2026-10-25T14:47:00-07:00" },
    });
    await t.mutation(api.store.upsertCaseState, { ...s, callId, version: 1, state: { ...state(1), callId }, fastPassMs: 800, reasonerMs: null, updatedAt: "2026-10-25T14:47:01-07:00" });
    await t.mutation(api.store.insertUtterance, { ...s, utterance: { utteranceId: `${callId}-u1`, callId, seq: 1, speaker: "caller", text: "His words come out all mixed up, we're at 12 Main St", tStartMs: 2000, tEndMs: 3000 } });
  }
  await t.mutation(api.store.insertAlert, {
    ...s,
    alert: { alertId: "9e8d7c6b-5a49-4382-a716-05f4e3d2c1b0", callId: CALL, targetPhone: "+14155550100", status: "calling", briefingText: "Stroke pre-alert…", caseSnapshot: state(1), transcriptSnapshot: [], twilioCallSid: null, createdAt: "2026-10-25T14:48:00-07:00" },
  });
  await t.mutation(api.board.issueToken, { ...s, token: TOKEN });
}

describe("board.callEvidence (proposed D-57)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("INTERNAL_API_KEY", SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("returns only quoted evidence for an alerted call: no transcript, address, phone, briefing or dispatcher question", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const r = await t.query(api.board.callEvidence, { token: TOKEN, callId: CALL });
    if (!r.ok) throw new Error(r.error);
    expect(r.evidence).toMatchObject({
      callId: CALL,
      label: "A01",
      callStatus: "live",
      level: "possible",
      version: 1,
      signs: [{ kind: "speech", quote: "his words come out all mixed up", tMs: 2000 }],
      facts: [{ kind: "age", value: "78", quote: "he's 78", tMs: 1000 }],
      lkw: { display: "2:00 PM (1:45–2:15 PM)", lkwAt: "2026-10-25T14:00:00-07:00", quote: "He was fine at about 2 PM", tMs: 7000 },
      lookalikes: [{ name: "low blood sugar", ref: null }],
      alerts: [{ status: "calling", emsConfirmedAt: null }],
    });
    const text = JSON.stringify(r);
    for (const secret of ["12 Main St", "+1415555", "Stroke pre-alert", "Ask him to smile", "Is he diabetic", "Speech trouble since", "utteranceId"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("follows the call live: a newer case state (new sign, new level) is what the query returns next", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const signs = [
      { kind: "speech", ref: ref("his words come out all mixed up", 2000), source: "fast" },
      { kind: "arms", ref: ref("he can't lift his coffee cup", 9000, U2), source: "fast" },
    ];
    await t.mutation(api.store.upsertCaseState, { ...s, callId: CALL, version: 2, state: state(2, { signs, level: "likely" }), fastPassMs: 700, reasonerMs: null, updatedAt: "2026-10-25T14:47:02-07:00" });
    const r = await t.query(api.board.callEvidence, { token: TOKEN, callId: CALL });
    if (!r.ok) throw new Error(r.error);
    expect(r.evidence.level).toBe("likely");
    expect(r.evidence.signs.map((x) => x.kind)).toEqual(["speech", "arms"]);
  });

  it("a call never sent to the stroke team, or unknown, is not_found; a bad or expired token is unauthorized", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    expect(await t.query(api.board.callEvidence, { token: TOKEN, callId: NOT_SENT })).toEqual({ ok: false, error: "not_found" });
    expect(await t.query(api.board.callEvidence, { token: TOKEN, callId: "unknown" })).toEqual({ ok: false, error: "not_found" });
    expect(await t.query(api.board.callEvidence, { token: "b".repeat(64), callId: CALL })).toEqual({ ok: false, error: "unauthorized" });
    expect(await t.query(api.board.callEvidence, { token: "", callId: CALL })).toEqual({ ok: false, error: "unauthorized" });
    vi.advanceTimersByTime(600_001);
    expect(await t.query(api.board.callEvidence, { token: TOKEN, callId: CALL })).toEqual({ ok: false, error: "unauthorized" });
  });
});
