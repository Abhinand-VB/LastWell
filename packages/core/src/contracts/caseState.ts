// docs/03 §3.
import { z } from "zod/v4";
import { Confidence, FactKind, IsoDateTime, Level, SignKind, Uuid } from "./primitives.js";
import { QuoteRef } from "./transcript.js";

export const ItemSource = z.enum(["fast", "reasoner"]);
export type ItemSource = z.infer<typeof ItemSource>;

export const Sign = z.object({ kind: SignKind, ref: QuoteRef, source: ItemSource });
export type Sign = z.infer<typeof Sign>;

export const Fact = z.object({
  kind: FactKind,
  value: z.string().min(1),
  ref: QuoteRef,
  source: ItemSource,
});
export type Fact = z.infer<typeof Fact>;

export const LkwNote = z.enum(["ampm_assumed", "yesterday_assumed", "older_than_24h", "clipped_to_now"]);
export type LkwNote = z.infer<typeof LkwNote>;

export const LkwResult = z.object({
  phrase: z.string(), // the time expression handed to the parser
  ref: QuoteRef, // where the phrase was said
  lkwAt: IsoDateTime.nullable(), // ISO with offset, point estimate
  rangeStart: IsoDateTime.nullable(),
  rangeEnd: IsoDateTime.nullable(),
  confidence: Confidence,
  note: LkwNote.nullable(), // parser caveats (docs/06 §5)
  display: z.string(), // "2:00 PM (1:45–2:15 PM)" | "yesterday 10:00 PM (8:00–11:59 PM)" | "unknown — ask when last seen normal"
  minutesAgo: z.number().int().nullable(), // computed at render time by the UI from lkwAt; stored null
});
export type LkwResult = z.infer<typeof LkwResult>;

export const Lookalike = z.object({
  name: z.string(), // "low blood sugar", "seizure", "intoxication", "migraine", "Bell's palsy", "head injury", "infection"
  ask: z.string(), // the question the dispatcher should ask, e.g. "Is he diabetic?"
  ref: QuoteRef.nullable(), // the words that raised it, when the model quoted some
});
export type Lookalike = z.infer<typeof Lookalike>;

export const NextQuestionKind = z.enum([
  "lkw", "blood_thinner", "lookalike", "face", "arms", "speech", "balance", "eyes", "onset", "other", "none",
]);
export type NextQuestionKind = z.infer<typeof NextQuestionKind>;

export const NextQuestion = z.object({
  kind: NextQuestionKind,
  text: z.string(), // canonical phrasing from state/nextQuestion.ts for known kinds
});
export type NextQuestion = z.infer<typeof NextQuestion>;

export const Latency = z.object({
  fastPassMs: z.number().int().nullable(),
  reasonerMs: z.number().int().nullable(),
  sttMs: z.number().int().nullable(), // wall time of turn.end − wall time of the last turn.update that changed the transcript
});
export type Latency = z.infer<typeof Latency>;

export const Warning = z.enum(["stt_degraded", "reasoner_delayed"]);
export type Warning = z.infer<typeof Warning>;

export const CaseState = z.object({
  callId: Uuid,
  version: z.number().int().nonnegative(),
  level: Level, // after level guard (docs/03 §8)
  modelLevel: Level, // what the reasoner said, for the latency/debug readout
  signs: z.array(Sign), // deduplicated by (kind, utteranceId); never removed once added
  facts: z.array(Fact), // one per kind (except `medication`: one per distinct value)
  lkw: LkwResult.nullable(),
  lookalikes: z.array(Lookalike), // replaced on each reasoner run
  nextQuestion: NextQuestion.nullable(),
  summary: z.string().nullable(), // one plain sentence from the reasoner, shown as a tooltip only
  reasonerQuestion: NextQuestion.nullable(), // the reasoner's latest raw proposal; not rendered
  droppedCount: z.number().int().nonnegative(), // model items dropped by the validator this call (honesty counter)
  warnings: z.array(Warning), // active degradation banners (docs/05 §9); empty when healthy
  latency: Latency,
  updatedAt: IsoDateTime,
});
export type CaseState = z.infer<typeof CaseState>;

/** The initial state listed under docs/03 §3. */
export function initialCaseState(callId: string, updatedAt: string): CaseState {
  return {
    callId,
    version: 0,
    level: "none",
    modelLevel: "none",
    signs: [],
    facts: [],
    lkw: null,
    lookalikes: [],
    nextQuestion: null,
    summary: null,
    reasonerQuestion: null,
    droppedCount: 0,
    warnings: [],
    latency: { fastPassMs: null, reasonerMs: null, sttMs: null },
    updatedAt,
  };
}

/** Rendering rule (docs/03 §3): the card headline when `signs` is empty. Never "not a stroke". */
export const NO_SIGNS_HEADLINE = "No stroke signs heard yet.";
