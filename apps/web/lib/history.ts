// Proposed D-57: board history export. Rows come from convex/board.ts:alertHistory (quoted evidence
// only, never the transcript, phone numbers or the address); this file validates them and builds the CSV.
import { AlertStatus, FactKind, Level, SignKind } from "@lastwell/core";
import { z } from "zod/v4";
import { mmss } from "./format";
import { factLabel } from "./boardLive";

const Quoted = z.object({ quote: z.string(), tMs: z.number() });

export const HistoryRow = z.object({
  alertId: z.string(),
  callId: z.string(),
  label: z.string().nullable(),
  createdAt: z.string(),
  status: AlertStatus,
  emsConfirmedAt: z.string().nullable(),
  level: Level,
  signs: z.array(Quoted.extend({ kind: SignKind })),
  facts: z.array(Quoted.extend({ kind: FactKind, value: z.string() })),
  lkw: Quoted.extend({ display: z.string(), lkwAt: z.string().nullable() }).nullable(),
  lookalikes: z.array(z.object({ name: z.string(), ref: Quoted.nullable() })),
});
export type HistoryRow = z.infer<typeof HistoryRow>;

/** What board:alertHistory returns for one page. */
export const HistoryPage = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(false), error: z.literal("unauthorized") }),
  z.object({ ok: z.literal(true), rows: z.array(HistoryRow), isDone: z.boolean(), continueCursor: z.string() }),
]);
export type HistoryPage = z.infer<typeof HistoryPage>;

export const HISTORY_PAGE_SIZE = 100;
/** Stops a runaway export; 20 pages × 100 alerts is far beyond any shift. */
export const HISTORY_MAX_PAGES = 20;

export const HISTORY_COLUMNS = [
  "created_at",
  "call_label",
  "level",
  "briefing_status",
  "paramedic_confirmed_at",
  "last_known_well",
  "last_known_well_quote",
  "blood_thinner",
  "blood_thinner_quote",
  "signs",
  "other_facts",
  "lookalikes",
  "alert_id",
  "call_id",
] as const;

const quoted = (q: { quote: string; tMs: number }) => `“${q.quote}” ${mmss(q.tMs)}`;

/**
 * One CSV cell: quoted when it holds a comma, quote or line break; a leading = + - @ (or tab/CR) gets a
 * leading apostrophe so a spreadsheet shows it as text instead of running it as a formula.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function historyRowCells(r: HistoryRow): string[] {
  const thinner = r.facts.find((f) => f.kind === "blood_thinner") ?? null;
  const others = r.facts.filter((f) => f.kind !== "blood_thinner" && f.kind !== "last_known_well");
  return [
    r.createdAt,
    r.label ?? "",
    r.level,
    r.status,
    r.emsConfirmedAt ?? "",
    r.lkw?.display ?? "",
    r.lkw ? quoted(r.lkw) : "",
    thinner?.value ?? "",
    thinner ? quoted(thinner) : "",
    r.signs.map((s) => `${s.kind}: ${quoted(s)}`).join(" | "),
    others.map((f) => `${factLabel(f.kind)}: ${f.value} (${quoted(f)})`).join(" | "),
    r.lookalikes.map((l) => (l.ref ? `${l.name} (${quoted(l.ref)})` : l.name)).join(" | "),
    r.alertId,
    r.callId,
  ];
}

/** Header + one line per alert, CRLF line ends (what spreadsheet apps expect). */
export function historyToCsv(rows: readonly HistoryRow[]): string {
  const lines = [HISTORY_COLUMNS.join(","), ...rows.map((r) => historyRowCells(r).map(csvCell).join(","))];
  return lines.join("\r\n") + "\r\n";
}

/**
 * The downloaded file: a UTF-8 byte-order mark, then the CSV. Without the mark, Excel on Windows reads a
 * CSV as Windows-1252 and shows the curly quotes as "â€œ" (and "–" as "â€“").
 */
export const UTF8_BOM = "\uFEFF";
export function historyCsvFile(rows: readonly HistoryRow[]): string {
  return UTF8_BOM + historyToCsv(rows);
}

/** lastwell-board-history-20261025-0612.csv (local time of the export). */
export function historyFilename(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `lastwell-board-history-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.csv`;
}
