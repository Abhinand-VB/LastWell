// docs/03 §2.
import { z } from "zod/v4";
import { Speaker, Uuid } from "./primitives.js";

export const Utterance = z.object({
  id: Uuid,
  callId: Uuid,
  seq: z.number().int().positive(),
  speaker: Speaker,
  text: z.string().min(1), // exactly as Ink 2 returned it (trimmed)
  tStartMs: z.number().int().nonnegative(), // ms since the call's audio stream started (docs/05 §5); shown as mm:ss
  tEndMs: z.number().int().nonnegative(),
});
export type Utterance = z.infer<typeof Utterance>;

// A validated quote. Only code creates these (docs/03 §7). Models never output utteranceId or t.
export const QuoteRef = z.object({
  quote: z.string().min(3), // verbatim substring of utterances[utteranceId].text (after normalization match)
  utteranceId: Uuid,
  tMs: z.number().int().nonnegative(), // = utterance.tStartMs
  speaker: Speaker,
});
export type QuoteRef = z.infer<typeof QuoteRef>;
