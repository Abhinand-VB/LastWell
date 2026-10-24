import { describe, expect, it } from "vitest";
import type { Speaker, Utterance } from "../contracts/index.js";
import { checkQuote, norm, phraseWithinQuote, validateQuote } from "./quotes.js";

const CALL = "6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f607";
let n = 0;
function utt(seq: number, speaker: Speaker, text: string): Utterance {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    callId: CALL,
    seq,
    speaker,
    text,
    tStartMs: seq * 1000,
    tEndMs: seq * 1000 + 900,
  };
}

const coffee = utt(4, "caller", "Since lunch his words come out all mixed up and his right hand is weak, he can't lift his coffee cup.");
const lkw = utt(8, "caller", "He was fine at about 2 PM. We had lunch and he was fine.");

describe("quote validator — docs/03 §7 test list", () => {
  it("1. exact match", () => {
    const ref = validateQuote("he can't lift his coffee cup", "sign", [coffee]);
    expect(ref).toEqual({ quote: "he can't lift his coffee cup", utteranceId: coffee.id, tMs: 4000, speaker: "caller" });
  });

  it("2. punctuation/case differences match", () => {
    const u = utt(2, "caller", "He can't lift his coffee cup.");
    expect(validateQuote("he cant lift his coffee cup", "sign", [u])?.quote).toBe("He can't lift his coffee cup");
  });

  it("3. curly apostrophe matches a straight one (both directions)", () => {
    const straight = utt(2, "caller", "He can't lift his coffee cup.");
    const curly = utt(3, "caller", "She can’t lift her arm.");
    expect(validateQuote("he can’t lift his coffee cup", "sign", [straight])?.quote).toBe("He can't lift his coffee cup");
    expect(validateQuote("she can't lift her arm", "sign", [curly])?.quote).toBe("She can’t lift her arm");
  });

  it("4. a quote spanning two utterances is dropped", () => {
    const a = utt(2, "caller", "His face looks funny.");
    const b = utt(3, "caller", "And his arm is weak.");
    expect(checkQuote("funny and his arm", "sign", [a, b])).toEqual({ ok: false, reason: "no_match" });
  });

  it("5. a dispatcher-only quote for a sign is dropped", () => {
    const d = utt(5, "dispatcher", "So his right hand is weak?");
    const c = utt(6, "caller", "Yes.");
    expect(validateQuote("his right hand is weak", "sign", [d, c])).toBeNull();
  });

  it("6. same words in a newer dispatcher and an older caller utterance → the caller's ref", () => {
    const caller = utt(4, "caller", "his right hand is weak");
    const echo = utt(5, "dispatcher", "So his right hand is weak?");
    const ref = validateQuote("his right hand is weak", "sign", [caller, echo]);
    expect(ref?.utteranceId).toBe(caller.id);
    expect(ref?.speaker).toBe("caller");
  });

  it("7. a 2-character quote is dropped", () => {
    const u = utt(2, "caller", "He is ok.");
    expect(checkQuote("ok", "sign", [u])).toEqual({ ok: false, reason: "too_short" });
    expect(checkQuote(" . ! ", "sign", [u])).toEqual({ ok: false, reason: "too_short" });
  });

  it("8. a quote longer than 160 characters is dropped", () => {
    const long = "his words come out all mixed up ".repeat(6).trim();
    expect(long.length).toBeGreaterThan(160);
    const u = utt(2, "caller", long);
    expect(checkQuote(long, "sign", [u])).toEqual({ ok: false, reason: "too_long" });
    const exactly160 = long.slice(0, 160);
    expect(checkQuote(exactly160, "sign", [u]).ok).toBe(true);
  });

  it("9. a match returns the original casing and punctuation", () => {
    const u = utt(2, "caller", "Okay — HIS FACE is Drooping, on the left!");
    expect(validateQuote("his face is drooping on the left", "sign", [u])?.quote).toBe("HIS FACE is Drooping, on the left");
  });

  it("10. an address quoted from the dispatcher is accepted", () => {
    const d = utt(3, "dispatcher", "So that's 1842 Clement Street, apartment 3?");
    const ref = validateQuote("1842 Clement Street, apartment 3", "address", [d]);
    expect(ref?.speaker).toBe("dispatcher");
    expect(ref?.quote).toBe("1842 Clement Street, apartment 3");
  });
});

