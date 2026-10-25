// The model hands over `phrase`; the validator only checks it lies inside the quote. A phrase that is
// a truncated span of the caller's time expression ("an hour ago" out of "about half an hour ago")
// would parse to the wrong time, so the reducer widens it to the whole expression in the quote first.
import { norm } from "../validate/quotes.js";

/** Words that can belong to a time expression to the left of the model's span. */
const LEFT = new Set([
  "half", "a", "an", "and", "quarter", "about", "around", "roughly", "approximately", "maybe", "almost", "nearly",
  "over", "under", "like", "just", "or", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "couple", "few", "several", "of",
]);
/** Words that can continue it to the right ("an hour" → "an hour and a half ago"). */
const RIGHT = new Set(["and", "a", "half", "ago", "hour", "hours", "minute", "minutes", "mins", "hrs"]);

const isNum = (w: string) => /^\d+$/.test(w);

export function widenPhrase(phrase: string, quote: string): string {
  const qTok = quote.split(/\s+/).filter((t) => t !== "");
  const qNorm = qTok.map((t) => norm(t));
  const pNorm = phrase.split(/\s+/).map((t) => norm(t)).filter((t) => t !== "");
  if (pNorm.length === 0) return phrase;
  let at = -1;
  for (let i = 0; i + pNorm.length <= qNorm.length && at < 0; i++) {
    if (pNorm.every((w, j) => qNorm[i + j] === w)) at = i;
  }
  if (at < 0) return phrase;
  let from = at;
  let to = at + pNorm.length; // exclusive
  while (from > 0 && (LEFT.has(qNorm[from - 1]!) || isNum(qNorm[from - 1]!))) from--;
  // Never end on a dangling connector ("and a" without "half ago").
  let end = to;
  while (end < qNorm.length && RIGHT.has(qNorm[end]!)) {
    end++;
    if (qNorm[end - 1] === "ago" || qNorm[end - 1] === "half") to = end;
  }
  if (from === at && to === at + pNorm.length) return phrase;
  return qTok
    .slice(from, to)
    .join(" ")
    .replace(/[.,;!?]+$/, "");
}
