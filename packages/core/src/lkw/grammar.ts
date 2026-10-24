// LKW phrase normalization and grammar (docs/06 §2–§3). Pure string work: no clock math here.
// Precedence inside one phrase: clock > relative > meal/day anchor.

export interface Normalized {
  text: string;
  /** about / around / maybe / like / -ish / or so … appeared (docs/06 §2.2). */
  approx: boolean;
}

const UNITS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
};
const SMALL: Record<string, number> = {
  ...UNITS,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50 };

const APPROX = /\b(about|around|approximately|roughly|maybe|probably|like|or so|something like|i think|i guess)\b/;
const NUMBER_WORD = "(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)";

export function normalize(phrase: string): Normalized {
  let s = phrase.normalize("NFKC").toLowerCase().replace(/[‘’ʼ′]/g, "'").replace(/[‐-―]/g, "-");

  // a.m./p.m. → am/pm, "2pm" → "2 pm"
  s = s.replace(/\b([ap])\.\s?m\b\.?/g, "$1m").replace(/(\d)\s*(am|pm)\b/g, "$1 $2");

  // -ish suffix on a number ("2ish", "two-ish") marks approx.
  const ishRe = new RegExp(`\\b(${NUMBER_WORD})-?ish\\b`, "g");
  const ish = ishRe.test(s);
  s = s.replace(ishRe, "$1");

  const approx = ish || APPROX.test(s);

  // Strip filler (docs/06 §2.2). "like" stays in "woke up like this" (R11).
  s = s
    .replace(/\b(um+|uh+|i think|maybe|probably|i guess|i'd say|or so|something like)\b/g, " ")
    .replace(/\blike\b/g, (m, offset: number, whole: string) => (/woke up\s*$/.test(whole.slice(0, offset)) ? m : " "));

  // Punctuation → space, keeping ':' between digits and apostrophes inside words.
  s = s.replace(/(\d):(\d)/g, "$1\u0000$2").replace(/[^a-z0-9'\u0000 ]/g, " ").replace(/\u0000/g, ":");
  s = s.replace(/(^|\s)'|'(\s|$)/g, "$1 $2").replace(/\s+/g, " ").trim();

  s = numberWords(s);
  return { text: s.replace(/\s+/g, " ").trim(), approx };
}

function numberWords(input: string): string {
  let s = ` ${input} `;
  s = s
    .replace(/ (an|one|1) hours? and a half /g, " 90 minutes ")
    .replace(/ (one|1) and a half hours? /g, " 90 minutes ")
    .replace(/ (half an|a half|half) hour /g, " 30 minutes ")
    .replace(/ (a )?couple( of)? /g, " couple ")
    .replace(/ a few /g, " few ")
    .replace(/ an hour /g, " 1 hour ");
  // twenty-five, forty five …
  s = s.replace(/ (twenty|thirty|forty|fifty)[ -](one|two|three|four|five|six|seven|eight|nine) /g, (_m, t: string, u: string) =>
    ` ${(TENS[t] ?? 0) + (UNITS[u] ?? 0)} `,
  );
  // Single words; repeat so adjacent words ("two thirty") both convert.
  for (let i = 0; i < 2; i++) {
    s = s.replace(/ (one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty) /g, (_m, w: string) =>
      ` ${SMALL[w] ?? TENS[w] ?? w} `,
    );
  }
  return s;
}

// ---------------------------------------------------------------------------------------------
// Clock (R7)

export type Meridiem = "am" | "pm";

export interface ClockMatch {
  cls: "clock";
  hour: number; // as said (0–23)
  minute: number;
  /** am/pm known from the words, noon/midnight, or a 24-hour form. */
  meridiem: Meridiem | "24h" | null;
  /** Numeric with minutes ("2:10", "14:30") → exact when not approx. */
  numericMinutes: boolean;
}

const NOT_A_CLOCK_AFTER = /^ ?(minutes?|mins?|hours?|hrs?|ago|years?|days?|weeks?|months?|seconds?|secs?|or|and|times?|people|of)\b/;

function validClock(hour: number, minute: number): boolean {
  return Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function meridiemOf(word: string | undefined): Meridiem | null {
  return word === "am" || word === "pm" ? word : null;
}

/** First clock expression in the normalized text, by pattern priority. */
export function findClock(text: string): ClockMatch | null {
  const t = ` ${text} `;
  let m: RegExpExecArray | null;

  // quarter past H, half past H, quarter to H (spoken)
  if ((m = / (quarter|half) past (\d{1,2})(?: (am|pm))? /.exec(t))) {
    const hour = Number(m[2]);
    const minute = m[1] === "quarter" ? 15 : 30;
    if (hour >= 1 && hour <= 12) return { cls: "clock", hour, minute, meridiem: meridiemOf(m[3]), numericMinutes: false };
  }
  if ((m = / quarter to (\d{1,2})(?: (am|pm))? /.exec(t))) {
    const said = Number(m[1]);
    if (said >= 1 && said <= 12) {
      const hour = said === 1 ? 12 : said - 1;
      return { cls: "clock", hour, minute: 45, meridiem: meridiemOf(m[2]), numericMinutes: false };
    }
  }
  if (/ noon /.test(t)) return { cls: "clock", hour: 12, minute: 0, meridiem: "24h", numericMinutes: false };
  if (/ midnight /.test(t)) return { cls: "clock", hour: 0, minute: 0, meridiem: "24h", numericMinutes: false };

  // H:MM (numeric with minutes)
  if ((m = / (\d{1,2}):(\d{2})(?: (am|pm))? /.exec(t))) {
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    if (validClock(hour, minute)) {
      const mer = meridiemOf(m[3]);
      const h24 = hour >= 13 || hour === 0 || (m[1]?.length === 2 && m[1].startsWith("0"));
      return { cls: "clock", hour, minute, meridiem: mer ?? (h24 ? "24h" : null), numericMinutes: true };
    }
  }
  // HHMM 24-hour (only after a time preposition or alone)
  if ((m = /(?:^ | (?:at|around|about|since|by) )([01]\d|2[0-3])([0-5]\d) /.exec(t))) {
    return { cls: "clock", hour: Number(m[1]), minute: Number(m[2]), meridiem: "24h", numericMinutes: true };
  }
  // H MM spoken ("two thirty" → "2 30")
  const hmm = / (\d{1,2}) (\d{2})(?: (am|pm))? /g;
  while ((m = hmm.exec(t))) {
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    const rest = t.slice(m.index + m[0].length - 1);
    if (hour >= 1 && hour <= 12 && validClock(hour, minute) && !NOT_A_CLOCK_AFTER.test(rest)) {
      return { cls: "clock", hour, minute, meridiem: meridiemOf(m[3]), numericMinutes: false };
    }
    hmm.lastIndex = m.index + 1;
  }
  // H o'clock
  if ((m = / (\d{1,2}) o'?clock(?: (am|pm))? /.exec(t))) {
    const hour = Number(m[1]);
    if (hour >= 1 && hour <= 12) return { cls: "clock", hour, minute: 0, meridiem: meridiemOf(m[2]), numericMinutes: false };
  }
  // H am/pm
  if ((m = / (\d{1,2}) (am|pm) /.exec(t))) {
    const hour = Number(m[1]);
    if (hour >= 1 && hour <= 12) return { cls: "clock", hour, minute: 0, meridiem: meridiemOf(m[2]), numericMinutes: false };
  }
  // (at|around|about|since|after|before|by|until|till) H — bare hour
  const bare = / (?:at|around|about|since|after|before|by|until|till) (\d{1,2})(?= )/g;
  while ((m = bare.exec(t))) {
    const hour = Number(m[1]);
    const rest = t.slice(m.index + m[0].length);
    if (hour >= 0 && hour <= 23 && !NOT_A_CLOCK_AFTER.test(rest)) {
      return { cls: "clock", hour, minute: 0, meridiem: hour >= 13 || hour === 0 ? "24h" : null, numericMinutes: false };
    }
  }
  // H + qualifier ("3 this afternoon", "9 last night")
  if ((m = / (\d{1,2}) (?=(this (morning|afternoon|evening)|tonight|last night|yesterday|in the (morning|afternoon|evening)|at night) )/.exec(t))) {
    const hour = Number(m[1]);
    if (hour >= 1 && hour <= 12) return { cls: "clock", hour, minute: 0, meridiem: null, numericMinutes: false };
  }
  // A phrase that is only an hour ("two-ish" → "2")
  if ((m = /^ (\d{1,2}) $/.exec(t))) {
    const hour = Number(m[1]);
    if (hour >= 1 && hour <= 12) return { cls: "clock", hour, minute: 0, meridiem: null, numericMinutes: false };
  }
  return null;
}

export interface ClockContext {
  qualifier: Meridiem | null;
  /** "yesterday" or "last night": the clock time is on the previous day. */
  previousDay: boolean;
  afterModifier: boolean; // a little / just / shortly after H
  beforeModifier: boolean; // just / a little before H
}

export function clockContext(text: string): ClockContext {
  const pm = /\b(this afternoon|this evening|tonight|in the (afternoon|evening)|at night|last night|yesterday (afternoon|evening))\b/.test(text);
  const am = /\b(this morning|in the morning|yesterday morning)\b/.test(text);
  return {
    qualifier: pm ? "pm" : am ? "am" : null,
    previousDay: /\b(yesterday|last night)\b/.test(text),
    afterModifier: /\b(a little|just|shortly) after\b/.test(text),
    beforeModifier: /\b(just|a little) before\b/.test(text),
  };
}

// ---------------------------------------------------------------------------------------------
// Relative (R1–R6)

export type RelativeMatch =
  | { cls: "relative"; rule: "R1" }
  | { cls: "relative"; rule: "R2"; minutes: number }
  | { cls: "relative"; rule: "R2b"; size: "couple" | "few" | "several" }
  | { cls: "relative"; rule: "R3" | "R4" | "R5" }
  | { cls: "relative"; rule: "R6" };

export function findRelative(text: string): RelativeMatch | null {
  const t = ` ${text} `;
  let m: RegExpExecArray | null;
  if (/ (just now|right now|a minute ago|seconds ago|a second ago|a moment ago) /.test(t)) return { cls: "relative", rule: "R1" };
  if (/ 1 (hours? )?or 2( hours?)? ago /.test(t)) return { cls: "relative", rule: "R6" };
  if ((m = / (couple|few|several) (minutes?|mins?) ago /.exec(t))) {
    return { cls: "relative", rule: "R2b", size: m[1] as "couple" | "few" | "several" };
  }
  if ((m = / (couple|few|several) (hours?|hrs?) ago /.exec(t))) {
    return { cls: "relative", rule: m[1] === "couple" ? "R3" : m[1] === "few" ? "R4" : "R5" };
  }
  if ((m = / (\d+) (?:hours?|hrs?)(?: and (\d+) (?:minutes?|mins?))? ago /.exec(t))) {
    return { cls: "relative", rule: "R2", minutes: Number(m[1]) * 60 + Number(m[2] ?? 0) };
  }
  if ((m = / (\d+) (?:minutes?|mins?) ago /.exec(t))) return { cls: "relative", rule: "R2", minutes: Number(m[1]) };
  return null;
}

// ---------------------------------------------------------------------------------------------
// Anchors (R8–R16) and explicit unknowns (R17)

export type AnchorRule = "R8" | "R8b" | "R9" | "R10" | "R11" | "R12" | "R12wake" | "R13" | "R14" | "R15" | "R16" | "R17";

export interface AnchorMatch {
  cls: "anchor";
  rule: AnchorRule;
  /** R16 sub-rule. */
  part?: "morning" | "afternoon" | "evening" | null;
}

const PRONOUN = "(?:he|she|they|i|we)";

export function findAnchor(text: string): AnchorMatch | null {
  const t = ` ${text} `;
  const has = (re: RegExp): boolean => re.test(t);
  if (has(/ (since|at|during|before) lunch | lunch ?time /)) return { cls: "anchor", rule: "R8" };
  if (has(/ after lunch /)) return { cls: "anchor", rule: "R8b" };
  if (has(/ breakfast /)) return { cls: "anchor", rule: "R9" };
  if (has(/ (dinner|supper) /)) return { cls: "anchor", rule: "R10" };
  if (
    has(/ woke up (with|like) (this|it) /) ||
    has(/ woke up and (couldn't|could not|was|had) /) ||
    has(new RegExp(` when ${PRONOUN} woke up ${PRONOUN} (was|couldn't|could not|had) `)) ||
    has(new RegExp(` since ${PRONOUN} woke up `)) ||
    has(/ since this morning /)
  ) {
    return { cls: "anchor", rule: "R11" };
  }
  if (has(new RegExp(` when ${PRONOUN} (woke|got) up `))) return { cls: "anchor", rule: "R12wake" };
  if (has(/ this morning /)) return { cls: "anchor", rule: "R12" };
  if (has(/ this afternoon /)) return { cls: "anchor", rule: "R13" };
  if (has(/ (this evening|tonight) /)) return { cls: "anchor", rule: "R14" };
  if (has(new RegExp(` last night | (before|when) ${PRONOUN} went to bed | at bedtime | before bed `))) {
    return { cls: "anchor", rule: "R15" };
  }
  if (has(/ yesterday /)) {
    const part = /yesterday (morning|afternoon|evening)/.exec(t)?.[1] as "morning" | "afternoon" | "evening" | undefined;
    return { cls: "anchor", rule: "R16", part: part ?? null };
  }
  if (has(/ (a while ago|earlier|earlier today) /)) return { cls: "anchor", rule: "R17" };
  return null;
}
