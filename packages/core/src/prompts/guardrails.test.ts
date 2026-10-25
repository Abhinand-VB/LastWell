// D-44: the guardrails embedded in the prompts are the docs/guardrails text, byte for byte.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GUARDRAILS_PREAMBLE, withFastGuardrails, withGuardrails } from "./evidenceRules.js";
import { FAST_PASS_BASE, FAST_PASS_SYSTEM } from "./fastPass.js";
import { GUARDRAILS_EXAMPLES, GUARDRAILS_FAST, GUARDRAILS_RULES } from "./guardrails.js";
import { QA_SYSTEM } from "./qa.js";
import { REASONER_BASE, REASONER_SYSTEM } from "./reasoner.js";

const DOC = readFileSync(fileURLToPath(new URL("../../../../docs/guardrails/call-evidence-hard-rules.md", import.meta.url)), "utf8");
const DOCS04 = readFileSync(fileURLToPath(new URL("../../../../docs/04-PROMPTS.md", import.meta.url)), "utf8");

function slice(start: string, end: string): string {
  const a = DOC.indexOf(start);
  return DOC.slice(a, DOC.indexOf(end, a)).trimEnd();
}

describe("call-evidence guardrails (D-44)", () => {
  it("rules A–F and the worked examples match the doc byte for byte (regenerate with scripts/gen-guardrails.mjs)", () => {
    expect(GUARDRAILS_RULES).toBe(slice("## A. Attribute", "\n## Minimal output"));
    expect(GUARDRAILS_EXAMPLES).toBe(slice("## Worked call examples", "\n## Evidence notes"));
    expect(GUARDRAILS_RULES).toMatch(/^## A\. Attribute every claim/);
    expect(GUARDRAILS_FAST).toBe(
      [slice("## A. Attribute", "\n## B. "), slice("## C. Interpret", "\n## D. "), slice("## E. Record", "\n## F. ")].join("\n\n"),
    );
    expect(GUARDRAILS_RULES).toContain("30. **A model must not send or approve a hospital pre-alert.**");
  });

  it("the preamble is verbatim docs/04 §1.1", () => {
    expect(DOCS04).toContain(`\`\`\`\n${GUARDRAILS_PREAMBLE}\n\`\`\``);
  });

  it("fast pass gets sections A, C, E; the reasoner gets A–F + examples; Q&A is unchanged", () => {
    expect(FAST_PASS_SYSTEM).toBe(withFastGuardrails(FAST_PASS_BASE));
    expect(FAST_PASS_SYSTEM).not.toContain("## B. ");
    expect(FAST_PASS_SYSTEM).not.toContain("## Worked call examples");
    expect(REASONER_SYSTEM).toBe(withGuardrails(REASONER_BASE));
    expect(REASONER_SYSTEM).toContain(GUARDRAILS_RULES);
    expect(REASONER_SYSTEM).toContain(GUARDRAILS_EXAMPLES);
    for (const [base, full] of [
      [FAST_PASS_BASE, FAST_PASS_SYSTEM],
      [REASONER_BASE, REASONER_SYSTEM],
    ] as const) {
      expect(full.startsWith(base)).toBe(true);
      // The document's output format, intro and evidence notes are not instructions.
      expect(full).not.toContain("Minimal output for each evaluated call");
      expect(full).not.toContain("dispatcher_review_required");
      expect(full).not.toContain("How to use this document");
      expect(full).not.toContain("Evidence notes and limits");
    }
    expect(QA_SYSTEM).not.toContain("CALL-EVIDENCE HARD RULES");
  });
});
