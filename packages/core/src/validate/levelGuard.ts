// Level guard (docs/03 §8, decisions D-06 and D-21). Applied after validation on every reasoner run
// and after each fast pass (using the current modelLevel).
import type { Level, Sign, SignKind } from "../contracts/index.js";

export const DEFAULT_LIKELY_MIN_DISTINCT_SIGNS = 2;

const FOCAL: ReadonlySet<SignKind> = new Set(["face", "arms", "speech"]);

export interface GuardResult {
  level: Level;
  /** One line for the console tooltip next to modelLevel. */
  reason: string;
}

/**
 * no validated sign → none; fewer distinct kinds than the minimum → possible; otherwise
 * max(possible, modelLevel) — except that `likely` also needs a focal sign (face, arms, speech)
 * among the kinds: a balance/eyes-only picture is possible, never likely (D-21).
 */
export function guardLevel(
  signs: readonly Pick<Sign, "kind">[],
  modelLevel: Level,
  likelyMinDistinctSigns: number = DEFAULT_LIKELY_MIN_DISTINCT_SIGNS,
): GuardResult {
  const kinds = new Set(signs.map((s) => s.kind));
  if (kinds.size === 0) return { level: "none", reason: "no validated sign" };
  if (kinds.size < likelyMinDistinctSigns) {
    return { level: "possible", reason: `${kinds.size} sign kind (likely needs ${likelyMinDistinctSigns})` };
  }
  if (modelLevel !== "likely") return { level: "possible", reason: `reasoner says ${modelLevel}` };
  if (![...kinds].some((k) => FOCAL.has(k))) return { level: "possible", reason: "no face, arm or speech sign" };
  return { level: "likely", reason: `${kinds.size} sign kinds and reasoner says likely` };
}
