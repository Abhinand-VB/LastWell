// Briefing composer (docs/05 §7, docs/03 §11). Pure and deterministic: the text is built from the
// validated state only, so the briefing can never contain a fact that was not quoted on the call.
import { DateTime } from "luxon";
import type { CaseState, LkwResult, SignKind } from "../contracts/index.js";
import { norm, normalizeWithMap } from "../validate/quotes.js";

export interface BriefingOptions {
  /** FEATURE_QA_ENABLED, passed by the gateway (core reads no env). */
  qaEnabled: boolean;
}

export interface Briefing {
  text: string;
  wordCount: number;
}

export const MAX_BRIEFING_WORDS = 70;
const MAX_QUOTE_WORDS = 12;

const SIGN_ORDER: readonly SignKind[] = ["balance", "eyes", "face", "arms", "speech"];
const SIGN_LABEL: Record<SignKind, string> = {
  balance: "balance trouble",
  eyes: "vision change",
  face: "facial droop",
  arms: "one-sided weakness",
  speech: "speech trouble",
};

function words(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean);
}

export function countWords(s: string): number {
  return words(s).length;
}

/** Cut to ≤ 12 words at a word boundary and drop trailing punctuation (it is read aloud as a pause). */
function speakableQuote(q: string): string {
  const w = words(q);
  const cut = w.length > MAX_QUOTE_WORDS ? w.slice(0, MAX_QUOTE_WORDS).join(" ") : w.join(" ");
  return cut.replace(/[\s.,;:!?]+$/u, "");
}

function spokenTime(t: DateTime): string {
  return t.setLocale("en-US").toFormat("h:mm a");
}

function minutesAgo(n: number): string {
  if (n > 180) {
    const h = Math.floor(n / 60);
    const m = n % 60;
    return `${h} hours ${m} minute${m === 1 ? "" : "s"} ago`;
  }
  return `${n} minute${n === 1 ? "" : "s"} ago`;
}

/** The caller's original words for the LKW phrase: the span of the validated quote that matches it. */
function lkwWords(lkw: LkwResult): string {
  const target = norm(lkw.phrase);
  const n = normalizeWithMap(lkw.ref.quote);
  const at = target === "" ? -1 : n.text.indexOf(target);
  const first = n.map[at];
  const last = n.map[at + target.length - 1];
  if (at < 0 || !first || !last) return speakableQuote(lkw.ref.quote);
  return speakableQuote(lkw.ref.quote.slice(first[0], last[1]));
}

/**
 * docs/05 §7 rule 4. Also the `spokenLkw` the Q&A path uses. Null when no LKW was established
 * well enough to speak a time (the caller then says the "not established" sentence).
 */
export function spokenLkwSentence(lkw: LkwResult | null, now: Date, tz: string): string {
  const notEstablished = "Last known well time was not established on the call.";
  if (lkw === null || lkw.confidence === "unknown" || lkw.lkwAt === null) return notEstablished;
  const point = DateTime.fromISO(lkw.lkwAt, { setZone: true }).setZone(tz);
  if (!point.isValid) return notEstablished;
  const n = Math.max(0, Math.round(DateTime.fromJSDate(now).diff(point, "minutes").minutes));

  if (lkw.note === "ampm_assumed" || lkw.note === "yesterday_assumed") {
    return `Last known well: possibly ${spokenTime(point)}, unconfirmed.`;
  }
  if (lkw.note === "older_than_24h") {
    return `Last known well: ${point.setLocale("en-US").toFormat("cccc")} ${spokenTime(point)}, more than a day ago.`;
  }
  if (lkw.confidence === "vague" && lkw.rangeStart !== null && lkw.rangeEnd !== null) {
    const a = DateTime.fromISO(lkw.rangeStart, { setZone: true }).setZone(tz);
    const b = DateTime.fromISO(lkw.rangeEnd, { setZone: true }).setZone(tz);
    if (a.isValid && b.isValid) {
      return `Last known well: between ${spokenTime(a)} and ${spokenTime(b)}, roughly ${minutesAgo(n)}.`;
    }
  }
  return `Last known well: ${spokenTime(point)}, ${minutesAgo(n)}.`;
}

