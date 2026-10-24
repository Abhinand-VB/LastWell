// Last-known-well parser (docs/06). Pure and total: any phrase yields a result, never a throw.
// Time is computed here by code, never by a model. All arithmetic in the call's IANA zone (luxon).
import { DateTime } from "luxon";
import type { Confidence, LkwNote, LkwParseInput, LkwParseOutput } from "../contracts/index.js";
import { formatLkw, UNKNOWN_DISPLAY } from "./format.js";
import {
  clockContext,
  findAnchor,
  findClock,
  findRelative,
  normalize,
  type AnchorMatch,
  type ClockMatch,
  type RelativeMatch,
} from "./grammar.js";

interface Result {
  point: DateTime;
  start: DateTime;
  end: DateTime;
  confidence: Exclude<Confidence, "unknown">;
  note: LkwNote | null;
  /** A tolerance (R1, R2, R2b, R7) may set clipped_to_now when it ran past saidAt. */
  toleranceRule: boolean;
}

const MINUTE = 60_000;

function at(day: DateTime, hour: number, minute: number): DateTime {
  return day.set({ hour, minute, second: 0, millisecond: 0 });
}

function midpoint(a: DateTime, b: DateTime): DateTime {
  return a.plus({ milliseconds: b.diff(a).milliseconds / 2 }).startOf("minute");
}

function unknown(phrase: string): LkwParseOutput {
  return { phrase, lkwAt: null, rangeStart: null, rangeEnd: null, confidence: "unknown", note: null, display: UNKNOWN_DISPLAY };
}

// ---------------------------------------------------------------------------------------------
// R7 clock resolution (docs/06 §4)

function to24(hour: number, meridiem: "am" | "pm"): number {
  if (hour >= 13) return hour;
  if (meridiem === "am") return hour === 12 ? 0 : hour;
  return hour === 12 ? 12 : hour + 12;
}

function resolveClock(c: ClockMatch, text: string, approx: boolean, saidAt: DateTime): Result | null {
  const ctx = clockContext(text);
  const today = saidAt.startOf("day");
  const base = ctx.previousDay ? today.minus({ days: 1 }) : today;
  let cand: DateTime;
  let note: LkwNote | null = null;

  const meridiem = c.meridiem === "am" || c.meridiem === "pm" ? c.meridiem : c.meridiem === null ? ctx.qualifier : null;
  if (c.meridiem === "24h" || meridiem !== null) {
    const hour = c.meridiem === "24h" ? c.hour : to24(c.hour, meridiem ?? "pm");
    cand = at(base, hour, c.minute);
    if (!ctx.previousDay && cand > saidAt) {
      if (cand.diff(saidAt).milliseconds <= 60 * MINUTE) {
        // The caller misjudged the time of day: treat as "just now" with a one-hour range.
        return { point: saidAt, start: cand.minus({ minutes: 60 }), end: saidAt, confidence: "vague", note: "clipped_to_now", toleranceRule: false };
      }
      cand = cand.minus({ days: 1 });
      note = "yesterday_assumed";
    }
  } else {
    // No am/pm: the most recent of the two same-day readings that is not in the future.
    const h = c.hour % 12;
    const sameDay = [at(base, h, c.minute), at(base, h + 12, c.minute)];
    let pool = sameDay.filter((d) => d <= saidAt);
    if (pool.length === 0) pool = sameDay.map((d) => d.minus({ days: 1 }));
    cand = pool.reduce((a, b) => (b > a ? b : a));
    const moreThan8h = saidAt.diff(cand).milliseconds > 8 * 60 * MINUTE;
    const otherSoon = sameDay.some((d) => d > saidAt && d.diff(saidAt).milliseconds < 2 * 60 * MINUTE);
    if (moreThan8h && otherSoon) note = "ampm_assumed";
  }

  if (ctx.afterModifier) {
    return { point: cand.plus({ minutes: 10 }), start: cand, end: cand.plus({ minutes: 20 }), confidence: "approx", note, toleranceRule: true };
  }
  if (ctx.beforeModifier) {
    return { point: cand.minus({ minutes: 7 }), start: cand.minus({ minutes: 15 }), end: cand, confidence: "approx", note, toleranceRule: true };
  }
  if (c.numericMinutes && !approx) return { point: cand, start: cand, end: cand, confidence: "exact", note, toleranceRule: true };
  const tol = approx ? 15 : 10;
  return { point: cand, start: cand.minus({ minutes: tol }), end: cand.plus({ minutes: tol }), confidence: "approx", note, toleranceRule: true };
}

// ---------------------------------------------------------------------------------------------
// R1–R6 relative

function resolveRelative(r: RelativeMatch, approx: boolean, saidAt: DateTime): Result {
  const ago = (min: number): DateTime => saidAt.minus({ minutes: min });
  switch (r.rule) {
    case "R1":
      return { point: ago(2), start: ago(5), end: saidAt, confidence: "approx", note: null, toleranceRule: true };
    case "R2": {
      const tol = Math.round(approx ? Math.max(10, 0.25 * r.minutes) : Math.max(3, 0.1 * r.minutes));
      return { point: ago(r.minutes), start: ago(r.minutes + tol), end: ago(r.minutes - tol), confidence: "approx", note: null, toleranceRule: true };
    }
    case "R2b": {
      const [n, lo, hi] = r.size === "couple" ? [3, 1, 5] : r.size === "few" ? [5, 2, 10] : [10, 5, 20];
      return { point: ago(n), start: ago(hi), end: ago(lo), confidence: "approx", note: null, toleranceRule: true };
    }
    case "R3":
      return { point: ago(120), start: ago(150), end: ago(90), confidence: "vague", note: null, toleranceRule: false };
    case "R4":
      return { point: ago(180), start: ago(300), end: ago(120), confidence: "vague", note: null, toleranceRule: false };
    case "R5":
      return { point: ago(240), start: ago(360), end: ago(180), confidence: "vague", note: null, toleranceRule: false };
    case "R6":
      return { point: ago(90), start: ago(120), end: ago(60), confidence: "vague", note: null, toleranceRule: false };
  }
}

