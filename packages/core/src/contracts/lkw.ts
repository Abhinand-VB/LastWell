// docs/03 §10 — LKW parser I/O (full spec in docs/06).
import { z } from "zod/v4";
import { IsoDateTime } from "./primitives.js";
import { LkwResult } from "./caseState.js";

export const LkwParseInput = z.object({
  phrase: z.string(),
  saidAt: IsoDateTime, // call.streamStartedAt + utterance.tStartMs (docs/05 §5)
  timezone: z.string(), // IANA
});
export type LkwParseInput = z.infer<typeof LkwParseInput>;

export const LkwParseOutput = LkwResult.omit({ ref: true, minutesAgo: true });
export type LkwParseOutput = z.infer<typeof LkwParseOutput>;
