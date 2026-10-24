import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { LkwParseOutput, initialCaseState, type Confidence, type LkwNote, type Utterance } from "../contracts/index.js";
import { applyFastPass, type ReducerConfig } from "../state/reducer.js";
import { validateFastPass } from "../validate/outputs.js";
import { parseLkw } from "./parser.js";

const TZ = "America/Los_Angeles";
const SAID_A = "2026-10-25T14:47:00-07:00";
const SAID_B = "2026-10-25T07:05:00-07:00";

type Row = [n: number, phrase: string, lkwAt: string | null, range: string | null, confidence: Confidence, note: LkwNote | null, display: string];

// docs/06 §7, first block (saidAt 14:47). Times are local on 2026-10-25 unless a "10-24" date is given.
const BLOCK_A: Row[] = [
  [1, "fine at about 2 PM", "14:00", "13:45–14:15", "approx", null, "2:00 PM (1:45–2:15 PM)"],
  [2, "at 2:10", "14:10", "14:10–14:10", "exact", null, "2:10 PM"],
  [3, "at 2", "14:00", "13:50–14:10", "approx", null, "2:00 PM (1:50–2:10 PM)"],
  [4, "around two", "14:00", "13:45–14:15", "approx", null, "2:00 PM (1:45–2:15 PM)"],
  [5, "about an hour ago", "13:47", "13:32–14:02", "approx", null, "1:47 PM (1:32–2:02 PM)"],
  [6, "an hour ago", "13:47", "13:41–13:53", "approx", null, "1:47 PM (1:41–1:53 PM)"],
  [7, "twenty minutes ago", "14:27", "14:24–14:30", "approx", null, "2:27 PM (2:24–2:30 PM)"],
  [8, "a couple of hours ago", "12:47", "12:17–13:17", "vague", null, "about 12:47 PM (12:17–1:17 PM)"],
  [9, "a few hours ago", "11:47", "09:47–12:47", "vague", null, "about 11:47 AM (9:47 AM–12:47 PM)"],
  [10, "since lunch", "12:30", "12:00–13:30", "vague", null, "about 12:30 PM (12:00–1:30 PM)"],
  [11, "this morning", "09:00", "06:00–12:00", "vague", null, "about 9:00 AM (6:00 AM–12:00 PM)"],
  [12, "last night", "10-24 22:00", "10-24 20:00–23:59", "vague", null, "yesterday 10:00 PM (8:00–11:59 PM)"],
  [13, "he was fine when he woke up", "07:00", "06:00–09:00", "vague", null, "about 7:00 AM (6:00–9:00 AM)"],
  [14, "he woke up like this", "10-24 22:00", "10-24 20:00–23:59", "vague", null, "yesterday 10:00 PM (8:00–11:59 PM)"],
  [15, "at noon", "12:00", "11:50–12:10", "approx", null, "12:00 PM (11:50 AM–12:10 PM)"],
  [16, "quarter past two", "14:15", "14:05–14:25", "approx", null, "2:15 PM (2:05–2:25 PM)"],
  [17, "half past one", "13:30", "13:20–13:40", "approx", null, "1:30 PM (1:20–1:40 PM)"],
  [18, "a little after two", "14:10", "14:00–14:20", "approx", null, "2:10 PM (2:00–2:20 PM)"],
  [19, "just before two", "13:53", "13:45–14:00", "approx", null, "1:53 PM (1:45–2:00 PM)"],
  [20, "at 3", "03:00", "02:50–03:10", "approx", "ampm_assumed", "3:00 AM? (2:50–3:10 AM) · confirm AM/PM"],
  [21, "when I talked to him at 11", "11:00", "10:50–11:10", "approx", null, "11:00 AM (10:50–11:10 AM)"],
  [22, "about 10 minutes ago", "14:37", "14:27–14:47", "approx", null, "2:37 PM (2:27–2:47 PM)"],
  [23, "just now", "14:45", "14:42–14:47", "approx", null, "2:45 PM (2:42–2:47 PM)"],
  [24, "I don't know, I just found him", null, null, "unknown", null, "unknown — ask when last seen normal"],
  [25, "sometime this afternoon", "13:23", "12:00–14:47", "vague", null, "about 1:23 PM (12:00–2:47 PM)"],
  [26, "half an hour ago", "14:17", "14:14–14:20", "approx", null, "2:17 PM (2:14–2:20 PM)"],
  [27, "an hour and a half ago", "13:17", "13:08–13:26", "approx", null, "1:17 PM (1:08–1:26 PM)"],
  [28, "two hours ago", "12:47", "12:35–12:59", "approx", null, "12:47 PM (12:35–12:59 PM)"],
  [29, "at dinner last night", "10-24 18:30", "10-24 17:30–19:30", "vague", null, "yesterday 6:30 PM (5:30–7:30 PM)"],
  [30, "before he went to bed", "10-24 22:00", "10-24 20:00–23:59", "vague", null, "yesterday 10:00 PM (8:00–11:59 PM)"],
  [31, "2 o'clock", "14:00", "13:50–14:10", "approx", null, "2:00 PM (1:50–2:10 PM)"],
  [32, "14:30", "14:30", "14:30–14:30", "exact", null, "2:30 PM"],
  [33, "around 2:30", "14:30", "14:15–14:45", "approx", null, "2:30 PM (2:15–2:45 PM)"],
  [34, "fine at breakfast", "08:00", "07:00–09:00", "vague", null, "about 8:00 AM (7:00–9:00 AM)"],
  [35, "like five minutes ago", "14:42", "14:32–14:47", "approx", "clipped_to_now", "2:42 PM (2:32–2:47 PM) · clipped to now"],
  [36, "this evening", null, null, "unknown", null, "unknown — ask when last seen normal"],
  [37, "the last time I saw him normal was Tuesday", null, null, "unknown", null, "unknown — ask when last seen normal"],
  [38, "about 2 PM yesterday", "10-24 14:00", "10-24 13:45–14:15", "approx", "older_than_24h", "yesterday 2:00 PM (1:45–2:15 PM)"],
  [39, "two thirty", "14:30", "14:20–14:40", "approx", null, "2:30 PM (2:20–2:40 PM)"],
  [40, "sometime after lunch", "13:30", "13:00–14:00", "vague", null, "about 1:30 PM (1:00–2:00 PM)"],
  [41, "she was fine at lunch, maybe one thirty", "13:30", "13:15–13:45", "approx", null, "1:30 PM (1:15–1:45 PM)"],
  [42, "Since lunch", "12:30", "12:00–13:30", "vague", null, "about 12:30 PM (12:00–1:30 PM)"],
  [43, "3 this afternoon", "14:47", "14:00–14:47", "vague", "clipped_to_now", "about 2:47 PM (2:00–2:47 PM) · clipped to now"],
  [44, "since this morning", "10-24 22:00", "10-24 20:00–23:59", "vague", null, "yesterday 10:00 PM (8:00–11:59 PM)"],
  [45, "a few minutes ago", "14:42", "14:37–14:45", "approx", null, "2:42 PM (2:37–2:45 PM)"],
  [46, "half an hour ago, we ate around six thirty", "06:30", "06:15–06:45", "approx", null, "6:30 AM (6:15–6:45 AM)"],
];

