import { describe, expect, it } from "vitest";
import { widenPhrase } from "./widen.js";
import { parseLkw } from "./parser.js";

describe("widenPhrase: the model's LKW span is widened to the whole time expression in its quote", () => {
  it.each([
    ["an hour ago", "She was fine about half an hour ago", "about half an hour ago"],
    ["hour ago", "She was fine about half an hour ago", "about half an hour ago"],
    ["an hour", "he was okay an hour and a half ago, I think", "an hour and a half ago"],
    ["2 hours ago", "maybe 1 or 2 hours ago", "maybe 1 or 2 hours ago"],
    ["20 minutes ago", "He was talking fine just like 20 minutes ago.", "just like 20 minutes ago"],
  ])("%s in %j → %s", (phrase, quote, want) => {
    expect(widenPhrase(phrase, quote)).toBe(want);
  });

  it.each([
    ["fine at about 2 PM", "He was fine at about 2 PM, then he sat down"],
    ["at lunch", "she was okay at lunch"],
    ["about half an hour ago", "She was fine about half an hour ago"],
    ["since this morning", "it's been like this since this morning"],
    ["not in quote", "She was fine about half an hour ago"],
  ])("leaves %j unchanged", (phrase, quote) => {
    expect(widenPhrase(phrase, quote)).toBe(phrase);
  });

  it("B01 (live replay at 9:09 PM): a truncated 'an hour ago' no longer gives 8:09 PM", () => {
    const saidAt = "2026-10-24T21:09:19-07:00";
    const q = "She was fine about half an hour ago";
    const r = parseLkw({ phrase: widenPhrase("an hour ago", q), saidAt, timezone: "America/Los_Angeles" });
    expect(r.display).toBe("8:39 PM (8:29–8:49 PM)");
  });
});
