export const VERSION = "0.0.0";

export * from "./contracts/index.js";
export { validateScript, checkTruth, type ScriptCheck } from "./eval/validateScript.js";
export {
  ADDRESS_QUESTION,
  MAX_QUOTE_CHARS,
  checkQuote,
  norm,
  normalizeWithMap,
  phraseWithinQuote,
  validateQuote,
  type DropReason,
  type QuoteCheck,
  type QuotePurpose,
} from "./validate/quotes.js";
export { DEFAULT_LIKELY_MIN_DISTINCT_SIGNS, guardLevel, type GuardResult } from "./validate/levelGuard.js";
export {
  validateFastPass,
  validateReasoner,
  type Drop,
  type ValidatedFact,
  type ValidatedFastPass,
  type ValidatedReasoner,
  type ValidatedSign,
} from "./validate/outputs.js";
export { isLkwEstablished, nextQuestion, resolveLookalike, type LookalikeResolution } from "./state/nextQuestion.js";
export {
  addWarning,
  applyFastPass,
  applyReasoner,
  publish,
  removeWarning,
  setSttLatency,
  type ReduceResult,
  type ReducerConfig,
} from "./state/reducer.js";
export { parseLkw } from "./lkw/parser.js";
export { formatLkw, formatRange, UNKNOWN_DISPLAY } from "./lkw/format.js";
export { loadScripts, type RawScript, type ScriptError, type LoadedScripts } from "./eval/loadScripts.js";
