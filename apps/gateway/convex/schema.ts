// LastWell demo data model on Convex (docs/02 §1). The gateway is the only client; the web app
// never talks to Convex (it reads through the gateway's REST API). Our own uuids (callId,
// alertId, utteranceId) are stored as fields and indexed; Convex's `_id` is internal.
// CaseState / Utterance[] / QuoteRef[] are validated with zod in the gateway before every write
// and stored as opaque JSON (`v.any()`), like the JSONB columns they replace.
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const nullable = <T extends Parameters<typeof v.union>[0]>(x: T) => v.union(x, v.null());

export const callMode = v.union(v.literal("phone"), v.literal("browser"), v.literal("replay"));
export const callStatus = v.union(v.literal("live"), v.literal("ended"), v.literal("failed"));
export const speaker = v.union(v.literal("caller"), v.literal("dispatcher"), v.literal("mixed"));
export const alertStatus = v.union(
  v.literal("queued"),
  v.literal("calling"),
  v.literal("ringing"),
  v.literal("answered"),
  v.literal("briefed"),
  v.literal("qa"),
  v.literal("completed"),
  v.literal("failed"),
);

export default defineSchema({
  calls: defineTable({
    callId: v.string(),
    mode: callMode,
    twilioCallSid: nullable(v.string()),
    callerNumber: nullable(v.string()), // E.164 from Twilio `From`; null in browser/replay mode or when withheld
    label: nullable(v.string()), // "TEST" for smoke-test calls, the script id for replays, else null
    timezone: v.string(),
    startedAt: v.string(), // ISO with offset: webhook time (phone) or creation time (other modes)
    streamStartedAt: nullable(v.string()), // first audio frame; base for tStartMs and LKW saidAt
    endedAt: nullable(v.string()),
    status: callStatus,
    lastError: nullable(v.string()),
  })
    .index("by_callId", ["callId"])
    .index("by_label", ["label"]),

  utterances: defineTable({
    utteranceId: v.string(),
    callId: v.string(),
    seq: v.number(), // 1-based, per call, assigned by the gateway
    speaker,
    text: v.string(),
    tStartMs: v.number(), // ms since streamStartedAt
    tEndMs: v.number(),
  }).index("by_call_seq", ["callId", "seq"]),

  caseStates: defineTable({
    callId: v.string(),
    version: v.number(), // monotonically increasing; older writes are ignored
    state: v.any(), // CaseState (docs/03 §3), validated before write
    fastPassMs: nullable(v.number()),
    reasonerMs: nullable(v.number()),
    lastError: nullable(v.string()),
    updatedAt: v.string(),
  }).index("by_callId", ["callId"]),

  alerts: defineTable({
    alertId: v.string(),
    callId: v.string(),
    targetPhone: v.string(), // E.164
    status: alertStatus,
    briefingText: v.string(), // exactly what Sonic read
    caseSnapshot: v.any(), // CaseState at approval time
    transcriptSnapshot: v.any(), // Utterance[] at approval time; the Q&A reads this, not the live registry
    twilioCallSid: nullable(v.string()),
    smsSid: nullable(v.string()), // only when ALERT_SMS_ENABLED
    emsConfirmedAt: nullable(v.string()),
    lastError: nullable(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_alertId", ["alertId"])
    .index("by_callId", ["callId"]),

  qaTurns: defineTable({
    alertId: v.string(),
    seq: v.number(),
    question: v.string(), // Ink 2 transcript of the neurologist's turn
    answer: v.string(), // what Sonic read (fallback phrase included)
    known: v.boolean(), // false → fallback phrase was used
    evidence: v.any(), // validated QuoteRef[] (docs/03 §2)
    ms: nullable(v.number()), // turn.end → first audio chunk sent
  }).index("by_alert_seq", ["alertId", "seq"]),
});
