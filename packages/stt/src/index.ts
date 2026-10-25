export { VERSION as CORE_VERSION } from "@lastwell/core";
export {
  BACKPRESSURE_BYTES,
  InkSession,
  inkUrl,
  silence,
  type InkEncoding,
  type InkError,
  type InkFinal,
  type InkPartial,
  type InkProfile,
  type InkSessionEvents,
  type InkSessionOptions,
} from "./inkSession.js";
export { DEFAULT_KEYTERMS, parseKeyterms } from "./keyterms.js";
export { buildWav, paceChunks, parseWav, type PaceOptions, type Wav } from "./wav.js";
