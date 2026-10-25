// The gateway's store surface (docs/02 §2–§3). Real: Convex (convex.ts). Fake: MemoryStore (memory.ts).
// The in-memory registries are the source of truth during a call; the store is write-through history.
import type { AlertSummary, CallMode, CaseState, Level, Utterance } from "@lastwell/core";

export type CallStatus = "live" | "ended" | "failed";
export type AlertStatus = AlertSummary["status"];

export interface NewCall {
  callId: string;
  mode: CallMode;
  twilioCallSid: string | null;
  callerNumber: string | null;
  label: string | null;
  timezone: string;
  startedAt: string;
}

export interface CallRow extends NewCall {
  streamStartedAt: string | null;
  endedAt: string | null;
  status: CallStatus;
  lastError: string | null;
}

export interface CallPatch {
  streamStartedAt?: string;
  endedAt?: string;
  status?: CallStatus;
  lastError?: string | null;
}

export interface QaTurnRow {
  alertId: string;
  seq: number;
  question: string;
  answer: string;
  known: boolean;
  evidence: unknown;
  ms: number | null;
}

export interface NewAlert {
  alertId: string;
  callId: string;
  targetPhone: string;
  status: AlertStatus;
  briefingText: string;
  caseSnapshot: CaseState;
  transcriptSnapshot: Utterance[];
  twilioCallSid: string | null;
  createdAt: string;
}

export interface AlertRow extends NewAlert {
  emsConfirmedAt: string | null;
  lastError: string | null;
  updatedAt: string;
  qaTurns: QaTurnRow[];
}

export interface AlertPatch {
  status?: AlertStatus;
  twilioCallSid?: string | null;
  emsConfirmedAt?: string | null;
  lastError?: string | null;
  briefingText?: string;
}

export interface StoredCall {
  call: CallRow;
  utterances: Utterance[];
  caseState: CaseState | null;
  alerts: AlertRow[];
}

export interface Store {
  readonly kind: "convex" | "memory";
  insertCall(call: NewCall): Promise<void>;
  patchCall(callId: string, patch: CallPatch): Promise<void>;
  insertUtterance(u: Utterance): Promise<void>;
  upsertCaseState(state: CaseState): Promise<void>;
  setCallError(callId: string, lastError: string): Promise<void>;
  insertAlert(alert: NewAlert): Promise<void>;
  patchAlert(alertId: string, patch: AlertPatch, updatedAt: string): Promise<void>;
  insertQaTurn(turn: QaTurnRow): Promise<void>;
  /** Calls labelled TEST with everything attached; returns the deleted alert ids. */
  deleteTestCalls(): Promise<{ alertIds: string[] }>;
  listCalls(limit: number): Promise<{ call: CallRow; level: Level }[]>;
  getCall(callId: string): Promise<StoredCall | null>;
  listAlerts(sinceMs: number): Promise<AlertRow[]>;
}
