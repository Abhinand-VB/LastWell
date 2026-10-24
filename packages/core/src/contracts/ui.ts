// docs/03 §5 — UI WebSocket `wss://{gateway}/ws/ui`.
import { z } from "zod/v4";
import { CallMode, IsoDateTime, Speaker, Uuid } from "./primitives.js";
import { Utterance } from "./transcript.js";
import { CaseState } from "./caseState.js";

// Client → server (JSON text frames). A plain union: docs/03 writes discriminatedUnion("type"), but
// zod rejects the two "subscribe" variants sharing a discriminator value. Same accepted shapes.
export const UiClientMessage = z.union([
  z.object({ type: z.literal("auth"), token: z.string() }), // first message, always; token from GET /api/ws-token
  z.object({ type: z.literal("subscribe"), scope: z.literal("call"), callId: Uuid }),
  z.object({ type: z.literal("subscribe"), scope: z.literal("board") }),
  z.object({ type: z.literal("unsubscribe"), scope: z.enum(["call", "board"]), callId: Uuid.optional() }),
  z.object({ type: z.literal("ping") }),
]);
export type UiClientMessage = z.infer<typeof UiClientMessage>;

export const CallStatus = z.enum(["live", "ended", "failed"]);
export type CallStatus = z.infer<typeof CallStatus>;

export const CallInfo = z.object({
  id: Uuid,
  mode: CallMode,
  callerNumberMasked: z.string().nullable(),
  startedAt: IsoDateTime,
  endedAt: IsoDateTime.nullable(),
  status: CallStatus,
  timezone: z.string(),
  label: z.string().nullable(), // "TEST" for smoke-test calls, the script id for replays, null otherwise
});
export type CallInfo = z.infer<typeof CallInfo>;

export const AlertStatus = z.enum(["queued", "calling", "ringing", "answered", "briefed", "qa", "completed", "failed"]);
export type AlertStatus = z.infer<typeof AlertStatus>;

export const QaTurnSummary = z.object({
  seq: z.number().int(),
  question: z.string(),
  answer: z.string(),
  known: z.boolean(),
});
export type QaTurnSummary = z.infer<typeof QaTurnSummary>;

export const AlertSummary = z.object({
  id: Uuid,
  callId: Uuid,
  targetPhoneMasked: z.string(),
  status: AlertStatus,
  briefingText: z.string(),
  caseSnapshot: CaseState,
  emsConfirmedAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
  lastError: z.string().nullable(),
  qaTurns: z.array(QaTurnSummary),
});
export type AlertSummary = z.infer<typeof AlertSummary>;

/** Payload of the WS `snapshot` message and of `GET /api/calls/:callId` (docs/03 §6). */
export const CallSnapshot = z.object({
  callId: Uuid,
  call: CallInfo,
  utterances: z.array(Utterance),
  state: CaseState,
  alerts: z.array(AlertSummary),
});
export type CallSnapshot = z.infer<typeof CallSnapshot>;

export const UiErrorCode = z.enum(["unauthorized", "unknown_call", "bad_message"]);
export type UiErrorCode = z.infer<typeof UiErrorCode>;

// Server → client
export const UiServerMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("auth.ok") }),
  z.object({ type: z.literal("error"), code: UiErrorCode, message: z.string() }),
  CallSnapshot.extend({ type: z.literal("snapshot") }),
  z.object({ type: z.literal("board.snapshot"), alerts: z.array(AlertSummary) }),
  z.object({
    type: z.literal("utterance.partial"),
    callId: Uuid,
    speaker: Speaker,
    text: z.string(),
    tStartMs: z.number().int(),
  }),
  z.object({ type: z.literal("utterance.final"), callId: Uuid, utterance: Utterance }),
  z.object({ type: z.literal("state.updated"), callId: Uuid, state: CaseState }),
  z.object({ type: z.literal("alert.updated"), alert: AlertSummary }),
  z.object({ type: z.literal("call.ended"), callId: Uuid, endedAt: IsoDateTime }),
  z.object({ type: z.literal("alert.removed"), alertId: Uuid }), // after DELETE /api/alerts/test
  z.object({ type: z.literal("pong") }),
]);
export type UiServerMessage = z.infer<typeof UiServerMessage>;