// ---------------------------------------------------------------------------------------------
// R8–R16 anchors

function vague(point: DateTime, start: DateTime, end: DateTime): Result {
  return { point, start, end, confidence: "vague", note: null, toleranceRule: false };
}

/** A window that ends at min(end, saidAt); the point is its midpoint. Null when it has not begun. */
function windowToNow(start: DateTime, end: DateTime, saidAt: DateTime): Result | null {
  if (start > saidAt) return null;
  const e = end < saidAt ? end : saidAt;
  return vague(midpoint(start, e), start, e);
}

function resolveAnchor(a: AnchorMatch, text: string, saidAt: DateTime): Result | null {
  const today = saidAt.startOf("day");
  const yesterday = today.minus({ days: 1 });
  const saysPreviousDay = /\b(yesterday|last night)\b/.test(text);
  /** A meal window today, or the previous day's when the phrase says so or today's has not started. */
  const meal = (h: number, m: number, sh: number, sm: number, eh: number, em: number): Result => {
    const day = saysPreviousDay || at(today, sh, sm) > saidAt ? yesterday : today;
    return vague(at(day, h, m), at(day, sh, sm), at(day, eh, em));
  };
  switch (a.rule) {
    case "R8":
      return meal(12, 30, 12, 0, 13, 30);
    case "R8b":
      return windowToNow(at(today, 13, 0), at(today, 14, 0), saidAt);
    case "R9":
      return meal(8, 0, 7, 0, 9, 0);
    case "R10":
      return meal(18, 30, 17, 30, 19, 30);
    case "R11":
    case "R15":
      return vague(at(yesterday, 22, 0), at(yesterday, 20, 0), at(yesterday, 23, 59));
    case "R12wake":
      return vague(at(today, 7, 0), at(today, 6, 0), at(today, 9, 0));
    case "R12": {
      const start = at(today, 6, 0);
      if (start > saidAt) return null;
      const end = at(today, 12, 0) < saidAt ? at(today, 12, 0) : saidAt;
      return vague(at(today, 9, 0), start, end);
    }
    case "R13":
      return windowToNow(at(today, 12, 0), at(today, 17, 0), saidAt);
    case "R14":
      return windowToNow(at(today, 17, 0), at(today, 21, 0), saidAt);
    case "R16":
      switch (a.part) {
        case "morning":
          return vague(at(yesterday, 9, 0), at(yesterday, 6, 0), at(yesterday, 12, 0));
        case "afternoon":
          return vague(at(yesterday, 14, 30), at(yesterday, 12, 0), at(yesterday, 17, 0));
        case "evening":
          return vague(at(yesterday, 19, 0), at(yesterday, 17, 0), at(yesterday, 21, 0));
        default:
          return vague(at(yesterday, 12, 0), at(yesterday, 8, 0), at(yesterday, 22, 0));
      }
    case "R17":
      return null;
  }
}

// ---------------------------------------------------------------------------------------------

function iso(d: DateTime): string {
  return d.toISO({ suppressMilliseconds: true }) ?? "";
}

export function parseLkw(input: LkwParseInput): LkwParseOutput {
  try {
    return parseUnsafe(input);
  } catch {
    return unknown(input.phrase);
  }
}

function parseUnsafe(input: LkwParseInput): LkwParseOutput {
  const phrase = input.phrase;
  const saidAt = DateTime.fromISO(input.saidAt, { setZone: true }).setZone(input.timezone);
  if (!saidAt.isValid) return unknown(phrase);

  const { text, approx } = normalize(phrase);
  const clockMatch = findClock(text);
  const relative = clockMatch === null ? findRelative(text) : null;
  const anchor = clockMatch === null && relative === null ? findAnchor(text) : null;

  let r: Result | null = null;
  if (clockMatch !== null) r = resolveClock(clockMatch, text, approx, saidAt);
  else if (relative !== null) r = resolveRelative(relative, approx, saidAt);
  else if (anchor !== null) r = resolveAnchor(anchor, text, saidAt);
  if (r === null) return unknown(phrase);

  // Guards (docs/06 §5): never a point in the future; ranges clipped to saidAt.
  let { point, start, end, note } = r;
  if (point > saidAt) point = saidAt;
  let clipped = false;
  if (end > saidAt) {
    clipped = r.toleranceRule && end.diff(saidAt).milliseconds > MINUTE;
    end = saidAt;
  }
  if (start > end) start = end;
  if (end.diff(start).milliseconds > 24 * 60 * MINUTE) return unknown(phrase);
  if (saidAt.diff(point).milliseconds > 7 * 24 * 60 * MINUTE) return unknown(phrase);

  if (note === null && saidAt.diff(point).milliseconds > 24 * 60 * MINUTE) note = "older_than_24h";
  if (note === null && clipped) note = "clipped_to_now";

  const display = formatLkw({ point, rangeStart: start, rangeEnd: end, confidence: r.confidence, note }, saidAt);
  return { phrase, lkwAt: iso(point), rangeStart: iso(start), rangeEnd: iso(end), confidence: r.confidence, note, display };
}
