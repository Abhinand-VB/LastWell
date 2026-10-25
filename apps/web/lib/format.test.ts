import { describe, expect, it } from "vitest";
import type { Sign } from "@lastwell/core";
import {
  agoText,
  groupSigns,
  latency,
  minutesAgo,
  mmss,
  quoteSegments,
  stateRefs,
  toE164,
  windowBar,
  windowCountdown,
  windowEndText,
} from "./format";
import { A01_STATE } from "./testFixtures";

describe("format", () => {
  it("mmss", () => {
    expect(mmss(0)).toBe("00:00");
    expect(mmss(11_000)).toBe("00:11");
    expect(mmss(125_900)).toBe("02:05");
  });

  it("latency readout", () => {
    expect(latency(820)).toBe("820 ms");
    expect(latency(3100)).toBe("3.1 s");
    expect(latency(null)).toBe("—");
  });

  it("quote segments: verbatim, case-insensitive fallback, overlaps merged", () => {
    const text = "Since lunch his words come out all mixed up and his right hand is weak, he can't lift his coffee cup.";
    const segs = quoteSegments(text, ["his words come out all mixed up", "HE CAN'T LIFT his coffee cup"]);
    expect(segs.filter((s) => s.quoted).map((s) => s.text)).toEqual(["his words come out all mixed up", "he can't lift his coffee cup"]);
    expect(segs.map((s) => s.text).join("")).toBe(text);
    const overl = quoteSegments("he can't lift his coffee cup", ["can't lift", "lift his coffee"]);
    expect(overl).toEqual([
      { text: "he ", quoted: false },
      { text: "can't lift his coffee", quoted: true },
      { text: " cup", quoted: false },
    ]);
    expect(quoteSegments("hello", ["absent"])).toEqual([{ text: "hello", quoted: false }]);
  });

  it("collects every ref in the state", () => {
    expect(stateRefs(A01_STATE).length).toBe(A01_STATE.signs.length + A01_STATE.facts.length + 1);
    expect(stateRefs(null)).toEqual([]);
  });

  it("minutes ago and window countdown", () => {
    const now = new Date("2026-10-25T15:15:00-07:00");
    expect(minutesAgo("2026-10-25T14:00:00-07:00", now)).toBe(75);
    expect(minutesAgo(null, now)).toBeNull();
    expect(minutesAgo("2026-10-23T14:00:00-07:00", now)).toBeNull();
    expect(agoText(75)).toBe("1 h 15 min ago");
    expect(agoText(45)).toBe("45 min ago");
    expect(windowCountdown("2026-10-25T14:00:00-07:00", now)).toEqual({ kind: "left", minutes: 195, text: "3 h 15 m" });
    expect(windowCountdown("2026-10-25T10:00:00-07:00", now)).toEqual({ kind: "passed" });
    expect(windowCountdown(null, now)).toEqual({ kind: "unknown" });
  });

  it("window bar share and urgency band", () => {
    expect(windowBar({ kind: "left", minutes: 270, text: "" })).toEqual({ remaining: 1, urgency: "ok" });
    expect(windowBar({ kind: "left", minutes: 135, text: "" })).toEqual({ remaining: 0.5, urgency: "ok" });
    expect(windowBar({ kind: "left", minutes: 90, text: "" }).urgency).toBe("soon");
    expect(windowBar({ kind: "left", minutes: 60, text: "" }).urgency).toBe("urgent");
    expect(windowBar({ kind: "passed" })).toEqual({ remaining: 0, urgency: "urgent" });
    expect(windowBar({ kind: "unknown" }).remaining).toBe(0);
  });

  it("window end clock time in the call timezone", () => {
    expect(windowEndText("2026-10-25T14:00:00-07:00", "America/Los_Angeles")).toBe("6:30 PM");
  });

  it("groups signs by kind in BE-FAST order, quotes in transcript order", () => {
    const sign = (kind: Sign["kind"], quote: string, tMs: number): Sign => ({
      kind,
      ref: { quote, utteranceId: "00000000-0000-4000-8000-000000000000", tMs, speaker: "caller" },
      source: "fast",
    });
    const groups = groupSigns([
      sign("speech", "he just can't get the words out right", 21_000),
      sign("arms", "he can't lift his coffee cup", 11_000),
      sign("speech", "his words come out all mixed up", 11_000),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(["arms", "speech"]);
    expect(groups[1]!.refs.map((r) => r.tMs)).toEqual([11_000, 21_000]);
    expect(groupSigns([])).toEqual([]);
  });

  it("phone input to E.164", () => {
    expect(toE164("+1 (415) 555-0100")).toBe("+14155550100");
    expect(toE164("415-555-0100")).toBe("+14155550100");
    expect(toE164("14155550100")).toBe("+14155550100");
    expect(toE164("555-0100")).toBeNull();
    expect(toE164("+0123")).toBeNull();
  });
});
