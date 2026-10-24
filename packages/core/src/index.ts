export const VERSION = "0.0.0";

export * from "./contracts/index.js";
export { validateScript, checkTruth, type ScriptCheck } from "./eval/validateScript.js";
export { loadScripts, type RawScript, type ScriptError, type LoadedScripts } from "./eval/loadScripts.js";