// Second block (saidAt 07:05; row 48 uses 09:30 as the table says).
const BLOCK_B: Array<Row & { 7?: string }> = [
  [47, "when he went to bed around eleven", "10-24 23:00", "10-24 22:45–23:15", "approx", null, "yesterday 11:00 PM (10:45–11:15 PM)"],
  [48, "at 10", "10-24 22:00", "10-24 21:50–22:10", "approx", "ampm_assumed", "yesterday 10:00 PM? (9:50–10:10 PM) · confirm AM/PM"],
  [49, "at 6", "06:00", "05:50–06:10", "approx", null, "6:00 AM (5:50–6:10 AM)"],
  [50, "last night around nine", "10-24 21:00", "10-24 20:45–21:15", "approx", null, "yesterday 9:00 PM (8:45–9:15 PM)"],
];

/** "14:00" → "2026-10-25 14:00"; "10-24 22:00" → "2026-10-24 22:00". */
function expandTime(s: string): string {
  return s.includes(" ") ? `2026-${s}` : `2026-10-25 ${s}`;
}

/** "10-24 20:00–23:59" → both ends on 10-24; "09:47–12:47" → both on 10-25. */
function expandRange(s: string): [string, string] {
  const [date, times] = s.includes(" ") ? (s.split(" ") as [string, string]) : ["10-25", s];
  const [a, b] = times.split("–") as [string, string];
  return [`2026-${date} ${a}`, `2026-${date} ${b}`];
}

