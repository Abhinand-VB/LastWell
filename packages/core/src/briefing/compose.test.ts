import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CaseState, type LkwResult, type Sign } from "../contracts/index.js";
import { composeBriefing, countWords, spokenLkwSentence } from "./compose.js";

const TZ = "America/Los_Angeles";
const FIXTURES = fileURLToPath(new URL("../fixtures/", import.meta.url));
const load = (name: string): CaseState => CaseState.parse(JSON.parse(readFileSync(`${FIXTURES}caseState.${name}.json`, "utf8")));

const A01 = load("A01");
const B01 = load("B01");
const C01 = load("C01");
const TEST = load("TEST");

const NOW = {
  A01: new Date("2026-10-25T14:48:00-07:00"),
  B01: new Date("2026-10-25T19:21:00-07:00"),
  C01: new Date("2026-10-25T20:06:00-07:00"),
  TEST: new Date("2026-10-25T06:00:00-07:00"),
};

const qa = { qaEnabled: true };

/** Every '…' fragment the composer speaks. Templates are fixed, so parse them by sentence. */
function quotedFragments(text: string): string[] {
  const out: string[] = [];
  const said = /The caller said: '(.+?)'(?: and '(.+?)')?\./.exec(text);
  if (said?.[1]) out.push(said[1]);
  if (said?.[2]) out.push(said[2]);
  const words = /Caller's words: '(.+?)'\./.exec(text);
  if (words?.[1]) out.push(words[1]);
  return out;
}

function fixtureQuotes(s: CaseState): string[] {
  return [...s.signs.map((x) => x.ref.quote), ...s.facts.map((f) => f.ref.quote), ...(s.lkw ? [s.lkw.ref.quote] : [])];
}

function expectGrounded(s: CaseState, text: string): void {
  const quotes = fixtureQuotes(s);
  for (const frag of quotedFragments(text)) {
    expect(quotes.some((q) => q.includes(frag)), `"${frag}" is not in a fixture quote`).toBe(true);
  }
}

describe("composeBriefing — fixtures A/B/C/TEST (docs/05 §7)", () => {
  it("A01", () => {
    const { text, wordCount } = composeBriefing(A01, NOW.A01, TZ, qa);
    expect(text).toContain("78-year-old man");
    expect(text).toContain("speech trouble");
    expect(text).toContain("one-sided weakness");
    expect(text).toContain("Last known well: 2:00 PM");
    expect(text).toContain("Blood thinner: Eliquis");
    expect(text).toContain("48 minutes ago");
    expect(wordCount).toBeGreaterThanOrEqual(45);
    expect(wordCount).toBeLessThanOrEqual(70);
    expect(wordCount).toBe(countWords(text));
    expectGrounded(A01, text);
    expect(text).toMatchInlineSnapshot(
      `"Stroke pre-alert from nine one one, approved by the dispatcher. 78-year-old man. Signs heard: one-sided weakness and speech trouble. The caller said: 'he can't lift his coffee cup' and 'his words come out all mixed up'. Last known well: 2:00 PM, 48 minutes ago. Caller's words: 'fine at about 2 PM'. Blood thinner: Eliquis, per the caller. Not yet confirmed by paramedics. You can ask me about the call now."`,
    );
  });

  it("B01", () => {
    const { text, wordCount } = composeBriefing(B01, NOW.B01, TZ, qa);
    expect(text).toContain("74-year-old woman");
    expect(text).toContain("Signs heard: balance trouble and vision change.");
    expect(text).toContain("The caller says no blood thinners.");
    expect(text).not.toContain("Could also be");
    expect(wordCount).toBeGreaterThanOrEqual(45);
    expect(wordCount).toBeLessThanOrEqual(70);
    expectGrounded(B01, text);
  });

  it("C01", () => {
    const { text, wordCount } = composeBriefing(C01, NOW.C01, TZ, qa);
    expect(text).toContain("68-year-old man");
    expect(text).toContain("Could also be low blood sugar; not yet ruled out.");
    expect(text).toContain("Blood thinners were not mentioned.");
    expect(wordCount).toBeGreaterThanOrEqual(45);
    expect(wordCount).toBeLessThanOrEqual(70);
    expectGrounded(C01, text);
  });

  it("TEST", () => {
    const { text } = composeBriefing(TEST, NOW.TEST, TZ, { qaEnabled: false });
    expect(text).toContain("was not established on the call");
    expect(text).toContain("Blood thinners were not mentioned");
    expect(text).toContain("The caller said: 'test one two three'.");
    expect(text).toContain("Adult patient.");
    expect(text.endsWith("Not yet confirmed by paramedics. Goodbye.")).toBe(true);
    expect(text).not.toContain("Caller's words");
    expectGrounded(TEST, text);
  });

  it("is deterministic", () => {
    expect(composeBriefing(A01, NOW.A01, TZ, qa)).toEqual(composeBriefing(A01, NOW.A01, TZ, qa));
  });
});

