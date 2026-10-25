// The gateway's store (docs/02 §2–§3): write-through, never on the demo path. Called from
// apps/gateway/src/store/ with ConvexHttpClient (`api.store.*` once `npx convex dev` has generated
// convex/_generated, or `anyApi.store.*` before that).
import { v } from "convex/values";
import type { GenericDatabaseWriter, StorageWriter } from "convex/server";
import { alertStatus, callMode, callStatus, speaker } from "./schema.js";
import { assertSecret, mutation, query, type DataModel } from "./lib.js";

const nullable = <T extends Parameters<typeof v.union>[0]>(x: T) => v.union(x, v.null());

// ---------------------------------------------------------------------------------------------
// Writes (gateway only)

export const insertCall = mutation({
  args: {
    secret: v.string(),
    call: v.object({
      callId: v.string(),
      mode: callMode,
      twilioCallSid: nullable(v.string()),
      callerNumber: nullable(v.string()),
      label: nullable(v.string()),
      timezone: v.string(),
      startedAt: v.string(),
    }),
  },
  handler: async (ctx, { secret, call }) => {
    assertSecret(secret);
    const existing = await ctx.db.query("calls").withIndex("by_callId", (q) => q.eq("callId", call.callId)).unique();
    if (existing !== null) return null;
    await ctx.db.insert("calls", { ...call, streamStartedAt: null, endedAt: null, status: "live", lastError: null });
    return null;
  },
});

export const patchCall = mutation({
  args: {
    secret: v.string(),
    callId: v.string(),
    patch: v.object({
      streamStartedAt: v.optional(v.string()),
      endedAt: v.optional(v.string()),
      status: v.optional(callStatus),
      lastError: v.optional(nullable(v.string())),
    }),
  },
  handler: async (ctx, { secret, callId, patch }) => {
    assertSecret(secret);
    const call = await ctx.db.query("calls").withIndex("by_callId", (q) => q.eq("callId", callId)).unique();
    if (call === null) return false;
    await ctx.db.patch(call._id, patch);
    return true;
  },
});

export const insertUtterance = mutation({
  args: {
    secret: v.string(),
    utterance: v.object({
      utteranceId: v.string(),
      callId: v.string(),
      seq: v.number(),
      speaker,
      text: v.string(),
      tStartMs: v.number(),
      tEndMs: v.number(),
    }),
  },
  handler: async (ctx, { secret, utterance }) => {
    assertSecret(secret);
    // (callId, seq) is unique: a retried write is a no-op.
    const existing = await ctx.db
      .query("utterances")
      .withIndex("by_call_seq", (q) => q.eq("callId", utterance.callId).eq("seq", utterance.seq))
      .unique();
    if (existing === null) await ctx.db.insert("utterances", utterance);
    return null;
  },
});

/** Write-through of CaseState. A write with an older version than the stored one is ignored. */
export const upsertCaseState = mutation({
  args: {
    secret: v.string(),
    callId: v.string(),
    version: v.number(),
    state: v.any(),
    fastPassMs: nullable(v.number()),
    reasonerMs: nullable(v.number()),
    updatedAt: v.string(),
  },
  handler: async (ctx, { secret, ...row }) => {
    assertSecret(secret);
    const existing = await ctx.db.query("caseStates").withIndex("by_callId", (q) => q.eq("callId", row.callId)).unique();
    if (existing === null) {
      await ctx.db.insert("caseStates", { ...row, lastError: null });
      return true;
    }
    if (row.version < existing.version) return false;
    await ctx.db.patch(existing._id, row);
    return true;
  },
});

