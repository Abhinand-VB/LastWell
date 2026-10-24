// Scoring (docs/07 §1): one record per script, then the summary the slide uses.
import { DateTime } from "luxon";
import { keywordBaseline, norm, type EvalScript, type FactKind, type Level, type ScriptedRunResult } from "@lastwell/core";

const RANK: Record<Level, number> = { none: 0, possible: 1, likely: 2 };

export interface ScriptRecord {
  id: string;
  type: EvalScript["type"];
  isStroke: boolean;
  expectedLevel: Level;
  finalLevel: Level;
  maxLevel: Level;
  firstPossibleS: number | null;
  firstLikelyS: number | null;
  signs: string[];
  baseline: { flagged: boolean; atS: number | null; pattern: string | null };
  /** null when the truth has no LKW. */
  lkw: { truth: string; shown: string | null; correct: boolean; unknown: boolean } | null;
  /** null when the truth never mentions a blood thinner. */
  bloodThinner: { truth: string; shown: string | null; correct: boolean } | null;
  lookalike: { truth: string | null; shown: string[] };
  invented: string[];
  wrongFacts: string[];
  dropped: number;
  errors: number;
  fastPassMs: number[];
  reasonerMs: number[];
}

function maxLevel(r: ScriptedRunResult): Level {
  return r.turns.reduce<Level>((m, t) => (RANK[t.level] > RANK[m] ? t.level : m), r.state.level);
}

/** History-style facts whose truth is a yes/no answer ("yes", "no", or the words that affirm it). */
const POLAR: ReadonlySet<FactKind> = new Set([
  "diabetes", "seizure_history", "alcohol_or_drugs", "head_injury", "fever_or_infection", "migraine_history",
]);
/** Compared as text; other kinds (onset, LKW, medication) are not scored as wrong facts. */
const TEXTUAL: ReadonlySet<FactKind> = new Set(["age", "sex", "address", "blood_thinner"]);

function negative(v: string): boolean {
  return /\b(no|not|never|none|nothing|denies|doesnt|dont|didnt|isnt|hasnt|wasnt)\b/.test(norm(v));
}

/** Shown value contradicts truth: opposite polarity for yes/no facts, else neither text contains the other. */
export function contradicts(kind: FactKind, shown: string, truth: string): boolean {
  if (POLAR.has(kind)) return negative(shown) !== negative(truth);
  if (!TEXTUAL.has(kind)) return false;
  // Whole-word containment ("female" does not contain "male").
  const a = ` ${norm(shown)} `;
  const b = ` ${norm(truth)} `;
  return !(a.includes(b) || b.includes(a));
}

export function scoreScript(script: EvalScript, r: ScriptedRunResult, timezone: string): ScriptRecord {
  const s = r.state;
  const t = script.truth;

  const base = keywordBaseline(script.turns);
  const baseAt = base.index === null ? null : (script.turns[base.index]?.atMs ?? 0) / 1000;

  let lkw: ScriptRecord["lkw"] = null;
  if (t.lkw !== null) {
    const truth = DateTime.fromISO(t.lkw.localTime, { zone: timezone });
    const shown = s.lkw?.lkwAt == null ? null : DateTime.fromISO(s.lkw.lkwAt, { setZone: true });
    const unknown = s.lkw === null || s.lkw.confidence === "unknown" || shown === null;
    const correct = !unknown && shown !== null && Math.abs(shown.diff(truth, "minutes").minutes) <= t.lkw.toleranceMin;
    lkw = { truth: truth.toFormat("HH:mm"), shown: s.lkw?.display ?? null, correct, unknown };
  }

  const btFact = s.facts.find((f) => f.kind === "blood_thinner")?.value ?? null;
  let bloodThinner: ScriptRecord["bloodThinner"] = null;
  if (t.bloodThinner !== null) {
    const want = t.bloodThinner.trim().toLowerCase();
    const got = btFact?.trim().toLowerCase() ?? null;
    const correct = want === "none" ? got === null || got === "none" : got !== null && (got === want || got.includes(want));
    bloodThinner = { truth: t.bloodThinner, shown: btFact, correct };
  }

  // Invented = a shown quote that is not in the script text (0 by construction; the runner asserts it).
  const text = script.turns.map((x) => x.text);
  const invented = [...s.signs.map((x) => ({ k: `sign:${x.kind}`, q: x.ref.quote })), ...s.facts.map((x) => ({ k: `fact:${x.kind}`, q: x.ref.quote }))]
    .filter(({ q }) => !text.some((u) => u.includes(q)))
    .map(({ k, q }) => `${k} "${q}"`);

  const wrongFacts: string[] = [];
  for (const tf of t.facts) {
    const shown = s.facts.find((f) => f.kind === tf.kind);
    if (shown !== undefined && contradicts(tf.kind, shown.value, tf.value)) wrongFacts.push(`${tf.kind}: shown "${shown.value}", truth "${tf.value}"`);
  }

  const atS = (ms: number | null): number | null => (ms === null ? null : ms / 1000);
  return {
    id: script.id,
    type: script.type,
    isStroke: t.isStroke,
    expectedLevel: t.expectedLevel,
    finalLevel: s.level,
    maxLevel: maxLevel(r),
    firstPossibleS: atS(r.firstAtMs.possible),
    firstLikelyS: atS(r.firstAtMs.likely),
    signs: [...new Set(s.signs.map((x) => x.kind))],
    baseline: { flagged: base.flagged, atS: baseAt, pattern: base.pattern },
    lkw,
    bloodThinner,
    lookalike: { truth: t.lookalike, shown: s.lookalikes.map((l) => l.name) },
    invented,
    wrongFacts,
    dropped: r.drops.length,
    errors: r.errors,
    fastPassMs: r.calls.filter((c) => c.pass === "fast" && c.error === null).map((c) => c.ms),
    reasonerMs: r.calls.filter((c) => c.pass === "reasoner" && c.error === null).map((c) => c.ms),
  };
}

