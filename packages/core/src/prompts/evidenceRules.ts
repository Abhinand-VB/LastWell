// docs/04 §1.1 (D-44, D-46): the call-evidence rules appended to the fast-pass and reasoner system
// prompts, from docs/guardrails/call-evidence-rules.model.md (generated into guardrails.ts). They sit in
// the cached system block, so every transcript the model reads comes with them.
import { GUARDRAILS_MODEL, GUARDRAILS_MODEL_AC } from "./guardrails.js";

/** Reasoner: base prompt (verbatim docs/04 §3) + the whole compact rules file. */
export function withGuardrails(base: string): string {
  return `${base}\n\n${GUARDRAILS_MODEL}`;
}

/** Fast pass: base prompt (verbatim docs/04 §2) + the compact rules file. */
export function withFastGuardrails(base: string): string {
  return `${base}\n\n${GUARDRAILS_MODEL}`;
}

export { GUARDRAILS_MODEL_AC };
