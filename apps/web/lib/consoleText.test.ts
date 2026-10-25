import { describe, expect, it } from "vitest";
import { CaseState } from "@lastwell/core";
import c01 from "../../../packages/core/src/fixtures/caseState.C01.json";
import { callSummary, factRows, lookalikeLine, splitLkwDisplay, WARNING_TEXT } from "./consoleText";
import { A01_STATE } from "./testFixtures";

const C01 = CaseState.parse(c01);

describe("console text", () => {
  it("splits the LKW display into clock, range and note without changing the text", () => {
    expect(splitLkwDisplay("about 2:00 PM (1:45–2:15 PM)")).toEqual({ clock: "about 2:00 PM", range: "1:45–2:15 PM", note: null });
    expect(splitLkwDisplay("9:30 PM? (9:15–9:45 PM) · confirm AM/PM")).toEqual({ clock: "9:30 PM?", range: "9:15–9:45 PM", note: "confirm AM/PM" });
    expect(splitLkwDisplay("2:00 PM")).toEqual({ clock: "2:00 PM", range: null, note: null });
    expect(splitLkwDisplay("unknown — ask when last seen normal").clock).toBe("unknown — ask when last seen normal");
  });

  it("after-call summary is built only from validated items and never says 'not a stroke'", () => {
    const s = callSummary(A01_STATE);
    expect(s).toMatch(/^Arm and speech signs heard\. Last known well .+\. Blood thinner: Eliquis\./);
    expect(s).not.toContain(A01_STATE.summary ?? "§");
    const unsure = { ...A01_STATE, lkw: { ...A01_STATE.lkw!, display: "yesterday 2:00 PM? (1:45–2:15 PM) · confirm day" } };
    expect(callSummary(unsure)).toContain("Last known well yesterday 2:00 PM? Blood thinner");
    const empty = { ...A01_STATE, signs: [], facts: [], lkw: null };
    expect(callSummary(empty)).toBe("No stroke signs heard. Last known well not established.");
    expect(callSummary(empty).toLowerCase()).not.toContain("not a stroke");
  });

  it("fact rows: blood thinner first, then age and sex on one row with both quotes (A01)", () => {
    const rows = factRows(A01_STATE.facts);
    const ageSex = rows.find((r) => r.key === "age-sex");
    expect(rows[0]!.label).toBe("Blood thinner");
    expect(rows[1]).toBe(ageSex);
    expect(ageSex?.label).toBe(A01_STATE.facts.some((f) => f.kind === "sex") ? "Age · sex" : "Age");
    expect(ageSex?.refs.length).toBe(A01_STATE.facts.filter((f) => f.kind === "age" || f.kind === "sex").length);
    expect(factRows([])).toEqual([]);
  });

  it("look-alike reads `answered: {fact}` once the resolving fact exists (C01)", () => {
    const l = C01.lookalikes.find((x) => x.name === "low blood sugar")!;
    expect(lookalikeLine(l, C01)).toEqual({ text: "low blood sugar — answered: diabetic, skipped dinner", resolved: true });
  });

  it("an open look-alike shows its question once, without a doubled 'Ask:'", () => {
    const state = { ...A01_STATE, lookalikes: [{ name: "seizure", ask: "Ask: has he ever had a seizure?", ref: null }] };
    expect(lookalikeLine(state.lookalikes[0]!, state)).toEqual({ text: "seizure — Ask: has he ever had a seizure?", resolved: false });
  });

  it("Bell's palsy resolved by another sign", () => {
    const state = { ...A01_STATE, lookalikes: [{ name: "Bell's palsy", ask: "Did it start suddenly?", ref: null }] };
    expect(lookalikeLine(state.lookalikes[0]!, state).text).toBe("Bell's palsy — less likely: other signs heard");
  });

  it("warning banners", () => {
    expect(WARNING_TEXT.stt_degraded).toBe("Transcription degraded — switch to the table mic");
    expect(WARNING_TEXT.reasoner_delayed).toBe("Reasoner delayed");
  });
});

describe("D-41(c) antiplatelet label", () => {
  it("never calls aspirin or clopidogrel a blood thinner", async () => {
    const { bloodThinnerLabel } = await import("./consoleText");
    expect(bloodThinnerLabel("daily aspirin")).toBe("Antiplatelet");
    expect(bloodThinnerLabel("Plavix")).toBe("Antiplatelet");
    expect(bloodThinnerLabel("Eliquis")).toBe("Blood thinner");
    expect(bloodThinnerLabel(null)).toBe("Blood thinner");
  });
});
