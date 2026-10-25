// Console strings derived from the state (docs/03 §9 look-alike table, W-04 warning banners).
import { isAntiplatelet, resolveLookalike, type CaseState, type Warning } from "@lastwell/core";

export function lookalikeLine(l: CaseState["lookalikes"][number], state: CaseState): { text: string; resolved: boolean } {
  const r = resolveLookalike(l, state);
  if (!r.resolved) return { text: `${l.name} — Ask: ${l.ask.replace(/^ask:\s*/i, "")}`, resolved: false };
  if (r.bySign) return { text: `${l.name} — less likely: other signs heard`, resolved: true };
  return { text: `${l.name} — answered: ${r.fact?.value ?? ""}`, resolved: true };
}

export const WARNING_TEXT: Record<Warning, string> = {
  stt_degraded: "Transcription degraded — switch to the table mic",
  reasoner_delayed: "Reasoner delayed",
};

/** D-41(c): an antiplatelet (aspirin, clopidogrel…) is never labelled a blood thinner. */
export function bloodThinnerLabel(value: string | null): string {
  return value !== null && isAntiplatelet(value) ? "Antiplatelet" : "Blood thinner";
}
