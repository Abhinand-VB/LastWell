// Console strings derived from the state (docs/03 §9 look-alike table, W-04 warning banners).
import { isAntiplatelet, resolveLookalike, type CaseState, type FactKind, type QuoteRef, type SignKind, type Warning } from "@lastwell/core";
import { SIGN_ORDER } from "./format";

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

/**
 * Splits an LKW display string (docs/06 §6: "about 2:00 PM (1:45–2:15 PM) · confirm AM/PM") so the
 * console can show the clock time large and the range and note beside it. Text is never changed.
 */
export function splitLkwDisplay(display: string): { clock: string; range: string | null; note: string | null } {
  const m = /^(.*?)(?: \(([^)]+)\))?(?: · (.+))?$/.exec(display);
  return { clock: m?.[1] ?? display, range: m?.[2] ?? null, note: m?.[3] ?? null };
}

const SIGN_WORD: Record<SignKind, string> = { balance: "balance", eyes: "vision", face: "face", arms: "arm", speech: "speech" };

/**
 * D-55: the after-call summary, built by code from validated items only (each one is quoted on the
 * card below), never from the reasoner's free-text `summary` (docs/03: tooltip only).
 */
export function callSummary(state: CaseState): string {
  const kinds = SIGN_ORDER.filter((k) => state.signs.some((s) => s.kind === k)).map((k) => SIGN_WORD[k]);
  const signs =
    kinds.length === 0
      ? "No stroke signs heard."
      : `${kinds.length === 1 ? kinds[0] : `${kinds.slice(0, -1).join(", ")} and ${kinds.at(-1)}`} signs heard.`;
  const clock = state.lkw?.lkwAt ? splitLkwDisplay(state.lkw.display).clock : null;
  const lkw = clock ? `Last known well ${clock}${clock.endsWith("?") ? "" : "."}` : "Last known well not established.";
  const thinner = state.facts.find((f) => f.kind === "blood_thinner");
  const age = state.facts.find((f) => f.kind === "age")?.value;
  const sex = state.facts.find((f) => f.kind === "sex")?.value;
  const parts = [
    signs.charAt(0).toUpperCase() + signs.slice(1),
    lkw,
    thinner ? `${bloodThinnerLabel(thinner.value)}: ${thinner.value}.` : null,
    age || sex ? `${[age, sex].filter(Boolean).join(" · ")}.` : null,
  ];
  return parts.filter(Boolean).join(" ");
}

export interface FactRow {
  key: string;
  label: string;
  value: string;
  refs: QuoteRef[];
}

const FACT_ROWS: { kind: FactKind; label: string }[] = [
  { kind: "blood_thinner", label: "Blood thinner" },
  { kind: "diabetes", label: "Diabetes" },
  { kind: "seizure_history", label: "Seizure history" },
  { kind: "medication", label: "Medications" },
  { kind: "address", label: "Address" },
];

/** Critical-facts rows in docs/01 §7 order, with age and sex sharing one "Age · sex" row. */
export function factRows(facts: CaseState["facts"]): FactRow[] {
  const rows: FactRow[] = [];
  const age = facts.find((f) => f.kind === "age");
  const sex = facts.find((f) => f.kind === "sex");
  const ageSex: FactRow | null =
    age || sex
      ? {
          key: "age-sex",
          label: age && sex ? "Age · sex" : age ? "Age" : "Sex",
          value: [age?.value, sex?.value].filter(Boolean).join(" · "),
          refs: [age?.ref, sex?.ref].filter((r): r is QuoteRef => r !== undefined),
        }
      : null;
  for (const { kind, label } of FACT_ROWS) {
    for (const f of facts.filter((x) => x.kind === kind)) {
      rows.push({ key: `${kind}-${f.value}`, label: kind === "blood_thinner" ? bloodThinnerLabel(f.value) : label, value: f.value, refs: [f.ref] });
    }
    if (kind === "blood_thinner" && ageSex) rows.push(ageSex);
  }
  return rows;
}
