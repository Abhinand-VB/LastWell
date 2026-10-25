// In-memory alerts (docs/05 §7–§8): the briefing audio lives here (never in the store), plus the
// status machine shared by the Twilio status callback, the alert media stream and the fake telephony.
import type { AlertStatus, AlertSummary, CaseState, Utterance } from "@lastwell/core";
import { maskNumber } from "../pipeline/callRegistry.js";
import type { AlertRow, QaTurnRow } from "../store/types.js";

export interface AlertRecord {
  id: string;
  callId: string;
  callLabel: string | null;
  targetPhone: string;
  status: AlertStatus;
  briefingText: string;
  caseSnapshot: CaseState;
  transcriptSnapshot: Utterance[];
  twilioCallSid: string | null;
  emsConfirmedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  qaTurns: QaTurnRow[];
  /** µ-law 8 kHz briefing audio; null after a restart (re-synthesized from briefingText on retry). */
  audio: Buffer | null;
  /** Synthesis in flight (the call is dialled in parallel); resolves null on failure. */
  audioPending: Promise<Buffer | null> | null;
  /** Wall ms when the stream `start` arrived (status answered). */
  answeredAtMs: number | null;
  /** When the latest outbound call was placed (for `alert.answered` ms: ring time). */
  dialedAtMs?: number | null;
  /** Dispatcher's note on approve (verbatim, ≤ 200 chars) and whether it was approved below `possible`. */
  note?: string | null;
  override?: boolean;
  /** The note as a dispatcher utterance for Q&A evidence (id used for attribution). */
  noteUtterance?: Utterance | null;
  /** Loaded from the store after a gateway restart (proposed D-57: stored audio is tried first). */
  rehydrated?: boolean;
}

const RANK: Record<AlertStatus, number> = {
  queued: 0,
  calling: 1,
  ringing: 2,
  answered: 3,
  briefed: 4,
  qa: 5,
  completed: 6,
  failed: 6,
};

export const ACTIVE_STATUSES: readonly AlertStatus[] = ["queued", "calling", "ringing", "answered", "briefed", "qa"];

/** Statuses only move forward; `failed`/`completed` are terminal (retry resets explicitly). */
export function canTransition(from: AlertStatus, to: AlertStatus): boolean {
  if (from === to) return false;
  if (from === "completed" || from === "failed") return false;
  return RANK[to] > RANK[from];
}

export function reachedAnswered(s: AlertStatus): boolean {
  return s !== "failed" && RANK[s] >= RANK.answered;
}

export function toSummary(a: AlertRecord | AlertRow): AlertSummary {
  const id = "id" in a ? a.id : a.alertId;
  return {
    id,
    callId: a.callId,
    targetPhoneMasked: maskNumber(a.targetPhone) ?? "",
    status: a.status,
    briefingText: a.briefingText,
    caseSnapshot: a.caseSnapshot,
    emsConfirmedAt: a.emsConfirmedAt,
    createdAt: a.createdAt,
    lastError: a.lastError,
    qaTurns: a.qaTurns.map((t) => ({ seq: t.seq, question: t.question, answer: t.answer, known: t.known })),
  };
}

export class AlertRegistry {
  private alerts = new Map<string, AlertRecord>();

  add(a: AlertRecord): void {
    this.alerts.set(a.id, a);
  }
  get(id: string): AlertRecord | undefined {
    return this.alerts.get(id);
  }
  bySid(sid: string): AlertRecord | undefined {
    for (const a of this.alerts.values()) if (a.twilioCallSid === sid) return a;
    return undefined;
  }
  forCall(callId: string): AlertRecord[] {
    return [...this.alerts.values()].filter((a) => a.callId === callId);
  }
  list(): AlertRecord[] {
    return [...this.alerts.values()];
  }
  delete(id: string): void {
    this.alerts.delete(id);
  }
}
