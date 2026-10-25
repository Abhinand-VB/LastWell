// Proposed D-57: the stroke-team board reads Convex directly with a live query (useQuery), behind
// NEXT_PUBLIC_BOARD_LIVE=convex. The browser never sees INTERNAL_API_KEY: the gateway mints a
// short-lived board token (GET /api/board-token, behind x-internal-key like /api/ws-token) and
// writes it here with `issueToken`. `listAlerts` accepts only a stored, unexpired token.
//
// Why a token table instead of an HMAC: Convex re-runs a subscribed query only when data it read
// changes, never because time passed. A scheduled mutation deletes each token at its expiry; the
// query read that row, so every subscription holding it re-runs at once and gets `unauthorized`.
// Same random-token shape and TTL as the gateway's WebSocket tokens (docs/03 §5), and no new
// deployment secret: issuing reuses the existing INTERNAL_API_KEY check.
import { v } from "convex/values";
import { makeFunctionReference, paginationOptsValidator, type GenericDatabaseReader } from "convex/server";
import { assertSecret, internalMutation, mutation, query, type DataModel } from "./lib.js";

export const BOARD_TOKEN_TTL_MS = 600_000;
/** The board shows the last 24 h; this bounds the read if a demo ever produces more. */
const MAX_ALERTS = 100;
const MAX_QA_TURNS = 50;

const expireTokenRef = makeFunctionReference<"mutation", { token: string }, null>("board:expireToken");

/** Gateway only: store a fresh random token; it stops working after BOARD_TOKEN_TTL_MS. */
export const issueToken = mutation({
  args: { secret: v.string(), token: v.string() },
  handler: async (ctx, { secret, token }) => {
    assertSecret(secret);
    if (!/^[0-9a-f]{64}$/.test(token)) throw new Error("bad token");
    const expiresAtMs = Date.now() + BOARD_TOKEN_TTL_MS;
    await ctx.db.insert("boardTokens", { token, expiresAtMs });
    await ctx.scheduler.runAt(expiresAtMs, expireTokenRef, { token });
    return { expiresAtMs };
  },
});

export const expireToken = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    for (const row of await ctx.db.query("boardTokens").withIndex("by_token", (q) => q.eq("token", token)).take(10)) {
      await ctx.db.delete(row._id);
    }
    return null;
  },
});

async function tokenValid(db: GenericDatabaseReader<DataModel>, token: string): Promise<boolean> {
  if (token === "") return false;
  const row = await db.query("boardTokens").withIndex("by_token", (q) => q.eq("token", token)).first();
  // The expiry check backs up the scheduled delete (e.g. if the scheduler runs late).
  return row !== null && row.expiresAtMs > Date.now();
}

function maskNumber(n: string): string {
  return n === "" ? "" : `•••${n.slice(-4)}`;
}

/**
 * Everything the board renders: AlertSummary (docs/03 §5, same mapping as the gateway's toSummary)
 * plus the call label (TEST, replay script id) that the ws path fetches from GET /api/calls.
 * Alerts created at or after `sinceMs` (the client passes now − 24 h), newest first.
 */
export const listAlerts = query({
  args: { token: v.string(), sinceMs: v.number() },
  handler: async (ctx, { token, sinceMs }) => {
    if (!(await tokenValid(ctx.db, token))) return { ok: false as const, error: "unauthorized" as const };
    const rows = await ctx.db
      .query("alerts")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", sinceMs))
      .order("desc")
      .take(MAX_ALERTS);
    const labels = new Map<string, string | null>();
    const items = [];
    for (const a of rows) {
      if (!labels.has(a.callId)) {
        const call = await ctx.db.query("calls").withIndex("by_callId", (q) => q.eq("callId", a.callId)).first();
        labels.set(a.callId, call?.label ?? null);
      }
      const qaTurns = await ctx.db
        .query("qaTurns")
        .withIndex("by_alert_seq", (q) => q.eq("alertId", a.alertId))
        .take(MAX_QA_TURNS);
      items.push({
        label: labels.get(a.callId) ?? null,
        alert: {
          id: a.alertId,
          callId: a.callId,
          targetPhoneMasked: maskNumber(a.targetPhone),
          status: a.status,
          briefingText: a.briefingText,
          caseSnapshot: a.caseSnapshot,
          emsConfirmedAt: a.emsConfirmedAt,
          createdAt: a.createdAt,
          lastError: a.lastError,
          qaTurns: qaTurns.map((t) => ({ seq: t.seq, question: t.question, answer: t.answer, known: t.known })),
        },
      });
    }
    return { ok: true as const, items };
  },
});

type Ref = { quote?: unknown; tMs?: unknown; speaker?: unknown } | null | undefined;
const str = (x: unknown): string | null => (typeof x === "string" ? x : null);
const num = (x: unknown): number | null => (typeof x === "number" ? x : null);
const list = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? (x as Record<string, unknown>[]) : []);
const quoteOf = (r: Ref) => ({ quote: str(r?.quote) ?? "", tMs: num(r?.tMs) ?? 0 });