describe("composeBriefing — rules", () => {
  const sign = (kind: Sign["kind"], quote: string, n: number): Sign => ({
    kind,
    ref: { quote, utteranceId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, tMs: n * 1000, speaker: "caller" },
    source: "fast",
  });

  it("two signs of the same kind produce one label", () => {
    expect(A01.signs.filter((s) => s.kind === "speech")).toHaveLength(2);
    const { text } = composeBriefing(A01, NOW.A01, TZ, qa);
    expect(text.match(/speech trouble/g)).toHaveLength(1);
  });

  it("two signs sharing a quote produce one quote", () => {
    const s: CaseState = { ...TEST, signs: [sign("speech", "he sounds drunk and keeps falling", 1), sign("balance", "he sounds drunk and keeps falling", 1)] };
    const { text } = composeBriefing(s, NOW.TEST, TZ, qa);
    expect(text).toContain("Signs heard: balance trouble and speech trouble.");
    expect(text).toContain("The caller said: 'he sounds drunk and keeps falling'.");
    expect(text.match(/he sounds drunk/g)).toHaveLength(1);
  });

  it("quotes are the shortest two, cut to 12 words, never the dispatcher's", () => {
    const long = "his whole left side just went completely limp and he slid down off the kitchen chair";
    const dispatcherSign: Sign = { ...sign("face", "his face droops", 4), ref: { ...sign("face", "x", 4).ref, quote: "his face droops", speaker: "dispatcher" } };
    const s: CaseState = { ...TEST, signs: [sign("arms", long, 2), sign("speech", "he can't talk", 3), dispatcherSign] };
    const { text } = composeBriefing(s, NOW.TEST, TZ, qa);
    expect(text).toContain("'he can't talk' and 'his whole left side just went completely limp and he slid down'.");
    expect(text).not.toContain("his face droops");
  });

  it("ampm_assumed and yesterday_assumed read 'possibly … unconfirmed'", () => {
    const base = A01.lkw as LkwResult;
    const ampm: LkwResult = { ...base, lkwAt: "2026-10-25T03:00:00-07:00", note: "ampm_assumed" };
    expect(spokenLkwSentence(ampm, NOW.A01, TZ)).toBe("Last known well: possibly 3:00 AM, unconfirmed.");
    const { text } = composeBriefing({ ...A01, lkw: ampm }, NOW.A01, TZ, qa);
    expect(text).toContain("Last known well: possibly 3:00 AM, unconfirmed.");
    expect(spokenLkwSentence({ ...base, note: "yesterday_assumed", lkwAt: "2026-10-24T21:00:00-07:00" }, NOW.A01, TZ)).toBe(
      "Last known well: possibly 9:00 PM, unconfirmed.",
    );
  });

  it("vague, older_than_24h, clipped and long-ago LKW sentences", () => {
    const base = A01.lkw as LkwResult;
    const vague: LkwResult = { ...base, confidence: "vague", lkwAt: "2026-10-25T12:30:00-07:00", rangeStart: "2026-10-25T12:00:00-07:00", rangeEnd: "2026-10-25T13:30:00-07:00" };
    expect(spokenLkwSentence(vague, NOW.A01, TZ)).toBe("Last known well: between 12:00 PM and 1:30 PM, roughly 138 minutes ago.");
    expect(spokenLkwSentence({ ...base, lkwAt: "2026-10-24T14:00:00-07:00", note: "older_than_24h" }, NOW.A01, TZ)).toBe(
      "Last known well: Saturday 2:00 PM, more than a day ago.",
    );
    expect(spokenLkwSentence({ ...base, note: "clipped_to_now" }, NOW.A01, TZ)).toBe("Last known well: 2:00 PM, 48 minutes ago.");
    expect(spokenLkwSentence({ ...base, lkwAt: "2026-10-25T10:30:00-07:00" }, NOW.A01, TZ)).toBe("Last known well: 10:30 AM, 4 hours 18 minutes ago.");
    expect(spokenLkwSentence(null, NOW.A01, TZ)).toBe("Last known well time was not established on the call.");
    expect(spokenLkwSentence({ ...base, confidence: "unknown", lkwAt: null }, NOW.A01, TZ)).toBe("Last known well time was not established on the call.");
  });

  it("the look-alike sentence only appears at level possible", () => {
    const withLookalike: CaseState = { ...A01, lookalikes: [{ name: "seizure", ask: "Any shaking?", ref: null }] };
    expect(composeBriefing(withLookalike, NOW.A01, TZ, qa).text).not.toContain("Could also be");
    expect(composeBriefing({ ...withLookalike, level: "possible" }, NOW.A01, TZ, qa).text).toContain("Could also be seizure");
  });

  it("an oversized state is trimmed in order: quote 2, then caller's words, then look-alike", () => {
    // Word budget: opening 9, patient 2, labels 7, quotes 3+5+1+12, time 8, caller's words 6 (or 14),
    // blood 6, look-alike 7 (or 19), close 13 → 79 / 87 / 99 words before trimming.
    const q12 = "his whole left side just went limp and he slid off the chair"; // 13 words → cut to 12
    const q5 = "he cannot say anything now";
    const big = (lookalike: string, phraseQuote: string): CaseState => ({
      ...A01,
      level: "possible",
      signs: [sign("arms", q12, 2), sign("speech", q5, 3)],
      lookalikes: [{ name: lookalike, ask: "Ask?", ref: null }],
      lkw: { ...(A01.lkw as LkwResult), phrase: phraseQuote, ref: { ...(A01.lkw as LkwResult).ref, quote: phraseQuote } },
    });

    // 1) Dropping quote 2 is enough.
    const one = composeBriefing(big("seizure", "fine at about 2 PM"), NOW.A01, TZ, qa);
    expect(one.wordCount).toBeLessThanOrEqual(70);
    expect(one.text).toContain("The caller said: '");
    expect(one.text).not.toMatch(/' and '/);
    expect(one.text).toContain("Caller's words:");
    expect(one.text).toContain("Could also be seizure");

    // 2) Still too long → the caller's words go next.
    const longPhrase = "he was totally fine at about 2 PM when we sat down";
    const two = composeBriefing(big("seizure", longPhrase), NOW.A01, TZ, qa);
    expect(two.text).not.toMatch(/' and '/);
    expect(two.text).not.toContain("Caller's words:");
    expect(two.text).toContain("Could also be seizure");
    expect(two.wordCount).toBeLessThanOrEqual(70);

    // 3) Still too long → the look-alike goes last; the fixed sentences always stay.
    const longName = "a complicated migraine with aura or possibly a seizure with weakness afterwards";
    const three = composeBriefing(big(longName, longPhrase), NOW.A01, TZ, qa);
    expect(three.text).not.toContain("Could also be");
    for (const fixed of ["Stroke pre-alert from nine one one", "78-year-old man.", "Signs heard:", "Last known well: 2:00 PM", "Blood thinner: Eliquis", "Not yet confirmed by paramedics."]) {
      expect(three.text).toContain(fixed);
    }
  });
});
