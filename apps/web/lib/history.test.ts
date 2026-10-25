import { describe, expect, it } from "vitest";
import { HISTORY_COLUMNS, HistoryPage, UTF8_BOM, csvCell, historyCsvFile, historyFilename, historyToCsv, type HistoryRow } from "./history";

const row: HistoryRow = {
  alertId: "a0000000-0000-4000-8000-000000000001",
  callId: "c0000000-0000-4000-8000-000000000001",
  label: "A01",
  createdAt: "2026-10-25T05:00:00.000Z",
  status: "completed",
  emsConfirmedAt: null,
  level: "likely",
  signs: [
    { kind: "speech", quote: "his words come out all mixed up", tMs: 2000 },
    { kind: "arms", quote: "he can't lift his coffee cup", tMs: 2000 },
  ],
  facts: [
    { kind: "age", value: "78", quote: "he's 78", tMs: 1000 },
    { kind: "blood_thinner", value: "Eliquis", quote: "he takes Eliquis", tMs: 9000 },
    { kind: "last_known_well", value: "fine at about 2 PM", quote: "He was fine at about 2 PM", tMs: 7000 },
  ],
  lkw: { display: "2:00 PM (1:45–2:15 PM)", lkwAt: "2026-10-24T14:00:00-07:00", quote: "He was fine at about 2 PM", tMs: 7000 },
  lookalikes: [{ name: "low blood sugar", ref: null }],
};

describe("board history CSV (proposed D-57)", () => {
  it("escapes commas, quotes and line breaks, and neutralises spreadsheet formulas", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a, b")).toBe('"a, b"');
    expect(csvCell('he said "help"')).toBe('"he said ""help"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("+1 415")).toBe("'+1 415");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell("@cmd")).toBe("'@cmd");
  });

  it("writes a header and one line per alert with the quoted evidence", () => {
    const csv = historyToCsv([row]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(HISTORY_COLUMNS.join(","));
    expect(lines).toHaveLength(3); // header, row, trailing empty after the final CRLF
    expect(lines[1]).toContain("2026-10-25T05:00:00.000Z,A01,likely,completed,,");
    expect(lines[1]).toContain("2:00 PM (1:45–2:15 PM)");
    expect(lines[1]).toContain("Eliquis,“he takes Eliquis” 00:09");
    expect(lines[1]).toContain("speech: “his words come out all mixed up” 00:02 | arms: “he can't lift his coffee cup” 00:02");
    expect(lines[1]).toContain("Age: 78 (“he's 78” 00:01)");
    expect(lines[1]).not.toContain("Last known well:"); // LKW has its own columns
    expect(lines[1]).toContain("low blood sugar");
    expect(historyToCsv([])).toBe(HISTORY_COLUMNS.join(",") + "\r\n");
  });

  it("validates pages from Convex and rejects anything else", () => {
    expect(HistoryPage.parse({ ok: true, rows: [row], isDone: true, continueCursor: "c1" }).ok).toBe(true);
    expect(HistoryPage.parse({ ok: false, error: "unauthorized" })).toEqual({ ok: false, error: "unauthorized" });
    expect(HistoryPage.safeParse({ ok: true, rows: [{ ...row, level: "certain" }], isDone: true, continueCursor: "" }).success).toBe(false);
    expect(HistoryPage.safeParse({ ok: true, rows: [{ ...row, targetPhone: "+14155550100" }], isDone: true, continueCursor: "" }).success).toBe(true); // extra fields are ignored…
    expect(JSON.stringify(HistoryPage.parse({ ok: true, rows: [{ ...row, targetPhone: "+14155550100" }], isDone: true, continueCursor: "" }))).not.toContain("+1415"); // …and stripped
  });

  it("the downloaded file starts with a UTF-8 BOM so Excel shows “ ” and – instead of â€œ", () => {
    const file = historyCsvFile([row]);
    expect(UTF8_BOM).toBe("\uFEFF");
    expect(file.startsWith("\uFEFF" + HISTORY_COLUMNS[0])).toBe(true);
    expect(file.slice(1)).toBe(historyToCsv([row]));
    expect(Array.from(new TextEncoder().encode(file).slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("names the file after the local export time", () => {
    expect(historyFilename(new Date(2026, 9, 25, 6, 12))).toBe("lastwell-board-history-20261025-0612.csv");
  });
});
