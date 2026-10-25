// docs/04 §1.1 (D-44): the call-evidence hard rules appended to the fast-pass and reasoner system
// prompts. The preamble is verbatim docs/04; the rules and examples are verbatim
// docs/guardrails/call-evidence-hard-rules.md (generated into guardrails.ts).
import { GUARDRAILS_EXAMPLES, GUARDRAILS_FAST, GUARDRAILS_RULES } from "./guardrails.js";

export const GUARDRAILS_PREAMBLE = `CALL-EVIDENCE HARD RULES (docs/guardrails/call-evidence-hard-rules.md, v1.0)
The numbered rules and worked examples below are LastWell's evidence contract. They add to the rules above and never relax them. Apply them inside the JSON schema you were given: do not add fields, statuses, turn numbers, timestamps or confidence values, and do not produce the evidence-record format the source document describes.
How the rules map onto this schema:
- Emit a sign only for an affirmed, current finding about this patient in a caller utterance. Leave it out when it is denied, asked about but not answered, tentative ("maybe", "I think", "it looked like"), historical or long-standing, about another person, only heard secondhand and not described as seen, or later corrected by the caller. Where the rules say a finding is unknown, suspected, disputed or absent, it is simply not emitted.
- A denied fact keeps the value the rules above give it (for example blood_thinner "none" for "No, nothing like that").
- Time phrases stay as the caller's words; code turns them into clock times.
- Rules 29 and 30 restate limits you already follow: no diagnosis, no probability, no alert decisions.`;

/** Reasoner: base prompt (verbatim docs/04 §3) + preamble + rules A–F + worked examples. */
export function withGuardrails(base: string): string {
  return [base, GUARDRAILS_PREAMBLE, GUARDRAILS_RULES, GUARDRAILS_EXAMPLES].join("\n\n");
}

/** Fast pass: base prompt (verbatim docs/04 §2) + preamble + sections A, C and E only (latency, D-44). */
export function withFastGuardrails(base: string): string {
  return [base, GUARDRAILS_PREAMBLE, GUARDRAILS_FAST].join("\n\n");
}
