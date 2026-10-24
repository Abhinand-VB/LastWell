// docs/03 §4. The output_config.format schemas. Every object is strict (an unexpected property
// fails parsing); everything here is untrusted until the quote validator (docs/03 §7) runs.
// No property may be named reasoning / rationale / thinking / steps (gotcha G-26).
import { z } from "zod/v4";
import { FactKind, Level, SignKind } from "./primitives.js";
import { NextQuestionKind } from "./caseState.js";

const QuotedSign = z.object({ kind: SignKind, quote: z.string() }).strict();
const QuotedFact = z.object({ kind: FactKind, value: z.string(), quote: z.string() }).strict();

// 4.1 Fast pass — claude-haiku-5-5, one caller utterance (+ preceding dispatcher question as context)
export const FastPassOutput = z
  .object({
    signs: z.array(QuotedSign),
    facts: z.array(QuotedFact),
  })
  .strict();
export type FastPassOutput = z.infer<typeof FastPassOutput>;

// 4.2 Reasoner — claude-sonnet-5-5, whole transcript + current state
export const ReasonerOutput = z
  .object({
    level: Level,
    signs: z.array(QuotedSign),
    last_known_well: z.object({ phrase: z.string(), quote: z.string() }).strict().nullable(),
    blood_thinner: z.object({ value: z.string(), quote: z.string() }).strict().nullable(),
    other_facts: z.array(QuotedFact),
    lookalikes: z.array(z.object({ name: z.string(), ask: z.string(), quote: z.string().nullable() }).strict()),
    next_question: z.object({ kind: NextQuestionKind, text: z.string() }).strict(),
    summary: z.string(), // ≤ 25 words, plain language, no diagnosis wording
  })
  .strict();
export type ReasonerOutput = z.infer<typeof ReasonerOutput>;

// 4.3 Q&A — claude-haiku-5-5, neurologist question + transcript + validated facts
export const QaOutput = z
  .object({
    known: z.boolean(), // false → the gateway speaks the fallback phrase
    answer: z.string(), // ≤ 30 words, spoken style
    evidence: z.array(z.object({ quote: z.string() }).strict()), // verbatim quotes supporting the answer
  })
  .strict();
export type QaOutput = z.infer<typeof QaOutput>;
