// The docs/07 §5 summary table (Markdown, copy-paste into the slide) and a per-script table.
import type { Ratio, ScriptRecord, Summary } from "./score.js";

export function ratio(r: Ratio): string {
  return r.d === 0 ? "0/0 (—)" : `${r.n}/${r.d} (${Math.round((100 * r.n) / r.d)}%)`;
}

function secs(s: number | null): string {
  return s === null ? "—" : `${Math.round(s)} s`;
}

function ms(x: number | null): string {
  return x === null ? "—" : `${Math.round(x)} ms`;
}

export function summaryTable(s: Summary, model: string): string {
  const l = s.lastwell;
  const b = s.baseline;
  const rows: [string, string, string][] = [
    [`Sensitivity @possible (n=${s.strokes})`, ratio(l.sensPossible), ratio(b.sensPossible)],
    ["Sensitivity @likely", ratio(l.sensLikely), "—"],
    [`Precision @possible (flags=${l.precPossible.d})`, ratio(l.precPossible), `${ratio(b.precPossible)}`],
    ["Precision @likely", ratio(l.precLikely), "—"],
    ["Median seconds to first flag", secs(l.medianFirstFlagS), secs(b.medianFirstFlagS)],
    [`LKW correct (n=${l.lkw.d} with truth)`, `${l.lkw.n}/${l.lkw.d}${l.lkwUnknown > 0 ? ` (${l.lkwUnknown} left unknown)` : ""}`, "—"],
    [`Blood thinner correct (n=${l.bloodThinner.d})`, `${l.bloodThinner.n}/${l.bloodThinner.d}`, "—"],
    ["Invented facts shown", String(l.invented), "—"],
    ["Dropped by validator", `${l.dropped} items`, "—"],
    ["Wrong facts", String(l.wrongFacts), "—"],
    [`Level agreement (n=${l.levelAgreement.d})`, ratio(l.levelAgreement), "—"],
  ];
  return [
    `| Metric | LastWell (${model}) | Keyword baseline |`,
    "| --- | --- | --- |",
    ...rows.map(([a, c, d]) => `| ${a} | ${c} | ${d} |`),
    "",
    `Model errors: ${l.errors}. Median latency: fast pass ${ms(l.fastPassMsP50)}, reasoner ${ms(l.reasonerMsP50)}.`,
    `${s.scripts} scripted calls (text mode), written by the team; real-world precision will be lower.`,
  ].join("\n");
}

export function perScriptTable(records: readonly ScriptRecord[]): string {
  const lines = records.map((r) => {
    const flag = r.firstPossibleS === null ? "—" : `${r.firstPossibleS}s`;
    const lkw = r.lkw === null ? "n/a" : `${r.lkw.correct ? "ok" : "MISS"} ${r.lkw.shown ?? "unknown"} (truth ${r.lkw.truth})`;
    const bt = r.bloodThinner === null ? "n/a" : `${r.bloodThinner.correct ? "ok" : "MISS"} ${r.bloodThinner.shown ?? "—"}`;
    const look = r.lookalike.shown.join(", ") || "—";
    const base = r.baseline.flagged ? `${r.baseline.atS}s` : "—";
    const notes = [...r.wrongFacts, ...r.invented.map((x) => `INVENTED ${x}`)].join("; ");
    return `| ${r.id} | ${r.type} | ${r.expectedLevel} | ${r.finalLevel}${r.maxLevel !== r.finalLevel ? ` (max ${r.maxLevel})` : ""} | ${r.signs.join(", ") || "—"} | ${flag} | ${base} | ${lkw} | ${bt} | ${look} | ${r.dropped} | ${notes} |`;
  });
  return [
    "| id | type | expected | final | signs | first flag | baseline | LKW | blood thinner | look-alikes | dropped | notes |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...lines,
  ].join("\n");
}
