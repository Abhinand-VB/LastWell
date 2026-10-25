// R-08 live acceptance (docs/04 §4): the Q&A call on the A01 transcript + state. Runs only with LIVE=1.
// The spoken answer's post-processing (quote-or-drop, fallback phrase, LKW rule) lives in the gateway
// (apps/gateway/src/alerts/qaAnswer.ts); here the raw model output is checked against the same rules.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CaseState, EvalScript, type Utterance } from "../contracts/index.js";
import { validateQuote } from "../validate/quotes.js";
import { DEFAULT_CLAUDE_CONFIG, createClaudeClient } from "./client.js";

const SCRIPTS = fileURLToPath(new URL("../../../../apps/eval/scripts/", import.meta.url));
const FIXTURES = fileURLToPath(new URL("../fixtures/", import.meta.url));
const TZ = "America/Los_Angeles";

describe("Q&A (live)", () => {
  if (!process.env.LIVE) {
    it.skip("set LIVE=1 to run against the Claude API", () => {});
    return;
  }
  const model = createClaudeClient(DEFAULT_CLAUDE_CONFIG);
  const script = EvalScript.parse(JSON.parse(readFileSync(`${SCRIPTS}A01.json`, "utf8")));
  const state = CaseState.parse(JSON.parse(readFileSync(`${FIXTURES}caseState.A01.json`, "utf8")));
  const utterances: Utterance[] = script.turns.map((t, i) => ({
    id: `${state.callId.slice(0, 24)}${String(i + 1).padStart(12, "0")}`,
    callId: state.callId,
    seq: i + 1,
    speaker: t.speaker,
    text: t.text,
    tStartMs: t.atMs,
    tEndMs: t.atMs + 1500,
  }));
  // The briefing is 48 minutes after LKW (2:00 PM), as in the composer fixture.
  const now = new Date("2026-10-25T21:48:00Z");
  const ask = async (questionText: string) => {
    const r = await model.answer({ questionText, utterances, state, now, timezone: TZ });
    console.log(`[qa] "${questionText}" ${r.ms} ms`, JSON.stringify(r.output));
    return r;
  };
  const validated = (q: string, evidence: { quote: string }[]) => evidence.filter((e) => validateQuote(e.quote, { qa: q }, utterances) !== null);

  it("blood thinners → known, Eliquis, evidence validates, < 2 s", { timeout: 30_000 }, async () => {
    const q = "Is he on blood thinners?";
    const r = await ask(q);
    expect(r.output?.known).toBe(true);
    expect(r.output?.answer).toContain("Eliquis");
    expect(validated(q, r.output?.evidence ?? []).length).toBeGreaterThan(0);
    expect(r.ms).toBeLessThan(2000);
  });

  it("seizure → not known (the gateway speaks the fallback phrase), < 2 s", { timeout: 30_000 }, async () => {
    const r = await ask("Any seizure before this?");
    expect(r.output?.known).toBe(false);
    expect(r.ms).toBeLessThan(2000);
  });

  it("last normal → 2:00 PM, no parentheses or dashes, < 2 s", { timeout: 30_000 }, async () => {
    const r = await ask("When was he last normal?");
    expect(r.output?.answer).toContain("2:00 PM");
    expect(r.output?.answer).not.toMatch(/[()–—]/);
    expect(r.ms).toBeLessThan(2000);
  });

  it("address → accepted with dispatcher or caller evidence, < 2 s", { timeout: 30_000 }, async () => {
    const q = "What's the address?";
    const r = await ask(q);
    expect(r.output?.known).toBe(true);
    expect(validated(q, r.output?.evidence ?? []).length).toBeGreaterThan(0);
    expect(r.ms).toBeLessThan(2000);
  });
});
