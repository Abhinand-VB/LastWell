// D-44 / D-46: the call-evidence rules in the prompts are docs/guardrails/call-evidence-rules.model.md,
// byte for byte, and every compact rule traces to a numbered rule of the original.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { withFastGuardrails, withGuardrails } from "./evidenceRules.js";
import { FAST_PASS_BASE, FAST_PASS_SYSTEM } from "./fastPass.js";
import { GUARDRAILS_MODEL, GUARDRAILS_MODEL_AC } from "./guardrails.js";
import { QA_SYSTEM } from "./qa.js";
import { REASONER_BASE, REASONER_SYSTEM } from "./reasoner.js";

const dir = (f: string): string => readFileSync(fileURLToPath(new URL(`../../../../docs/guardrails/${f}`, import.meta.url)), "utf8");
const MODEL = dir("call-evidence-rules.model.md");
const ORIGINAL = dir("call-evidence-hard-rules.md");

describe("call-evidence rules (D-44, D-46)", () => {
  it("the embedded text is the compact file byte for byte (regenerate with scripts/gen-guardrails.mjs)", () => {
    expect(GUARDRAILS_MODEL).toBe(MODEL.trimEnd());
    const a = MODEL.indexOf("## A. ");
    const c = MODEL.indexOf("## C. ");
    expect(GUARDRAILS_MODEL_AC).toBe(
      [MODEL.slice(0, a).trimEnd(), MODEL.slice(a, MODEL.indexOf("\n## B. ")).trimEnd(), MODEL.slice(c, MODEL.indexOf("\n## D. ")).trimEnd()].join("\n\n"),
    );
  });

  it("every rule line traces to a numbered rule of the original, and all 30 are covered", () => {
    const rules = MODEL.split("\n").filter((l) => l.startsWith("- "));
    for (const line of rules) expect(line, line).toMatch(/\[R\d+(, R\d+)*\]$/);
    const cited = new Set([...MODEL.matchAll(/R(\d+)/g)].map((m) => Number(m[1])));
    for (let n = 1; n <= 30; n++) {
      expect(cited.has(n), `R${n}`).toBe(true);
      expect(ORIGINAL).toContain(`\n${n}. **`);
    }
    expect([...cited].every((n) => n >= 1 && n <= 30)).toBe(true);
  });

  it("the compact file is model-facing: no citations, research notes or output field list, ≤ 40% of the original", () => {
    expect(MODEL).not.toMatch(/\[E\d+/);
    expect(MODEL).not.toContain("Minimal output");
    expect(MODEL).not.toContain("Evidence notes");
    expect(MODEL).not.toContain("dispatcher_review_required");
    expect(MODEL.split(/\s+/).length).toBeLessThanOrEqual(0.4 * ORIGINAL.split(/\s+/).length);
  });

  it("fast pass and reasoner get base + rules; Q&A is unchanged", () => {
    expect(FAST_PASS_SYSTEM).toBe(withFastGuardrails(FAST_PASS_BASE));
    expect(REASONER_SYSTEM).toBe(withGuardrails(REASONER_BASE));
    expect(REASONER_SYSTEM).toBe(`${REASONER_BASE}\n\n${GUARDRAILS_MODEL}`);
    expect(FAST_PASS_SYSTEM.startsWith(FAST_PASS_BASE)).toBe(true);
    expect(FAST_PASS_SYSTEM).toContain(GUARDRAILS_MODEL_AC.slice(0, 200));
    expect(QA_SYSTEM).not.toContain("CALL-EVIDENCE RULES");
  });
});