/** An unhandled error inside one call: recorded on both the call and its case state (docs/02 §2). */
export const setCallError = mutation({
  args: { secret: v.string(), callId: v.string(), lastError: v.string() },
  handler: async (ctx, { secret, callId, lastError }) => {
    assertSecret(secret);
    const call = await ctx.db.query("calls").withIndex("by_callId", (q) => q.eq("callId", callId)).unique();
    if (call !== null) await ctx.db.patch(call._id, { lastError });
    const cs = await ctx.db.query("caseStates").withIndex("by_callId", (q) => q.eq("callId", callId)).unique();
    if (cs !== null) await ctx.db.patch(cs._id, { lastError });
    return null;
  },
});

export const insertAlert = mutation({
  args: {
    secret: v.string(),
    alert: v.object({
      alertId: v.string(),
      callId: v.string(),
      targetPhone: v.string(),
      status: alertStatus,
      briefingText: v.string(),
      caseSnapshot: v.any(),
      transcriptSnapshot: v.any(),
      twilioCallSid: nullable(v.string()),
      createdAt: v.string(),
    }),
  },
  handler: async (ctx, { secret, alert }) => {
    assertSecret(secret);
    const existing = await ctx.db.query("alerts").withIndex("by_alertId", (q) => q.eq("alertId", alert.alertId)).unique();
    if (existing !== null) return null;
    await ctx.db.insert("alerts", { ...alert, smsSid: null, emsConfirmedAt: null, lastError: null, updatedAt: alert.createdAt });
    return null;
  },
});

