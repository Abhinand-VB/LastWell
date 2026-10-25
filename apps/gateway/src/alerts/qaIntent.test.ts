import { describe, expect, it } from "vitest";
import { classifyQa, isFragment } from "./qaIntent.js";

describe("classifyQa (D-49): code sorts what the stroke team said before any model call", () => {
  it.each([
    ["ok, thank you", "closing"],
    ["Thanks.", "closing"],
    ["Got it.", "closing"],
    ["That's all.", "closing"],
    ["No, that's all, thank you", "closing"],
    ["Okay, bye.", "closing"],
    ["We're good, thanks", "closing"],
    ["Ok.", "ack"],
    ["Mm-hm.", "ack"],
    ["Right.", "ack"],
    ["Okay, yeah.", "ack"],
    ["Um.", "unclear"],
    ["Huh?", "unclear"],
    ["What?", "unclear"],
    ["", "unclear"],
    ["Who is this?", "system"],
    ["Who's this?", "system"],
    ["Is this a person?", "system"],
    ["Are you a robot?", "system"],
    ["What is this?", "system"],
    ["Is he on blood thinners?", "question"],
    ["Thanks. Is he on blood thinners?", "question"],
    ["ok and when was he last normal", "question"],
    ["blood thinners", "question"],
    ["How old is he?", "question"],
    ["What is this patient's age?", "question"],
    ["Who called?", "question"],
    ["Any seizure before this?", "question"],
  ])("%j → %s", (text, want) => {
    expect(classifyQa(text)).toBe(want);
  });
});

describe("classifyQa: only question-shaped utterances reach the answer path", () => {
  it.each([
    ["Oogabooga.", "unclear"],
    ["blah blah blah", "unclear"],
    ["Hmm, uh, okay so", "ack"],
    ["Medicine?", "question"],
    ["seizure", "question"],
    ["his sugar", "question"],
    ["Who called it in?", "question"],
  ])("%j → %s", (text, want) => {
    expect(classifyQa(text)).toBe(want);
  });
  it("Ink confidence below 0.5 (when present) → unclear", () => {
    expect(classifyQa("Is he on blood thinners?", 0.3)).toBe("unclear");
    expect(classifyQa("Is he on blood thinners?", 0.9)).toBe("question");
  });
});

describe("isFragment: a short piece with no case topic waits for the rest", () => {
  it.each([
    ["Is he on?", true],
    ["When was he?", true],
    ["Blood thinners?", false],
    ["Ok.", false],
    ["Thanks.", false],
    ["Who is this?", false],
    ["Um.", false],
    ["Is he on any blood thinners?", false],
  ])("%j → %s", (text, want) => {
    expect(isFragment(text)).toBe(want);
  });
});
