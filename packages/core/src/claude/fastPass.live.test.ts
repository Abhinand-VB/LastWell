// R-03 live acceptance: docs/04 §2 fixture rows against the real API. Runs only with LIVE=1
// (`pnpm --filter @lastwell/core test:live`); costs cents. Budget: ≤ 3 runs per hour (docs/10 §7.4).
import { describe, expect, it } from "vitest";
import type { Utterance } from "../contracts/index.js";
import { validateFastPass } from "../validate/outputs.js";
import { norm } from "../validate/quotes.js";
import { DEFAULT_CLAUDE_CONFIG, createClaudeClient } from "./client.js";
import { FAST_PASS_FIXTURES } from "./fixtures.js";

describe("fast pass (live)", () => {
  if (!process.env.LIVE) {
    it.skip("set LIVE=1 to run against the Claude API", () => {});
    return;
  }

  const model = createClaudeClient(DEFAULT_CLAUDE_CONFIG);
  const times: number[] = [];

  for (const [i, fx] of FAST_PASS_FIXTURES.entries()) {
    it(`row ${i + 1}: ${fx.utterance}`, { timeout: 30_000 }, async () => {
      const r = await model.fastPass({ utteranceText: fx.utterance, prevDispatcherText: fx.prevDispatcherText });
      times.push(r.ms);
      console.log(`[fast ${i + 1}] ${r.ms} ms`, JSON.stringify(r.output));
      expect(r.output).not.toBeNull();
      const u: Utterance = {
        id: "00000000-0000-4000-8000-000000000001",
        callId: "00000000-0000-4000-8000-000000000000",
        seq: 1,
        speaker: "caller",
        text: fx.utterance,
        tStartMs: 0,
        tEndMs: 1000,
      };
      const v = validateFastPass(r.output ?? { signs: [], facts: [] }, u);
      // Quotes validate with R-02.
      expect(v.drops).toEqual([]);
      expect([...new Set(v.signs.map((s) => s.kind))].sort()).toEqual(fx.signs.map((s) => s.kind).sort());
      for (const want of fx.facts) {
        const got = v.facts.find((f) => f.kind === want.kind);
        expect(got, want.kind).toBeDefined();
        if (want.kind === "last_known_well" && want.value !== undefined) {
          expect(norm(got?.value ?? "")).toContain(norm(want.value).replace(/^since /, ""));
        } else if (want.value !== undefined) {
          expect(got?.value.toLowerCase()).toBe(want.value.toLowerCase());
        }
      }
      if (fx.facts.length === 0) expect(v.facts.filter((f) => f.kind !== "sex")).toEqual([]);
    });
  }

  it("median latency < 1500 ms over the six calls", () => {
    const sorted = [...times].sort((a, b) => a - b);
    const median = sorted.length === 0 ? Infinity : (sorted[Math.floor((sorted.length - 1) / 2)]! + sorted[Math.ceil((sorted.length - 1) / 2)]!) / 2;
    console.log(`[fast] latencies ${sorted.join(", ")} ms; median ${median} ms`);
    expect(median).toBeLessThan(1500);
  });
});
