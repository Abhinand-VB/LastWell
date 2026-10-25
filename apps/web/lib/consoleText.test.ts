import { describe, expect, it } from "vitest";
import { CaseState } from "@lastwell/core";
import c01 from "../../../packages/core/src/fixtures/caseState.C01.json";
import { lookalikeLine, WARNING_TEXT } from "./consoleText";
import { A01_STATE } from "./testFixtures";

const C01 = CaseState.parse(c01);

describe("console text", () => {
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
