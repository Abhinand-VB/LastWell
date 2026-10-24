// Keyword baseline (docs/07 §2): what a keyword-alert feature in a general 911 tool does. It flags
// a call on the first caller utterance matching any pattern. That is the whole baseline.
import type { Speaker } from "../contracts/index.js";

export const BASELINE_PATTERNS: readonly RegExp[] = [
  /\bstroke\b/i, /droop/i, /slur/i, /\bnumb/i, /\bparaly/i, /\bone side\b/i,
  /\bcan'?t (talk|speak)\b/i, /\bface (is|looks) (uneven|crooked|lopsided)\b/i,
];

export interface BaselineTurn {
  speaker: Speaker;
  text: string;
}

export interface BaselineResult {
  flagged: boolean;
  /** Index into the turns of the first flagging caller utterance. */
  index: number | null;
  /** The pattern that matched, for the eval report. */
  pattern: string | null;
}

/** Caller (and single-mic `mixed`) utterances only; the dispatcher's questions never flag. */
export function keywordBaseline(turns: readonly BaselineTurn[]): BaselineResult {
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    if (t === undefined || t.speaker === "dispatcher") continue;
    const hit = BASELINE_PATTERNS.find((p) => p.test(t.text));
    if (hit !== undefined) return { flagged: true, index: i, pattern: hit.source };
  }
  return { flagged: false, index: null, pattern: null };
}
