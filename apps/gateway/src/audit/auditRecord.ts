// GET /api/calls/:callId/audit: one JSON document per call. Times are ISO (absolute, from the stream
// start + the utterance offset) and tMs (offset on the call clock). Phone numbers are masked.
import type { CaseState, QuoteRef, Utterance } from "@lastwell/core";
import type { AlertService } from "../alerts/approve.js";
import type { AlertRecord } from "../alerts/alertRegistry.js";
import type { CallService } from "../pipeline/calls.js";
import { callInfo, maskNumber } from "../pipeline/callRegistry.js";
import type { Repo } from "../store/repo.js";
import type { AlertRow } from "../store/types.js";
import type { AuditEvent } from "./auditTrail.js";

export const AUDIT_VERSION = 1;

const absolute = (start: string | null, tMs: number): string | null => (start === null ? null : new Date(Date.parse(start) + tMs).toISOString());

function quoteRef(r: QuoteRef, start: string | null) {
  return { quote: r.quote, speaker: r.speaker, tMs: r.tMs, at: absolute(start, r.tMs), utteranceId: r.utteranceId };
}

function evidenceRefs(e: unknown): QuoteRef[] {
  return Array.isArray(e) ? (e as QuoteRef[]).filter((x) => typeof x?.quote === "string") : [];
}

function alertAudit(a: AlertRecord | AlertRow, start: string | null, events: readonly AuditEvent[]) {
  const id = "id" in a ? a.id : a.alertId;
  return {
    alertId: id,
    status: a.status,
    targetPhoneMasked: maskNumber(a.targetPhone),
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    lastError: a.lastError,
    emsConfirmedAt: a.emsConfirmedAt,
    levelAtApproval: a.caseSnapshot.level,
    briefingText: a.briefingText,
    dispatcherNote: "note" in a ? (a.note ?? null) : null,
    override: "override" in a ? a.override === true : a.caseSnapshot.level === "none",
    statusChanges: events.filter((e) => e.type === "alert.status" && e.alertId === id),
    qa: a.qaTurns.map((t) => ({ seq: t.seq, question: t.question, answer: t.answer, known: t.known, ms: t.ms, evidence: evidenceRefs(t.evidence).map((r) => quoteRef(r, start)) })),
  };
}

export function buildAudit(
  base: { callId: string; call: ReturnType<typeof callInfo>; streamStartedAt: string | null; utterances: readonly Utterance[]; state: CaseState | null },
  alerts: ReadonlyArray<AlertRecord | AlertRow>,
  events: readonly AuditEvent[],
  historyComplete: boolean,
) {
  const start = base.streamStartedAt ?? base.call.startedAt;
  const s = base.state;
  return {
    auditVersion: AUDIT_VERSION,
    generatedAt: new Date().toISOString(),
    callId: base.callId,
    call: base.call,
    streamStartedAt: start,
    historyComplete,
    notes: historyComplete
      ? []
      : ["Rebuilt from the store after a gateway restart or eviction: level history, dispatcher actions and alert status history were kept in memory and are not available; final signs, facts, transcript, alerts and Q&A are."],
    utterances: base.utterances.map((u) => ({ seq: u.seq, utteranceId: u.id, speaker: u.speaker, text: u.text, tStartMs: u.tStartMs, tEndMs: u.tEndMs, at: absolute(start, u.tStartMs) })),
    finalLevel: s?.level ?? "none",
    signs: (s?.signs ?? []).map((x) => ({ kind: x.kind, source: x.source, ...quoteRef(x.ref, start) })),
    facts: (s?.facts ?? []).map((x) => ({ kind: x.kind, value: x.value, source: x.source, ...quoteRef(x.ref, start) })),
    lastKnownWell: s?.lkw ? { display: s.lkw.display, lkwAt: s.lkw.lkwAt, confidence: s.lkw.confidence, phrase: s.lkw.phrase, ...quoteRef(s.lkw.ref, start) } : null,
    droppedByValidator: s?.droppedCount ?? 0,
    levelChanges: events.filter((e) => e.type === "level"),
    dispatcherActions: events.filter((e) => e.type === "dispatcher"),
    alerts: alerts.map((a) => alertAudit(a, start, events)),
    events,
  };
}

export type AuditRecord = ReturnType<typeof buildAudit>;

export async function callAudit(deps: { calls: CallService; alerts: AlertService; repo: Repo }, callId: string): Promise<AuditRecord | null> {
  const live = deps.calls.registry.get(callId);
  if (live) {
    return buildAudit(
      { callId, call: callInfo(live), streamStartedAt: live.streamStartedAt, utterances: live.utterances, state: live.runner?.state ?? null },
      deps.alerts.registry.forCall(callId),
      live.audit,
      true,
    );
  }
  const stored = await deps.repo.getCall(callId);
  if (!stored) return null;
  const c = stored.call;
  return buildAudit(
    {
      callId,
      call: callInfo({ id: c.callId, mode: c.mode, callerNumber: c.callerNumber, startedAt: c.startedAt, endedAt: c.endedAt, status: c.status, timezone: c.timezone, label: c.label }),
      streamStartedAt: c.streamStartedAt ?? null,
      utterances: stored.utterances,
      state: stored.caseState,
    },
    stored.alerts,
    [],
    false,
  );
}
