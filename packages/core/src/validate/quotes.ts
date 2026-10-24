// The quote validator (docs/03 §7): the gate between models and humans. A model-written quote
// becomes a QuoteRef only when it is, after normalization, a substring of one eligible utterance.
// Never "repair" a quote by fuzzy matching — a near-miss is a drop.
import type { FactKind, QuoteRef, Speaker, Utterance } from "../contracts/index.js";

/** What the quoted item is for; decides which speakers may supply the evidence. */
export type QuotePurpose = "sign" | "lookalike" | FactKind | { qa: string };

export type DropReason = "too_short" | "too_long" | "no_match";

export type QuoteCheck = { ok: true; ref: QuoteRef } | { ok: false; reason: DropReason };

export const MAX_QUOTE_CHARS = 160;
const MIN_NORM_CHARS = 3;

/** docs/03 §7 step 3: a Q&A question "about the address". */
export const ADDRESS_QUESTION = /\b(address|where (is|are|do|does)|location|apartment|street)\b/i;

const CURLY: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'",
  "“": '"', "”": '"', "„": '"', "‟": '"', "″": '"',
  "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "―": "-", "−": "-",
};

interface Normalized {
  text: string;
  /** For each char of `text`: [start, end) of the original UTF-16 span it came from. */
  map: Array<[number, number]>;
}

/**
 * norm(s) with a position map back into `s`: NFKC → lowercase → curly quotes/dashes to ASCII →
 * keep only [a-z0-9 ] → collapse whitespace → trim. Apostrophes are dropped too, so "can't",
 * "can’t" and "cant" compare equal (docs/03 §7 test list; decision D-26).
 */
export function normalizeWithMap(s: string): Normalized {
  let text = "";
  const map: Array<[number, number]> = [];
  let i = 0;
  for (const cp of s) {
    const start = i;
    i += cp.length;
    const folded = cp.normalize("NFKC").toLowerCase();
    for (const raw of folded) {
      const ch = CURLY[raw] ?? raw;
      if (/\s/.test(ch)) {
        if (text.length > 0 && !text.endsWith(" ")) {
          text += " ";
          map.push([start, i]);
        }
      } else if (/[a-z0-9]/.test(ch)) {
        text += ch;
        map.push([start, i]);
      }
    }
  }
  if (text.endsWith(" ")) {
    text = text.slice(0, -1);
    map.pop();
  }
  return { text, map };
}

export function norm(s: string): string {
  return normalizeWithMap(s).text;
}

function eligibleSpeakers(purpose: QuotePurpose): ReadonlySet<Speaker> {
  if (purpose === "address") return new Set(["caller", "mixed", "dispatcher"]);
  if (typeof purpose === "object") {
    return ADDRESS_QUESTION.test(purpose.qa)
      ? new Set(["caller", "mixed", "dispatcher"])
      : new Set(["caller", "mixed"]);
  }
  return new Set(["caller", "mixed"]);
}

/** Validate one model quote against the utterances the model was shown. */
export function checkQuote(quote: string, purpose: QuotePurpose, utterances: readonly Utterance[]): QuoteCheck {
  if (quote.trim().length > MAX_QUOTE_CHARS) return { ok: false, reason: "too_long" };
  const q = norm(quote);
  if (q.length < MIN_NORM_CHARS || q.split(" ").filter(Boolean).length < 1) return { ok: false, reason: "too_short" };

  // Filter by eligible speaker first, then search newest first: a dispatcher echo can never
  // shadow the caller's own words.
  const speakers = eligibleSpeakers(purpose);
  const candidates = utterances.filter((u) => speakers.has(u.speaker)).sort((a, b) => b.seq - a.seq);

  for (const u of candidates) {
    const n = normalizeWithMap(u.text);
    const at = n.text.indexOf(q);
    if (at < 0) continue;
    const first = n.map[at];
    const last = n.map[at + q.length - 1];
    if (!first || !last) continue;
    return {
      ok: true,
      ref: { quote: u.text.slice(first[0], last[1]), utteranceId: u.id, tMs: u.tStartMs, speaker: u.speaker },
    };
  }
  return { ok: false, reason: "no_match" };
}

/** docs/03 §7: `QuoteRef` or `null`. The caller counts a null as a drop and logs `validator.dropped`. */
export function validateQuote(quote: string, purpose: QuotePurpose, utterances: readonly Utterance[]): QuoteRef | null {
  const r = checkQuote(quote, purpose, utterances);
  return r.ok ? r.ref : null;
}

/**
 * docs/03 §7: an LKW time phrase must itself be inside its validated quote (normalized),
 * otherwise the whole item is dropped.
 */
export function phraseWithinQuote(phrase: string, quote: string): boolean {
  const p = norm(phrase);
  return p.length > 0 && norm(quote).includes(p);
}
