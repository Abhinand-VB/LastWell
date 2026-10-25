// @vitest-environment edge-runtime
// Proposed D-57: convex/board.ts (board read tokens + the live query), in memory with convex-test.
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
const OTHER = "b".repeat(64);
const TTL_MS = 600_000;

const CALL = "6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f607";
const ALERT = "9e8d7c6b-5a49-4382-a716-05f4e3d2c1b0";

async function seed(t: ReturnType<typeof convexTest>) {
  await t.mutation(api.store.insertCall, {
    ...s,
    call: { callId: CALL, mode: "replay", twilioCallSid: null, callerNumber: null, label: "A01", timezone: "America/Los_Angeles", startedAt: "2026-10-25T14:47:00-07:00" },
  });
  await t.mutation(api.store.insertAlert, {
    ...s,
    alert: { alertId: ALERT, callId: CALL, targetPhone: "+14155550123", status: "queued", briefingText: "Stroke pre-alert…", caseSnapshot: { level: "likely" }, transcriptSnapshot: [], twilioCallSid: null, createdAt: "2026-10-25T14:48:00-07:00" },
  });
}

describe("convex board (proposed D-57)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("INTERNAL_API_KEY", SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("a valid token reads exactly the board's AlertSummary plus the call label", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.mutation(api.store.insertQaTurn, { ...s, turn: { alertId: ALERT, seq: 1, question: "Blood thinners?", answer: "Eliquis.", known: true, evidence: [], ms: 900 } });
    const before = Date.now();
    const { expiresAtMs } = await t.mutation(api.board.issueToken, { ...s, token: TOKEN });
    expect(expiresAtMs).toBeGreaterThanOrEqual(before + TTL_MS);
    expect(expiresAtMs).toBeLessThanOrEqual(Date.now() + TTL_MS + 5); // convex-test nudges its clock by a ms or so

    const r = await t.query(api.board.listAlerts, { token: TOKEN, sinceMs: 0 });
    if (!r.ok) throw new Error("expected data");
    expect(r.items).toEqual([
      {
        label: "A01",
        alert: {
          id: ALERT,
          callId: CALL,
          targetPhoneMasked: "•••0123",
          status: "queued",
          briefingText: "Stroke pre-alert…",
          caseSnapshot: { level: "likely" },
          emsConfirmedAt: null,
          createdAt: "2026-10-25T14:48:00-07:00",
          lastError: null,
          qaTurns: [{ seq: 1, question: "Blood thinners?", answer: "Eliquis.", known: true }],
        },
      },
    ]);
    expect(Object.keys(r.items[0]?.alert ?? {})).not.toContain("targetPhone");
    expect(await t.query(api.board.listAlerts, { token: TOKEN, sinceMs: Date.now() + 60_000 })).toEqual({ ok: true, items: [] });

    // Status changes written through by the gateway show up in the same query.
    await t.mutation(api.store.patchAlert, { ...s, alertId: ALERT, updatedAt: "2026-10-25T14:48:05-07:00", patch: { status: "ringing" } });
    const after = await t.query(api.board.listAlerts, { token: TOKEN, sinceMs: 0 });
    expect(after.ok && after.items[0]?.alert.status).toBe("ringing");
  });

  it("missing, wrong and expired tokens get unauthorized, not data", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.mutation(api.board.issueToken, { ...s, token: TOKEN });
    const unauthorized = { ok: false, error: "unauthorized" };
    expect(await t.query(api.board.listAlerts, { token: "", sinceMs: 0 })).toEqual(unauthorized);
    expect(await t.query(api.board.listAlerts, { token: OTHER, sinceMs: 0 })).toEqual(unauthorized);
    expect(await t.query(api.board.listAlerts, { token: SECRET, sinceMs: 0 })).toEqual(unauthorized);

    // Past expiry the query refuses even before the scheduled delete has run …
    vi.advanceTimersByTime(TTL_MS + 1);
    expect(await t.query(api.board.listAlerts, { token: TOKEN, sinceMs: 0 })).toEqual(unauthorized);
    // … and the scheduled delete removes the row, which re-runs every live subscription holding it.
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.query("boardTokens").collect())).toEqual([]);
    expect(await t.query(api.board.listAlerts, { token: TOKEN, sinceMs: 0 })).toEqual(unauthorized);
  });

  it("a token stays valid until just before its expiry", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.mutation(api.board.issueToken, { ...s, token: TOKEN });
    vi.advanceTimersByTime(TTL_MS - 1);
    expect((await t.query(api.board.listAlerts, { token: TOKEN, sinceMs: 0 })).ok).toBe(true);
  });

  it("only the gateway's secret can issue a token, and only a 64-hex one", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.board.issueToken, { secret: "nope", token: TOKEN })).rejects.toThrow(/unauthorized/);
    await expect(t.mutation(api.board.issueToken, { ...s, token: "short" })).rejects.toThrow(/bad token/);
    vi.stubEnv("INTERNAL_API_KEY", "");
    await expect(t.mutation(api.board.issueToken, { secret: "", token: TOKEN })).rejects.toThrow(/unauthorized/);
    expect(await t.run((ctx) => ctx.db.query("boardTokens").collect())).toEqual([]);
  });
});
