import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { CaseState, Utterance } from "@lastwell/core";
import { answerFromState, fastTopics } from "./qaFast.js";
import { LKW_NOT_ESTABLISHED } from "./qaAnswer.js";

const A01 = JSON.parse(readFileSync(fileURLToPath(new URL("../../../../packages/core/src/fixtures/caseState.A01.json", import.meta.url)), "utf8")) as CaseState;
function transcriptFor(state: CaseState): Utterance[] {
  const seen = new Map<string, Utterance>();
  const refs = [...state.signs.map((s) => s.ref), ...state.facts.map((f) => f.ref), ...(state.lkw ? [state.lkw.ref] : [])];
  // One utterance per id holding every quote that points into it (A01 has several quotes per utterance).
  refs.forEach((r, i) => {
    const u = seen.get(r.utteranceId);
    if (!u) seen.set(r.utteranceId, { id: r.utteranceId, callId: state.callId, seq: i + 1, speaker: r.speaker, text: r.quote, tStartMs: r.tMs, tEndMs: r.tMs + 1000 });
    else if (!u.text.includes(r.quote)) u.text = `${u.text}, ${r.quote}`;
  });
  return [...seen.values()];
}
const T = transcriptFor(A01);
const NOW = new Date("2026-10-25T21:47:00Z"); // 2:47 PM PDT
const ask = (q: string, state = A01, transcript = T) => answerFromState(q, state, transcript, NOW, "America/Los_Angeles");

describe("Q&A fast path from the case state (no model)", () => {
  it.each([
    ["When was he last normal?", /^Last seen normal at 2:00 PM, 47 minutes ago\. The caller said 'He was fine at about 2 PM'\.$/],
    ["How long ago did this start?", /^Last seen normal at 2:00 PM, 47 minutes ago\./],
    ["Is he on blood thinners?", /^Blood thinner: Eliquis, per the caller\. The caller said 'he takes Eliquis'\.$/],
    ["What medications is he on?", /^Blood thinner: Eliquis, per the caller\./],
    ["How old is he?", /^78-year-old man, per the caller\. The caller said 'he's 78'\.$/],
    ["What signs did the caller describe?", /^Signs heard: one-sided weakness and speech trouble\. The caller said '.+' and '.+'\.$/],
    ["Is he slurring his words?", /^Yes, speech trouble\. The caller said '.+'\.$/],
    ["What's the address?", /^The address given on the call: 1842 Clement Street, apartment 3\.$/],
  ])("%s", (q, want) => {
    const r = ask(q)!;
    expect(r).not.toBeNull();
    expect(r.answer).toMatch(want);
    expect(r.known).toBe(true);
    // Every quote spoken is evidence that validates against the transcript.
    for (const e of r.evidence) expect(T.some((u) => u.text.includes(e.quote))).toBe(true);
    expect(r.answer).not.toMatch(/[()–]/);
  });

  it("falls through to the model when the state has nothing for the topic, or for other questions", () => {
    expect(ask("Is his face drooping?")).toBeNull(); // no face sign: the model checks the transcript
    expect(ask("Any seizure before this?")).toBeNull();
    expect(ask("Does he have diabetes?")).toBeNull();
    expect(fastTopics("Any seizure before this?")).toEqual([]);
  });

  it("quote-or-drop: a state quote that is not in the transcript is never spoken (falls through)", () => {
    const tampered: CaseState = { ...A01, facts: A01.facts.map((f) => (f.kind === "blood_thinner" ? { ...f, value: "warfarin", ref: { ...f.ref, quote: "he takes warfarin daily" } } : f)) };
    expect(ask("Is he on blood thinners?", tampered)).toBeNull();
  });

  it("LKW not established → the fixed line, never a model time", () => {
    const r = ask("When was he last normal?", { ...A01, lkw: null })!;
    expect(r).toMatchObject({ answer: LKW_NOT_ESTABLISHED, known: false, evidence: [] });
  });

  it("two topics in one question are both answered; three or more go to the model", () => {
    const r = ask("How old is he and is he on blood thinners?")!;
    expect(r.answer).toMatch(/^Blood thinner: Eliquis.*78-year-old man/);
    expect(ask("How old is he, is he on blood thinners and what's the address?")).toBeNull();
  });
});
