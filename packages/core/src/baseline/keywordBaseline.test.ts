import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EvalScript } from "../contracts/index.js";
import { keywordBaseline, type BaselineTurn } from "./keywordBaseline.js";

const SCRIPTS = fileURLToPath(new URL("../../../../apps/eval/scripts/", import.meta.url));
const script = (id: string): EvalScript => EvalScript.parse(JSON.parse(readFileSync(`${SCRIPTS}${id}.json`, "utf8")));

const d = (text: string): BaselineTurn => ({ speaker: "dispatcher", text });
const c = (text: string): BaselineTurn => ({ speaker: "caller", text });

// A02 and D04 are written by C-02; these turns follow their docs/07 §3 seeds.
const A02: BaselineTurn[] = [
  d("911, what is the address of your emergency?"),
  c("It's 88 Noriega Street. It's my husband, he's 71."),
  d("Okay. Tell me exactly what happened."),
  c("His face is drooping on the left and his speech is all slurred."),
];
const D04: BaselineTurn[] = [
  d("911, what is the address of your emergency?"),
  c("It's 400 Irving Street. My friend ate shrimp and now her lips and face are swelling up."),
  d("Is her face drooping on one side?"),
  c("No, it's just swollen and really itchy."),
];

describe("keyword baseline (docs/07 §2)", () => {
  it("A02 flags on 'drooping'", () => {
    expect(keywordBaseline(A02)).toEqual({ flagged: true, index: 3, pattern: "droop" });
  });

  it("B01 never flags (the dispatcher's 'drooping' question does not count)", () => {
    const b01 = script("B01");
    expect(b01.turns.some((t) => t.speaker === "dispatcher" && /droop/i.test(t.text))).toBe(true);
    expect(keywordBaseline(b01.turns)).toEqual({ flagged: false, index: null, pattern: null });
  });

  it("D04 'swelling' never flags", () => {
    expect(keywordBaseline(D04).flagged).toBe(false);
  });

  it("A01 is not flagged (no pattern in its caller words), deterministically", () => {
    const a01 = script("A01");
    const first = keywordBaseline(a01.turns);
    expect(first).toEqual(keywordBaseline(a01.turns));
    // "he just can't get the words out right" matches no pattern; the baseline misses A01 with these patterns.
    expect(first.flagged).toBe(false);
  });

  it("matches each pattern on caller or mixed speech", () => {
    for (const text of [
      "I think it's a stroke", "her mouth droops", "he's slurring", "my hand is numb", "he seems paralyzed",
      "weak on one side", "she can't talk", "he cant speak", "his face looks crooked",
    ]) {
      expect(keywordBaseline([{ speaker: "mixed", text }]).flagged, text).toBe(true);
    }
    expect(keywordBaseline([c("my stroller broke"), c("everything is fine")]).flagged).toBe(false);
  });
});
