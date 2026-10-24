// Test helpers built from the core fixtures (packages/core/src/fixtures).
import { CaseState, type AlertSummary, type CallInfo, type Utterance } from "@lastwell/core";
import a01 from "../../../packages/core/src/fixtures/caseState.A01.json";

export const A01_STATE = CaseState.parse(a01);
export const CALL_ID = A01_STATE.callId;

export function callInfo(over: Partial<CallInfo> = {}): CallInfo {
  return {
    id: CALL_ID,
    mode: "replay",
    callerNumberMasked: null,
    startedAt: "2026-10-25T14:47:00-07:00",
    endedAt: null,
    status: "live",
    timezone: "America/Los_Angeles",
    label: "A01",
    ...over,
  };
}

export function utt(seq: number, speaker: Utterance["speaker"], text: string, tStartMs = seq * 1000): Utterance {
  const hex = String(seq).padStart(12, "0"); // fixture ids use the decimal seq
  return { id: `a0100000-0000-4000-8000-${hex}`, callId: CALL_ID, seq, speaker, text, tStartMs, tEndMs: tStartMs + 800 };
}

export function alert(over: Partial<AlertSummary> = {}): AlertSummary {
  return {
    id: "b0100000-0000-4000-8000-000000000001",
    callId: CALL_ID,
    targetPhoneMasked: "•••0100",
    status: "calling",
    briefingText: "Stroke pre-alert.",
    caseSnapshot: A01_STATE,
    emsConfirmedAt: null,
    createdAt: "2026-10-25T14:50:00-07:00",
    lastError: null,
    qaTurns: [],
    ...over,
  };
}
