// Per-call audit trail ("path to production"): what was heard, what was shown and why, who acted.
// Recorded as it happens (state diffs on every publish, dispatcher actions, alert status changes) and
// served read-only by GET /api/calls/:callId/audit. In memory for the call's residency; after a
// restart the audit is rebuilt from the store without the history (historyComplete: false).
import { guardLevel, type CaseState, type Level, type QuoteRef, type SignKind, type Warning } from "@lastwell/core";

type At = { at: string };
export type AuditEvent = At &
  (
    | { type: "sign"; kind: SignKind; quote: string; tMs: number; utteranceId: string; source: string }
    | { type: "fact"; kind: string; value: string; quote: string; tMs: number; utteranceId: string; source: string; replaced: string | null }
    | { type: "lkw"; display: string; phrase: string; confidence: string; quote: string; tMs: number }
    | { type: "level"; from: Level; to: Level; modelLevel: Level; reason: string; signKinds: SignKind[] }
    | { type: "warning"; warning: Warning; on: boolean }
    | { type: "dispatcher"; action: DispatcherAction; actor: string; alertId: string | null; targetPhoneMasked: string | null; detail: string | null }
    | { type: "alert.status"; alertId: string; from: string; to: string; lastError: string | null }
  );

export type DispatcherAction = "approve" | "retry" | "hangup" | "ems_confirm" | "ems_unconfirm" | "played_locally" | "end_call";

const ref = (r: QuoteRef) => ({ quote: r.quote, tMs: r.tMs, utteranceId: r.utteranceId });

/** What changed between two published states, as audit events (signs are never removed; facts can be replaced). */
export function diffStates(prev: CaseState, next: CaseState, at: string, likelyMinDistinctSigns: number): AuditEvent[] {
  const out: AuditEvent[] = [];
  const seenSign = new Set(prev.signs.map((s) => `${s.kind}:${s.ref.utteranceId}`));
  for (const s of next.signs) {
    if (!seenSign.has(`${s.kind}:${s.ref.utteranceId}`)) out.push({ at, type: "sign", kind: s.kind, ...ref(s.ref), source: s.source });
  }
  const key = (f: CaseState["facts"][number]) => `${f.kind}|${f.value}|${f.ref.utteranceId}`;
  const prevKeys = new Set(prev.facts.map(key));
  for (const f of next.facts) {
    if (prevKeys.has(key(f))) continue;
    const old = f.kind === "medication" ? undefined : prev.facts.find((p) => p.kind === f.kind);
    out.push({ at, type: "fact", kind: f.kind, value: f.value, ...ref(f.ref), source: f.source, replaced: old?.value ?? null });
  }
  if (next.lkw !== null && (prev.lkw === null || prev.lkw.display !== next.lkw.display || prev.lkw.ref.utteranceId !== next.lkw.ref.utteranceId)) {
    out.push({ at, type: "lkw", display: next.lkw.display, phrase: next.lkw.phrase, confidence: next.lkw.confidence, quote: next.lkw.ref.quote, tMs: next.lkw.ref.tMs });
  }
  if (prev.level !== next.level) {
    const kinds = [...new Set(next.signs.map((s) => s.kind))];
    out.push({ at, type: "level", from: prev.level, to: next.level, modelLevel: next.modelLevel, reason: guardLevel(next.signs, next.modelLevel, likelyMinDistinctSigns).reason, signKinds: kinds });
  }
  for (const w of next.warnings) if (!prev.warnings.includes(w)) out.push({ at, type: "warning", warning: w, on: true });
  for (const w of prev.warnings) if (!next.warnings.includes(w)) out.push({ at, type: "warning", warning: w, on: false });
  return out;
}

/** The person acting through the console: `x-lastwell-actor` if the web app sends one, else the console. */
export function actorOf(header: string | string[] | undefined): string {
  const v = Array.isArray(header) ? header[0] : header;
  const clean = (v ?? "").replace(/[^\p{L}\p{N} .,'@_-]/gu, "").trim().slice(0, 64);
  return clean === "" ? "dispatcher console" : clean;
}
