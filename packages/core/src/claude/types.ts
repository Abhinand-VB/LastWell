// docs/10 §4.1. The one seam between the pipeline and Claude: the gateway and the eval runner receive a
// ModelClient (real: createClaudeClient, fake: createFakeModel) and never call the SDK themselves.
// Inputs are the user-message builder inputs of docs/04 §2–§4; outputs are the docs/03 §4 schemas,
// still untrusted until the quote validator (docs/03 §7) runs.
import type { CaseState, FastPassOutput, QaOutput, ReasonerOutput, Utterance } from "../contracts/index.js";

/** docs/04 §2: one caller utterance plus the immediately preceding dispatcher utterance, if any. */
export interface FastPassInput {
  utteranceText: string;
  /** Context only; never a quote source. null when there was no preceding dispatcher utterance. */
  prevDispatcherText: string | null;
}

/** docs/04 §3: the full transcript so far and the current (guarded) case state. */
export interface ReasonerInput {
  utterances: readonly Utterance[];
  state: CaseState;
  /** Wall-clock start of the call (virtual clock in eval text mode). */
  callStartedAt: Date;
  /** Wall clock now (virtual clock in eval text mode, docs/07 §5). */
  now: Date;
  /** IANA zone, e.g. "America/Los_Angeles" (APP_TIMEZONE, passed by the caller). */
  timezone: string;
}

/** docs/04 §4: one neurologist question during the briefing call. */
export interface QaInput {
  questionText: string;
  utterances: readonly Utterance[];
  state: CaseState;
  now: Date;
  timezone: string;
}

/**
 * output is null when the model refused, ran out of tokens, or returned nothing parseable.
 * Transport errors (timeout after the one retry, 429, 5xx) are thrown, not returned (docs/04 §1).
 */
export interface ModelResult<T> {
  output: T | null;
  ms: number;
  refused?: boolean;
  truncated?: boolean;
}

export interface ModelClient {
  fastPass(input: FastPassInput): Promise<ModelResult<FastPassOutput>>;
  reason(input: ReasonerInput): Promise<ModelResult<ReasonerOutput>>;
  answer(input: QaInput): Promise<ModelResult<QaOutput>>;
}