function local(isoString: string | null): string | null {
  return isoString === null ? null : DateTime.fromISO(isoString, { setZone: true }).setZone(TZ).toFormat("yyyy-MM-dd HH:mm");
}

function check([, phrase, lkwAt, range, confidence, note, display]: Row, saidAt: string): void {
  const out = parseLkw({ phrase, saidAt, timezone: TZ });
  expect(LkwParseOutput.safeParse(out).success).toBe(true);
  expect({
    lkwAt: local(out.lkwAt),
    range: out.rangeStart === null ? null : [local(out.rangeStart), local(out.rangeEnd)],
    confidence: out.confidence,
    note: out.note,
    display: out.display,
  }).toEqual({
    lkwAt: lkwAt === null ? null : expandTime(lkwAt),
    range: range === null ? null : expandRange(range),
    confidence,
    note,
    display,
  });
  expect(out.phrase).toBe(phrase);
}

describe("LKW parser — docs/06 §7 (saidAt 14:47)", () => {
  it.each(BLOCK_A)("row %i: %s", (...row) => check(row as Row, SAID_A));
});

describe("LKW parser — docs/06 §7 (early morning)", () => {
  it.each(BLOCK_B)("row %i: %s", (...row) => {
    const r = row as Row;
    check(r, r[0] === 48 ? "2026-10-25T09:30:00-07:00" : SAID_B);
  });
});

describe("LKW parser — guards", () => {
  it("outputs ISO with the call's offset", () => {
    const out = parseLkw({ phrase: "fine at about 2 PM", saidAt: "2026-10-25T21:47:00Z", timezone: TZ });
    expect(out.lkwAt).toBe("2026-10-25T14:00:00-07:00");
  });

  it("an invalid saidAt or timezone yields unknown, not a throw", () => {
    expect(parseLkw({ phrase: "at 2", saidAt: "not a date", timezone: TZ }).confidence).toBe("unknown");
    expect(parseLkw({ phrase: "at 2", saidAt: SAID_A, timezone: "Mars/Olympus" }).confidence).toBe("unknown");
  });

  it("an explicit clock time later today moves to yesterday (yesterday_assumed)", () => {
    const out = parseLkw({ phrase: "at 9 PM", saidAt: SAID_A, timezone: TZ });
    expect(local(out.lkwAt)).toBe("2026-10-24 21:00");
    expect(out.note).toBe("yesterday_assumed");
    expect(out.display).toBe("yesterday 9:00 PM? (8:50–9:10 PM) · confirm day");
  });

  it("a result more than 7 days back is unknown; older than a day shows the weekday", () => {
    expect(parseLkw({ phrase: "8 days ago", saidAt: SAID_A, timezone: TZ }).confidence).toBe("unknown");
    const old = parseLkw({ phrase: "50 hours ago", saidAt: SAID_A, timezone: TZ });
    expect(old.note).toBe("older_than_24h");
    expect(old.display.startsWith("Friday ")).toBe(true);
  });

  it("lunch said before noon refers to the previous day; this afternoon said in the morning is unknown", () => {
    const morning = "2026-10-25T10:00:00-07:00";
    expect(local(parseLkw({ phrase: "since lunch", saidAt: morning, timezone: TZ }).lkwAt)).toBe("2026-10-24 12:30");
    expect(parseLkw({ phrase: "this afternoon", saidAt: morning, timezone: TZ }).confidence).toBe("unknown");
  });

  it("R6, R2b several, hours-and-minutes, -ish and 24-hour HHMM", () => {
    expect(local(parseLkw({ phrase: "an hour or two ago", saidAt: SAID_A, timezone: TZ }).lkwAt)).toBe("2026-10-25 13:17");
    expect(local(parseLkw({ phrase: "several minutes ago", saidAt: SAID_A, timezone: TZ }).lkwAt)).toBe("2026-10-25 14:37");
    expect(local(parseLkw({ phrase: "1 hour and 15 minutes ago", saidAt: SAID_A, timezone: TZ }).lkwAt)).toBe("2026-10-25 13:32");
    const ish = parseLkw({ phrase: "two-ish", saidAt: SAID_A, timezone: TZ });
    expect(ish.rangeStart && local(ish.rangeStart)).toBe("2026-10-25 13:45");
    expect(parseLkw({ phrase: "at 1430", saidAt: SAID_A, timezone: TZ }).display).toBe("2:30 PM");
  });
});

