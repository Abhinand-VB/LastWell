// E-01 offline: the text-mode runner against the fake model (docs/07 §6 items 1, 4, 5).
import { describe, expect, it } from "vitest";
import { createFakeModel } from "@lastwell/core";
import { EvalEnv, requireApiKey } from "./env.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, parseArgs, rescore, runEval, withBackoff } from "./run.js";
import { contradicts } from "./score.js";

const env = EvalEnv.parse({});

describe("eval runner (text mode, fake model)", () => {
  it("parses args, ignoring a stray `--`", () => {
    const a = parseArgs(["--", "--mode", "text", "--ids", "a01,B01", "--model=fake"]);
    expect(a).toMatchObject({ mode: "text", ids: ["A01", "B01"], model: "fake" });
    expect(() => parseArgs(["--ids", "A01"])).toThrow(/--mode/);
  });

  it("--ids A01,B01,C01 prints the summary table with no NaN", async () => {
    const run = await runEval(parseArgs(["--mode", "text", "--ids", "A01,B01,C01", "--model", "fake"]), env, createFakeModel(), false, () => {});
    expect(run.records.map((r) => r.id)).toEqual(["A01", "B01", "C01"]);
    expect(run.markdown).not.toContain("NaN");
    expect(run.markdown).toContain("| Sensitivity @possible (n=2) | 2/2 (100%) |");
    expect(run.markdown).toContain("| Invented facts shown | 0 |");
    const a01 = run.records[0];
    expect(a01?.finalLevel).toBe("likely");
    expect(a01?.firstPossibleS).toBe(11);
    expect(a01?.lkw).toMatchObject({ correct: true, unknown: false });
    expect(a01?.bloodThinner).toMatchObject({ correct: true, shown: "Eliquis" });
    expect(run.records[2]?.lookalike).toEqual({ truth: "low blood sugar", shown: ["low blood sugar"] });
  });

  it("all 20 scripts run, and the baseline numbers reproduce exactly across two runs", async () => {
    const args = parseArgs(["--mode", "text", "--model", "fake"]);
    const a = await runEval(args, env, createFakeModel(), false, () => {});
    const b = await runEval(args, env, createFakeModel(), false, () => {});
    expect(a.records).toHaveLength(20);
    expect(a.records.map((r) => r.baseline)).toEqual(b.records.map((r) => r.baseline));
    expect(a.markdown).not.toContain("NaN");
    expect(a.markdown).toContain("| Level agreement (n=20) |");
  });

  it("refuses a live run without ANTHROPIC_API_KEY, with a clear message", async () => {
    expect(() => requireApiKey(EvalEnv.parse({}))).toThrow(/ANTHROPIC_API_KEY is not set/);
    expect(requireApiKey(EvalEnv.parse({ ANTHROPIC_API_KEY: "k" }))).toBe("k");
  });

  it("audio mode is refused (D-33)", async () => {
    expect(await main(["--mode", "audio"])).toBe(2);
  });

  it("backs off once on 429", async () => {
    let n = 0;
    const flaky = {
      ...createFakeModel(),
      fastPass: async () => {
        n++;
        if (n === 1) throw Object.assign(new Error("rate limited"), { status: 429 });
        return { output: { signs: [], facts: [] }, ms: 1 };
      },
    };
    const r = await withBackoff(flaky, 1).fastPass({ utteranceText: "x", prevDispatcherText: null });
    expect(r.output).toEqual({ signs: [], facts: [] });
    expect(n).toBe(2);
  });

  it("wrong facts: yes/no polarity for history facts, text for age/sex/address/blood thinner", () => {
    expect(contradicts("migraine_history", "gets migraines", "yes")).toBe(false);
    expect(contradicts("head_injury", "hit her head", "no")).toBe(true);
    expect(contradicts("seizure_history", "no seizures", "no")).toBe(false);
    expect(contradicts("age", "78", "78")).toBe(false);
    expect(contradicts("sex", "female", "male")).toBe(true);
    expect(contradicts("onset", "suddenly", "gradual")).toBe(false);
    expect(contradicts("alcohol_or_drugs", "does not drink at all", "doesn't drink")).toBe(false);
  });

  it("--rescore reproduces the table from a saved results file", async () => {
    const out = mkdtempSync(join(tmpdir(), "lw-eval-"));
    const args = parseArgs(["--mode", "text", "--ids", "A01,C01", "--model", "fake", "--out", out]);
    const run = await runEval(args, env, createFakeModel(), true, () => {});
    expect(run.outFile).not.toBeNull();
    const again = rescore(run.outFile ?? "", args.scriptsDir, env);
    expect(again.replace(", rescored", "")).toBe(run.markdown);
  });
});