function patientSentence(state: CaseState): string {
  const ageValue = state.facts.find((f) => f.kind === "age")?.value.trim() ?? "";
  const age = /^\d{1,3}$/.test(ageValue) ? ageValue : null;
  const sexValue = state.facts.find((f) => f.kind === "sex")?.value.trim().toLowerCase();
  const noun = sexValue === "male" ? "man" : sexValue === "female" ? "woman" : null;
  if (age !== null && noun !== null) return `${age}-year-old ${noun}.`;
  if (age !== null) return `${age}-year-old patient.`;
  if (noun !== null) return `Adult ${noun}.`;
  return "Adult patient.";
}

/** Up to two caller quotes, shortest by word count, distinct by text. */
function pickQuotes(state: CaseState): string[] {
  const seen = new Set<string>();
  const quotes: string[] = [];
  const candidates = state.signs
    .filter((s) => s.ref.speaker === "caller" || s.ref.speaker === "mixed")
    .map((s) => speakableQuote(s.ref.quote))
    .sort((a, b) => countWords(a) - countWords(b) || a.localeCompare(b));
  for (const q of candidates) {
    const key = norm(q);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    quotes.push(q);
    if (quotes.length === 2) break;
  }
  return quotes;
}

export function composeBriefing(snapshot: CaseState, now: Date, tz: string, opts: BriefingOptions): Briefing {
  const kinds = SIGN_ORDER.filter((k) => snapshot.signs.some((s) => s.kind === k));
  const quotes = pickQuotes(snapshot);
  const thinner = snapshot.facts.find((f) => f.kind === "blood_thinner");
  const lkw = snapshot.lkw;
  const lkwKnown = lkw !== null && lkw.confidence !== "unknown" && lkw.lkwAt !== null;
  const lookalike = snapshot.level === "possible" ? snapshot.lookalikes[0] : undefined;

  const opening = "Stroke pre-alert from nine one one, approved by the dispatcher.";
  const patient = patientSentence(snapshot);
  const signs = kinds.length > 0 ? `Signs heard: ${kinds.map((k) => SIGN_LABEL[k]).join(" and ")}.` : null;
  const time = spokenLkwSentence(lkw, now, tz);
  const callersWords = lkwKnown && lkw !== null ? `Caller's words: '${lkwWords(lkw)}'.` : null;
  const blood =
    thinner === undefined
      ? "Blood thinners were not mentioned."
      : thinner.value.trim().toLowerCase() === "none"
        ? "The caller says no blood thinners."
        : `Blood thinner: ${thinner.value.trim()}, per the caller.`;
  const looksLike = lookalike !== undefined ? `Could also be ${lookalike.name}; not yet ruled out.` : null;
  const close = opts.qaEnabled
    ? "Not yet confirmed by paramedics. You can ask me about the call now."
    : "Not yet confirmed by paramedics. Goodbye.";

  // Optional parts, in the order they are dropped when the text runs long.
  let quote2: string | null = quotes[1] ?? null;
  let words2: string | null = callersWords;
  let alike: string | null = looksLike;

  const build = (): string => {
    const quoteSentence =
      quotes[0] === undefined ? null : quote2 === null ? `The caller said: '${quotes[0]}'.` : `The caller said: '${quotes[0]}' and '${quote2}'.`;
    return [opening, patient, signs, quoteSentence, time, words2, blood, alike, close].filter((s): s is string => s !== null).join(" ");
  };

  let text = build();
  if (countWords(text) > MAX_BRIEFING_WORDS && quote2 !== null) {
    quote2 = null;
    text = build();
  }
  if (countWords(text) > MAX_BRIEFING_WORDS && words2 !== null) {
    words2 = null;
    text = build();
  }
  if (countWords(text) > MAX_BRIEFING_WORDS && alike !== null) {
    alike = null;
    text = build();
  }
  return { text, wordCount: countWords(text) };
}