export const patchAlert = mutation({
  args: {
    secret: v.string(),
    alertId: v.string(),
    updatedAt: v.string(),
    patch: v.object({
      status: v.optional(alertStatus),
      twilioCallSid: v.optional(nullable(v.string())),
      smsSid: v.optional(nullable(v.string())),
      emsConfirmedAt: v.optional(nullable(v.string())),
      lastError: v.optional(nullable(v.string())),
      briefingText: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { secret, alertId, updatedAt, patch }) => {
    assertSecret(secret);
    const alert = await ctx.db.query("alerts").withIndex("by_alertId", (q) => q.eq("alertId", alertId)).unique();
    if (alert === null) return false;
    await ctx.db.patch(alert._id, { ...patch, updatedAt });
    return true;
  },
});

export const insertQaTurn = mutation({
  args: {
    secret: v.string(),
    turn: v.object({
      alertId: v.string(),
      seq: v.number(),
      question: v.string(),
      answer: v.string(),
      known: v.boolean(),
      evidence: v.any(),
      ms: nullable(v.number()),
    }),
  },
  handler: async (ctx, { secret, turn }) => {
    assertSecret(secret);
    const existing = await ctx.db
      .query("qaTurns")
      .withIndex("by_alert_seq", (q) => q.eq("alertId", turn.alertId).eq("seq", turn.seq))
      .unique();
    if (existing === null) await ctx.db.insert("qaTurns", turn);
    return null;
  },
});

async function deleteCallCascade(db: GenericDatabaseWriter<DataModel>, storage: StorageWriter, callId: string): Promise<string[]> {
  const alertIds: string[] = [];
  for (const a of await db.query("alerts").withIndex("by_callId", (q) => q.eq("callId", callId)).collect()) {
    for (const t of await db.query("qaTurns").withIndex("by_alert_seq", (q) => q.eq("alertId", a.alertId)).collect()) {
      await db.delete(t._id);
    }
    alertIds.push(a.alertId);
    if (a.audioStorageId !== undefined) await storage.delete(a.audioStorageId); // proposed D-57
    await db.delete(a._id);
  }
  for (const u of await db.query("utterances").withIndex("by_call_seq", (q) => q.eq("callId", callId)).collect()) {
    await db.delete(u._id);
  }
  for (const s of await db.query("caseStates").withIndex("by_callId", (q) => q.eq("callId", callId)).collect()) {
    await db.delete(s._id);
  }
  for (const c of await db.query("calls").withIndex("by_callId", (q) => q.eq("callId", callId)).collect()) {
    await db.delete(c._id);
  }
  return alertIds;
}

/** `DELETE /api/alerts/test`: removes every call labelled TEST with its alerts, Q&A, utterances and state. */
export const deleteTestCalls = mutation({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertSecret(secret);
    const calls = await ctx.db.query("calls").withIndex("by_label", (q) => q.eq("label", "TEST")).collect();
    const alertIds: string[] = [];
    for (const c of calls) alertIds.push(...(await deleteCallCascade(ctx.db, ctx.storage, c.callId)));
    return { deletedCalls: calls.length, deletedAlerts: alertIds.length, alertIds };
  },
});

const TABLES = ["qaTurns", "alerts", "utterances", "caseStates", "calls"] as const;

/** M-07 teardown: deletes up to `batch` documents per table; run until `remaining` is 0. */
export const wipe = mutation({
  args: { secret: v.string(), batch: v.optional(v.number()) },
  handler: async (ctx, { secret, batch }) => {
    assertSecret(secret);
    const n = Math.min(Math.max(1, batch ?? 500), 1000);
    let deleted = 0;
    for (const table of TABLES) {
      for (const doc of await ctx.db.query(table).take(n)) {
        if ("audioStorageId" in doc && doc.audioStorageId !== undefined) await ctx.storage.delete(doc.audioStorageId); // proposed D-57
        await ctx.db.delete(doc._id);
        deleted++;
      }
    }
    let remaining = 0;
    for (const table of TABLES) remaining += (await ctx.db.query(table).take(1)).length;
    return { deleted, remaining };
  },
});

// ---------------------------------------------------------------------------------------------
// Reads (gateway REST: GET /api/calls, /api/calls/:id, /api/alerts — docs/02 §3)

/** Recent calls (newest first) with the current level from their case state. */
export const listCalls = query({
  args: { secret: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { secret, limit }) => {
    assertSecret(secret);
    const calls = await ctx.db.query("calls").order("desc").take(Math.min(Math.max(1, limit ?? 20), 100));
    const out = [];
    for (const call of calls) {
      const cs = await ctx.db.query("caseStates").withIndex("by_callId", (q) => q.eq("callId", call.callId)).unique();
      const level: unknown = cs?.state?.level;
      out.push({ call, level: level === "possible" || level === "likely" ? level : "none" });
    }
    return out;
  },
});

/** One call with utterances (by seq), case state and alerts (each with its Q&A turns). Null when unknown. */
export const getCall = query({
  args: { secret: v.string(), callId: v.string() },
  handler: async (ctx, { secret, callId }) => {
    assertSecret(secret);
    const call = await ctx.db.query("calls").withIndex("by_callId", (q) => q.eq("callId", callId)).unique();
    if (call === null) return null;
    const utterances = await ctx.db.query("utterances").withIndex("by_call_seq", (q) => q.eq("callId", callId)).collect();
    const caseState = await ctx.db.query("caseStates").withIndex("by_callId", (q) => q.eq("callId", callId)).unique();
    const alerts = [];
    for (const a of await ctx.db.query("alerts").withIndex("by_callId", (q) => q.eq("callId", callId)).collect()) {
      const qaTurns = await ctx.db.query("qaTurns").withIndex("by_alert_seq", (q) => q.eq("alertId", a.alertId)).collect();
      alerts.push({ ...a, qaTurns });
    }
    return { call, utterances, caseState, alerts };
  },
});

/** Board initial load: alerts created at or after `sinceMs` (epoch ms; the gateway passes now − sinceHours), newest first. */
export const listAlerts = query({
  args: { secret: v.string(), sinceMs: v.number() },
  handler: async (ctx, { secret, sinceMs }) => {
    assertSecret(secret);
    const alerts = await ctx.db
      .query("alerts")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", sinceMs))
      .order("desc")
      .collect();
    const out = [];
    for (const a of alerts) {
      const qaTurns = await ctx.db.query("qaTurns").withIndex("by_alert_seq", (q) => q.eq("alertId", a.alertId)).collect();
      out.push({ ...a, qaTurns });
    }
    return out;
  },
});
