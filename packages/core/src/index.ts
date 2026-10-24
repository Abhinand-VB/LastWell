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
export { loadScripts, type RawScript, type ScriptError, type LoadedScripts } from "./eval/loadScripts.js";