/**
 * Quoted evidence from a CaseState: level, signs, facts, LKW and look-alikes, each with its verbatim
 * quote and call time. Never the transcript, the dispatcher's next question, the summary or phone
 * numbers; the address fact stays with dispatch. Shared by the evidence page and the history export.
 */
function quotedEvidence(state: unknown) {
  const s = (state ?? {}) as Record<string, unknown>;
  const lkw = (s.lkw ?? null) as (Record<string, unknown> & { ref?: Ref }) | null;
  return {
    level: str(s.level) ?? "none",
    signs: list(s.signs).map((x) => ({ kind: str(x.kind) ?? "", ...quoteOf(x.ref as Ref) })),
    // The address stays with dispatch: the stroke team never needs it.
    facts: list(s.facts).filter((x) => x.kind !== "address").map((x) => ({ kind: str(x.kind) ?? "", value: str(x.value) ?? "", ...quoteOf(x.ref as Ref) })),
    lkw: lkw === null ? null : { display: str(lkw.display) ?? "", lkwAt: str(lkw.lkwAt), ...quoteOf(lkw.ref) },
    lookalikes: list(s.lookalikes).map((x) => ({ name: str(x.name) ?? "", ref: x.ref ? quoteOf(x.ref as Ref) : null })),
  };
}

/**
 * The stroke team's live evidence page for one call: only quoted evidence from the current CaseState
 * (level, signs, facts, last known well, look-alikes, each with its verbatim quote and call time),
 * never the transcript, the dispatcher's next question or phone numbers. Only for calls the
 * dispatcher has sent to the stroke team (at least one alert). Re-runs as the gateway writes new
 * case states while the caller is still on the line. The address fact is never returned.
 */
export const callEvidence = query({
  args: { token: v.string(), callId: v.string() },
  handler: async (ctx, { token, callId }) => {
    if (!(await tokenValid(ctx.db, token))) return { ok: false as const, error: "unauthorized" as const };
    const alerts = await ctx.db.query("alerts").withIndex("by_callId", (q) => q.eq("callId", callId)).take(10);
    const call = await ctx.db.query("calls").withIndex("by_callId", (q) => q.eq("callId", callId)).first();
    if (alerts.length === 0 || call === null) return { ok: false as const, error: "not_found" as const };
    const row = await ctx.db.query("caseStates").withIndex("by_callId", (q) => q.eq("callId", callId)).first();
    const s = (row?.state ?? {}) as Record<string, unknown>;
    const ev = quotedEvidence(row?.state);
    return {
      ok: true as const,
      evidence: {
        callId,
        label: call.label,
        callStatus: call.status,
        startedAt: call.startedAt,
        level: ev.level,
        version: num(s.version) ?? 0,
        updatedAt: str(s.updatedAt) ?? call.startedAt,
        signs: ev.signs,
        facts: ev.facts,
        lkw: ev.lkw,
        lookalikes: ev.lookalikes,
        alerts: alerts
          .map((a) => ({ id: a.alertId, status: a.status, createdAt: a.createdAt, emsConfirmedAt: a.emsConfirmedAt }))
          .sort((x, y) => y.createdAt.localeCompare(x.createdAt)),
      },
    };
  },
});

/**
 * Board history export: past alerts with _creationTime in [sinceMs, untilMs), newest first, one page at
 * a time (Convex pagination; the client walks the pages). Each row is the alert's status plus the quoted
 * evidence of its approval-time snapshot (what the stroke team was briefed on). Same board token and the
 * same privacy rules as the evidence page: no transcript, briefing text, phone numbers or address.
 */
export const alertHistory = query({
  args: { token: v.string(), sinceMs: v.number(), untilMs: v.number(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { token, sinceMs, untilMs, paginationOpts }) => {
    if (!(await tokenValid(ctx.db, token))) return { ok: false as const, error: "unauthorized" as const };
    const page = await ctx.db
      .query("alerts")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", sinceMs).lt("_creationTime", untilMs))
      .order("desc")
      .paginate(paginationOpts);
    const labels = new Map<string, string | null>();
    const rows = [];
    for (const a of page.page) {
      if (!labels.has(a.callId)) {
        const call = await ctx.db.query("calls").withIndex("by_callId", (q) => q.eq("callId", a.callId)).first();
        labels.set(a.callId, call?.label ?? null);
      }
      rows.push({
        alertId: a.alertId,
        callId: a.callId,
        label: labels.get(a.callId) ?? null,
        createdAt: a.createdAt,
        status: a.status,
        emsConfirmedAt: a.emsConfirmedAt,
        ...quotedEvidence(a.caseSnapshot),
      });
    }
    return { ok: true as const, rows, isDone: page.isDone, continueCursor: page.continueCursor };
  },
});