describe("quote validator — R-02 acceptance extras", () => {
  it('"fine at about 2 PM" matches and returns the original casing', () => {
    const ref = validateQuote("fine at about 2 PM", "last_known_well", [lkw]);
    expect(ref).toEqual({ quote: "fine at about 2 PM", utteranceId: lkw.id, tMs: 8000, speaker: "caller" });
    expect(validateQuote("FINE AT ABOUT 2 pm", "last_known_well", [lkw])?.quote).toBe("fine at about 2 PM");
  });

  it("Q&A evidence from the dispatcher is accepted only for an address question", () => {
    const d = utt(3, "dispatcher", "So that's 1842 Clement Street, apartment 3?");
    expect(validateQuote("1842 Clement Street", { qa: "What's the address?" }, [d])?.speaker).toBe("dispatcher");
    expect(validateQuote("1842 Clement Street", { qa: "Where is the patient?" }, [d])?.speaker).toBe("dispatcher");
    expect(validateQuote("1842 Clement Street", { qa: "Is he on blood thinners?" }, [d])).toBeNull();
    const dThinner = utt(9, "dispatcher", "Does he take any blood thinners, like Eliquis?");
    expect(validateQuote("blood thinners, like Eliquis", { qa: "Is he on blood thinners?" }, [dThinner])).toBeNull();
  });

  it("Q&A evidence from the caller is accepted for any question", () => {
    const c = utt(10, "caller", "Yes, he takes Eliquis. For his heart.");
    expect(validateQuote("he takes Eliquis", { qa: "Is he on blood thinners?" }, [c])?.quote).toBe("he takes Eliquis");
  });

  it("non-address facts and look-alikes accept only caller/mixed speakers", () => {
    const d = utt(3, "dispatcher", "Is he diabetic?");
    const m = utt(4, "mixed", "is he diabetic yes he is diabetic");
    expect(validateQuote("he diabetic", "diabetes", [d])).toBeNull();
    expect(validateQuote("Is he diabetic", "lookalike", [d])).toBeNull();
    expect(validateQuote("he is diabetic", "diabetes", [d, m])?.speaker).toBe("mixed");
  });

  it("searches newest first among eligible utterances", () => {
    const older = utt(2, "caller", "his arm is weak");
    const newer = utt(7, "caller", "now his arm is weak again");
    expect(validateQuote("his arm is weak", "sign", [older, newer])?.utteranceId).toBe(newer.id);
    expect(validateQuote("his arm is weak", "sign", [newer, older])?.utteranceId).toBe(newer.id);
  });

  it("never repairs a near-miss", () => {
    expect(validateQuote("he cannot lift his coffee cup", "sign", [coffee])).toBeNull();
    expect(validateQuote("his right arm is weak", "sign", [coffee])).toBeNull();
  });

  it("the same span may support two signs, each with its own ref", () => {
    const u = utt(3, "caller", "He sounds drunk and keeps falling.");
    const speech = validateQuote("he sounds drunk and keeps falling", "sign", [u]);
    const balance = validateQuote("he sounds drunk and keeps falling", "sign", [u]);
    expect(speech).not.toBeNull();
    expect(balance).toEqual(speech);
    expect(balance).not.toBe(speech);
  });

  it("normalizes NFKC, dashes and whitespace", () => {
    expect(norm("  He was—fine   at\tabout ２ PM. ")).toBe("he wasfine at about 2 pm");
    expect(norm("“Since lunch,” she said")).toBe("since lunch she said");
  });

  it("LKW phrase must be inside its quote", () => {
    expect(phraseWithinQuote("fine at about 2 PM", "He was fine at about 2 PM")).toBe(true);
    expect(phraseWithinQuote("about 2 PM", "He was fine at lunch")).toBe(false);
    expect(phraseWithinQuote("", "He was fine")).toBe(false);
  });
});