export interface Ratio {
  n: number;
  d: number;
}

export interface Summary {
  scripts: number;
  strokes: number;
  lastwell: {
    sensPossible: Ratio;
    sensLikely: Ratio;
    precPossible: Ratio;
    precLikely: Ratio;
    medianFirstFlagS: number | null;
    lkw: Ratio;
    lkwUnknown: number;
    bloodThinner: Ratio;
    invented: number;
    dropped: number;
    wrongFacts: number;
    levelAgreement: Ratio;
    errors: number;
    fastPassMsP50: number | null;
    reasonerMsP50: number | null;
  };
  baseline: { sensPossible: Ratio; precPossible: Ratio; medianFirstFlagS: number | null };
}

export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[m] ?? null) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
}

export function summarize(records: readonly ScriptRecord[]): Summary {
  const strokes = records.filter((r) => r.isStroke);
  const reached = (r: ScriptRecord, l: Level): boolean => RANK[r.maxLevel] >= RANK[l];
  const flaggedP = records.filter((r) => reached(r, "possible"));
  const flaggedL = records.filter((r) => reached(r, "likely"));
  const baseFlagged = records.filter((r) => r.baseline.flagged);
  const withLkw = records.filter((r) => r.lkw !== null);
  const withBt = records.filter((r) => r.bloodThinner !== null);
  return {
    scripts: records.length,
    strokes: strokes.length,
    lastwell: {
      sensPossible: { n: strokes.filter((r) => reached(r, "possible")).length, d: strokes.length },
      sensLikely: { n: strokes.filter((r) => reached(r, "likely")).length, d: strokes.length },
      precPossible: { n: flaggedP.filter((r) => r.isStroke).length, d: flaggedP.length },
      precLikely: { n: flaggedL.filter((r) => r.isStroke).length, d: flaggedL.length },
      medianFirstFlagS: median(strokes.flatMap((r) => (r.firstPossibleS === null ? [] : [r.firstPossibleS]))),
      lkw: { n: withLkw.filter((r) => r.lkw?.correct).length, d: withLkw.length },
      lkwUnknown: withLkw.filter((r) => r.lkw?.unknown).length,
      bloodThinner: { n: withBt.filter((r) => r.bloodThinner?.correct).length, d: withBt.length },
      invented: records.reduce((a, r) => a + r.invented.length, 0),
      dropped: records.reduce((a, r) => a + r.dropped, 0),
      wrongFacts: records.reduce((a, r) => a + r.wrongFacts.length, 0),
      levelAgreement: { n: records.filter((r) => r.finalLevel === r.expectedLevel).length, d: records.length },
      errors: records.reduce((a, r) => a + r.errors, 0),
      fastPassMsP50: median(records.flatMap((r) => r.fastPassMs)),
      reasonerMsP50: median(records.flatMap((r) => r.reasonerMs)),
    },
    baseline: {
      sensPossible: { n: strokes.filter((r) => r.baseline.flagged).length, d: strokes.length },
      precPossible: { n: baseFlagged.filter((r) => r.isStroke).length, d: baseFlagged.length },
      medianFirstFlagS: median(strokes.flatMap((r) => (r.baseline.atS === null ? [] : [r.baseline.atS]))),
    },
  };
}
