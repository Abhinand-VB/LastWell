// docs/03 §1. Contracts use the zod/v4 API (shipped inside zod 3.25) because the Claude SDK's
// zodOutputFormat helper is built on zod/v4 (docs/09 D-24).
import { z } from "zod/v4";

export const SignKind = z.enum(["balance", "eyes", "face", "arms", "speech"]);
// BE-FAST "T" (time) is not a sign a caller describes; it is represented by the LKW fact.
export type SignKind = z.infer<typeof SignKind>;

export const FactKind = z.enum([
  "last_known_well", // value = the time phrase exactly as spoken, e.g. "fine at about 2 PM"
  "blood_thinner", // value = drug or class name as spoken: "Eliquis", "warfarin", "blood thinner"
  "age", // value = digits, e.g. "78"
  "sex", // value = "male" | "female" (inferred from words like father/wife; quote required)
  "diabetes", // value = "yes" | "no" | "insulin" | "skipped meal" …
  "seizure_history", // value = "yes" | "no" | "epilepsy"
  "onset", // value = how it started: "sudden" | "gradual" | "woke up with it"
  "medication", // value = any other named medication (several facts of this kind may coexist)
  "address", // value = location as spoken
  "alcohol_or_drugs", // value = as spoken
  "head_injury", // value = as spoken
  "fever_or_infection", // value = as spoken
  "migraine_history", // value = "yes" | "no" | "headache now" …
]);
export type FactKind = z.infer<typeof FactKind>;

export const Level = z.enum(["none", "possible", "likely"]);
export type Level = z.infer<typeof Level>;

export const Speaker = z.enum(["caller", "dispatcher", "mixed"]);
export type Speaker = z.infer<typeof Speaker>;

// replay = a scripted call fed through the live pipeline for the demo (Cards B/C) and the smoke test.
// The eval runner writes no calls.
export const CallMode = z.enum(["phone", "browser", "replay"]);
export type CallMode = z.infer<typeof CallMode>;

export const Confidence = z.enum(["exact", "approx", "vague", "unknown"]);
export type Confidence = z.infer<typeof Confidence>;

export const E164 = z.string().regex(/^\+[1-9]\d{6,14}$/);
export const Uuid = z.string().uuid();

/** ISO 8601 date-time with an explicit offset, e.g. 2026-10-25T14:00:00-07:00. */
export const IsoDateTime = z.string().datetime({ offset: true });
