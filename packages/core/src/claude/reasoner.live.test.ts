// R-06 live acceptance: the reasoner on the full A01, B01 and C01 transcripts. Runs only with LIVE=1.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { CaseState, EvalScript, type Utterance } from "../contracts/index.js";
import { validateReasoner } from "../validate/outputs.js";
import { DEFAULT_CLAUDE_CONFIG, createClaudeClient } from "./client.js";

const SCRIPTS = fileURLToPath(new URL("../../../../apps/eval/scripts/", import.meta.url));
const FIXTURES = fileURLToPath(new URL("../fixtures/", import.meta.url));
const TZ = "America/Los_Angeles";

/** `turns`: how many turns of the script the reasoner sees (default all); the state keeps only items from them. */
function load(id: string, turns?: number) {
  const script = EvalScript.parse(JSON.parse(readFileSync(`${SCRIPTS}${id}.json`, "utf8")));
  const full = CaseState.parse(JSON.parse(readFileSync(`${FIXTURES}caseState.${id}.json`, "utf8")));
  script.turns = script.turns.slice(0, turns ?? script.turns.length);
  const seen = (ref: { utteranceId: string }): boolean => Number(ref.utteranceId.slice(24)) <= script.turns.length;
  const state: CaseState = { ...full, signs: full.signs.filter((s) => seen(s.ref)), facts: full.facts.filter((f) => seen(f.ref)) };
  const utterances: Utterance[] = script.turns.map((t, i) => ({
    id: `${state.callId.slice(0, 24)}${String(i + 1).padStart(12, "0")}`,
    callId: state.callId,
    seq: i + 1,
    speaker: t.speaker,
    text: t.text,
    tStartMs: t.atMs,
    tEndMs: t.atMs + 1500,
  }));
  const start = DateTime.fromISO(script.callStartLocal, { zone: TZ });
  const last = script.turns[script.turns.length - 1]?.atMs ?? 0;
  return { utterances, state, callStartedAt: start.toJSDate(), now: start.plus({ milliseconds: last }).toJSDate(), timezone: TZ };
}

describe("reasoner (live)", () => {
  if (!process.env.LIVE) {
    it.skip("set LIVE=1 to run against the Claude API", () => {});
    return;
  }
  const model = createClaudeClient(DEFAULT_CLAUDE_CONFIG);

  it("A01: likely, speech + arms, LKW about 2 PM, Eliquis, < 7 s", { timeout: 60_000 }, async () => {
    const input = load("A01");
    const r = await model.reason(input);
    console.log(`[reasoner A01] ${r.ms} ms`, JSON.stringify(r.output));
    const out = r.output;
    expect(out).not.toBeNull();
    if (out === null) return;
    const v = validateReasoner(out, input.utterances);
    expect(out.level).toBe("likely");
    const kinds = new Set(v.signs.map((s) => s.kind));
    expect(kinds.has("speech") && kinds.has("arms")).toBe(true);
    expect(out.last_known_well?.phrase.toLowerCase()).toContain("about 2 pm");
    expect(out.blood_thinner?.value).toBe("Eliquis");
    expect(["none", "face", "arms", "speech", "balance", "eyes"]).toContain(out.next_question.kind);
    expect(r.ms).toBeLessThan(7000);
  });

  // Through the LKW answer (6 turns): after that the dispatcher has already checked face and arms,
  // so a speech check is the right proposal on the full transcript (seen in the first live run).
  it("B01 (6 turns): possible, balance + eyes, next question face or arms", { timeout: 60_000 }, async () => {
    const input = load("B01", 6);
    const r = await model.reason(input);
    console.log(`[reasoner B01] ${r.ms} ms`, JSON.stringify(r.output));
    expect(r.output?.level).toBe("possible");
    const kinds = new Set((r.output?.signs ?? []).map((s) => s.kind));
    expect(kinds.has("balance") && kinds.has("eyes")).toBe(true);
    expect(["face", "arms"]).toContain(r.output?.next_question.kind);
  });

  it("C01: level ≤ possible, low blood sugar first", { timeout: 60_000 }, async () => {
    const input = load("C01");
    const r = await model.reason(input);
    console.log(`[reasoner C01] ${r.ms} ms`, JSON.stringify(r.output));
    expect(["none", "possible"]).toContain(r.output?.level);
    expect(r.output?.lookalikes[0]?.name.toLowerCase()).toBe("low blood sugar");
  });
});