describe("LKW parser in the reducer (Card A)", () => {
  it('"Since lunch" keeps the LKW question up; "fine at about 2 PM" establishes 2:00 PM', () => {
    const call = "6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f607";
    const u = (seq: number, text: string, tStartMs: number): Utterance => ({
      id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`, callId: call, seq, speaker: "caller", text, tStartMs, tEndMs: tStartMs + 2000,
    });
    const what = u(4, "Since lunch his words come out all mixed up and his right hand is weak, he can't lift his coffee cup.", 11000);
    const fine = u(8, "He was fine at about 2 PM. We had lunch and he was fine.", 30000);
    const cfg: ReducerConfig = { likelyMinDistinctSigns: 2, timezone: TZ, streamStartedAt: "2026-10-25T14:47:00-07:00", parseLkw };
    let s = initialCaseState(call, "2026-10-25T14:47:00-07:00");
    s = applyFastPass(s, validateFastPass({ signs: [{ kind: "arms", quote: "he can't lift his coffee cup" }], facts: [{ kind: "last_known_well", value: "Since lunch", quote: "Since lunch" }] }, what), [what, fine], cfg).state;
    expect(s.lkw?.display).toBe("about 12:30 PM (12:00–1:30 PM)");
    expect(s.nextQuestion?.kind).toBe("lkw");
    s = applyFastPass(s, validateFastPass({ signs: [], facts: [{ kind: "last_known_well", value: "fine at about 2 PM", quote: "He was fine at about 2 PM" }] }, fine), [what, fine], cfg).state;
    expect(s.lkw?.display).toBe("2:00 PM (1:45–2:15 PM)");
    expect(s.lkw?.lkwAt).toBe("2026-10-25T14:00:00-07:00");
    expect(s.nextQuestion?.kind).toBe("blood_thinner");
  });
});

describe("LKW parser — totality", () => {
  const VOCAB = [
    "at", "about", "around", "since", "after", "before", "just", "a little", "quarter", "half", "past", "to",
    "2", "3", "11", "12", "14:30", "2:10", "1430", "0", "99", "25:61", "noon", "midnight", "o'clock", "am", "pm",
    "a.m.", "p.m.", "ago", "minutes", "hours", "an hour", "couple", "few", "several", "or", "two", "thirty",
    "twenty-five", "lunch", "dinner", "breakfast", "yesterday", "last night", "this morning", "tonight",
    "woke up", "like this", "he", "she", "was", "fine", "when", "went to bed", "um", "maybe", "-ish", "Tuesday",
    "", " ", ",", ".", "’", "—", "ﬁ", "２", "😀", "\u0000", "\n", "'", ":", "::", "-", "--",
  ];

  function rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
  }

  it("never throws and always returns a valid result for 200 random phrases", () => {
    const rand = rng(20261025);
    const said = DateTime.fromISO(SAID_A, { setZone: true });
    for (let i = 0; i < 200; i++) {
      const len = 1 + Math.floor(rand() * 8);
      const words = Array.from({ length: len }, () => VOCAB[Math.floor(rand() * VOCAB.length)] ?? "");
      const phrase = words.join(rand() < 0.5 ? " " : "");
      const out = parseLkw({ phrase, saidAt: SAID_A, timezone: TZ });
      expect(LkwParseOutput.safeParse(out).success, phrase).toBe(true);
      if (out.lkwAt !== null && out.rangeStart !== null && out.rangeEnd !== null) {
        const p = DateTime.fromISO(out.lkwAt);
        const a = DateTime.fromISO(out.rangeStart);
        const b = DateTime.fromISO(out.rangeEnd);
        expect(p <= said, phrase).toBe(true);
        expect(b <= said, phrase).toBe(true);
        expect(a <= b, phrase).toBe(true);
        expect(b.diff(a, "hours").hours <= 24, phrase).toBe(true);
      } else {
        expect(out.confidence, phrase).toBe("unknown");
      }
    }
  });

  it("source never builds a Date without a zone", () => {
    const dir = fileURLToPath(new URL(".", import.meta.url));
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) {
      expect(readFileSync(`${dir}${f}`, "utf8"), f).not.toMatch(/new Date\(|Date\.parse\(|DateTime\.local\(|DateTime\.now\(/);
    }
  });
});
