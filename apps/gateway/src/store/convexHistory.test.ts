// @vitest-environment edge-runtime
// Proposed D-57: board.alertHistory, the board's history export (paginated), in memory with convex-test.
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
const T0 = Date.parse("2026-10-25T05:00:00Z");
const MIN = 60_000;
const U1 = "a0100000-0000-4000-8000-000000000001";

const ref = (quote: string, tMs: number) => ({ quote, tMs, utteranceId: U1, speaker: "caller" });

function snapshot(level: string) {
  return {
    level,
    signs: [{ kind: "speech", ref: ref("his words come out all mixed up", 2000), source: "fast" }],
    facts: [
      { kind: "age", value: "78", ref: ref("he's 78", 1000), source: "fast" },
      { kind: "address", value: "12 Main St", ref: ref("we're at 12 Main St", 500), source: "fast" },
      { kind: "blood_thinner", value: "Eliquis", ref: ref("he takes Eliquis", 9000), source: "fast" },
    ],
    lkw: { phrase: "about 2 PM", ref: ref("He was fine at about 2 PM", 7000), lkwAt: "2026-10-24T14:00:00-07:00", rangeStart: null, rangeEnd: null, confidence: "medium", note: null, display: "2:00 PM (1:45–2:15 PM)", minutesAgo: null },
    lookalikes: [],
    nextQuestion: { kind: "face", text: "Ask him to smile." },
    summary: "Speech trouble since about 2 PM; on Eliquis.",
  };
}

/** One call + one alert, created at T0 + atMin minutes (so _creationTime is ordered). */
async function alertAt(t: ReturnType<typeof convexTest>, n: number, atMin: number, label: string | null) {
  vi.setSystemTime(T0 + atMin * MIN);
  const callId = `c0000000-0000-4000-8000-00000000000${n}`;
  await t.mutation(api.store.insertCall, {
    ...s,
    call: { callId, mode: "phone", twilioCallSid: "CA1", callerNumber: "+14155550123", label, timezone: "America/Los_Angeles", startedAt: new Date(T0 + atMin * MIN).toISOString() },
  });
  await t.mutation(api.store.insertUtterance, { ...s, utterance: { utteranceId: `${callId}-u1`, callId, seq: 1, speaker: "caller", text: "We're at 12 Main St and his words come out all mixed up", tStartMs: 500, tEndMs: 3000 } });
  await t.mutation(api.store.insertAlert, {
    ...s,
    alert: { alertId: `a0000000-0000-4000-8000-00000000000${n}`, callId, targetPhone: "+14155550100", status: "completed", briefingText: "Stroke pre-alert for 12 Main St…", caseSnapshot: snapshot(n === 2 ? "possible" : "likely"), transcriptSnapshot: [{ text: "We're at 12 Main St" }], twilioCallSid: "CA2", createdAt: new Date(T0 + atMin * MIN).toISOString() },
  });
}

async function seed(t: ReturnType<typeof convexTest>) {
  await alertAt(t, 1, 0, "A01");
  await alertAt(t, 2, 10, null);
  await alertAt(t, 3, 20, "TEST");
  vi.setSystemTime(T0 + 30 * MIN);
  await t.mutation(api.board.issueToken, { ...s, token: TOKEN });
}

const page = (numItems: number, cursor: string | null = null) => ({ numItems, cursor });

describe("board.alertHistory (proposed D-57)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("INTERNAL_API_KEY", SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("returns the alerts in [since, until), newest first, with label, status and quoted evidence", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const r = await t.query(api.board.alertHistory, { token: TOKEN, sinceMs: T0, untilMs: T0 + 60 * MIN, paginationOpts: page(50) });
    if (!r.ok) throw new Error(r.error);
    expect(r.isDone).toBe(true);
    expect(r.rows.map((x) => x.label)).toEqual(["TEST", null, "A01"]);
    expect(r.rows[2]).toMatchObject({
      alertId: "a0000000-0000-4000-8000-000000000001",
      status: "completed",
      emsConfirmedAt: null,
      level: "likely",
      signs: [{ kind: "speech", quote: "his words come out all mixed up", tMs: 2000 }],
      facts: [
        { kind: "age", value: "78", quote: "he's 78" },
        { kind: "blood_thinner", value: "Eliquis", quote: "he takes Eliquis" },
      ],
      lkw: { display: "2:00 PM (1:45–2:15 PM)", quote: "He was fine at about 2 PM" },
    });
    expect(r.rows[1]?.level).toBe("possible");

    const window = await t.query(api.board.alertHistory, { token: TOKEN, sinceMs: T0 + 5 * MIN, untilMs: T0 + 15 * MIN, paginationOpts: page(50) });
    expect(window.ok && window.rows.map((x) => x.alertId)).toEqual(["a0000000-0000-4000-8000-000000000002"]);
  });

  it("never exports the transcript, briefing text, phone numbers, address, next question or summary", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const text = JSON.stringify(await t.query(api.board.alertHistory, { token: TOKEN, sinceMs: 0, untilMs: T0 + 60 * MIN, paginationOpts: page(50) }));
    for (const leak of ["12 Main St", "+1415555", "Stroke pre-alert", "Ask him to smile", "Speech trouble since", "transcript", "utteranceId", "CA1", "CA2"]) {
      expect(text).not.toContain(leak);
    }
  });

  it("walks pages with the continue cursor", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const args = { token: TOKEN, sinceMs: 0, untilMs: T0 + 60 * MIN };
    const p1 = await t.query(api.board.alertHistory, { ...args, paginationOpts: page(2) });
    if (!p1.ok) throw new Error(p1.error);
    expect(p1.rows).toHaveLength(2);
    expect(p1.isDone).toBe(false);
    const p2 = await t.query(api.board.alertHistory, { ...args, paginationOpts: page(2, p1.continueCursor) });
    if (!p2.ok) throw new Error(p2.error);
    expect(p2.rows.map((x) => x.label)).toEqual(["A01"]);
    expect(p2.isDone).toBe(true);
  });

  it("a missing, wrong or expired token gets unauthorized, not rows", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const args = { sinceMs: 0, untilMs: T0 + 60 * MIN, paginationOpts: page(50) };
    const unauthorized = { ok: false, error: "unauthorized" };
    expect(await t.query(api.board.alertHistory, { ...args, token: "" })).toEqual(unauthorized);
    expect(await t.query(api.board.alertHistory, { ...args, token: "b".repeat(64) })).toEqual(unauthorized);
    vi.advanceTimersByTime(600_001);
    expect(await t.query(api.board.alertHistory, { ...args, token: TOKEN })).toEqual(unauthorized);
  });
});
