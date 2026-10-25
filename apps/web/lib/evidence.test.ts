import { describe, expect, it } from "vitest";
import { EvidenceResult, factLabel } from "./boardLive";

const evidence = {
  callId: "6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f607",
  label: "A01",
  callStatus: "live",
  startedAt: "2026-10-25T14:47:00-07:00",
  level: "likely",
  version: 3,
  updatedAt: "2026-10-25T14:47:09-07:00",
  signs: [{ kind: "speech", quote: "his words come out all mixed up", tMs: 2000 }],
  facts: [{ kind: "blood_thinner", value: "Eliquis", quote: "he takes Eliquis", tMs: 9000 }],
  lkw: { display: "2:00 PM", lkwAt: "2026-10-25T14:00:00-07:00", quote: "He was fine at about 2 PM", tMs: 7000 },
  lookalikes: [{ name: "low blood sugar", ref: null }],
  alerts: [{ id: "9e8d7c6b-5a49-4382-a716-05f4e3d2c1b0", status: "calling", createdAt: "2026-10-25T14:48:00-07:00", emsConfirmedAt: null }],
};

describe("evidence page result (proposed D-57)", () => {
  it("accepts quoted evidence and both error shapes", () => {
    expect(EvidenceResult.parse({ ok: true, evidence }).ok).toBe(true);
    expect(EvidenceResult.parse({ ok: false, error: "not_found" })).toEqual({ ok: false, error: "not_found" });
    expect(EvidenceResult.parse({ ok: false, error: "unauthorized" })).toEqual({ ok: false, error: "unauthorized" });
  });

  it("rejects unknown sign kinds, levels or statuses", () => {
    expect(EvidenceResult.safeParse({ ok: true, evidence: { ...evidence, level: "certain" } }).success).toBe(false);
    expect(EvidenceResult.safeParse({ ok: true, evidence: { ...evidence, signs: [{ kind: "gait", quote: "x", tMs: 0 }] } }).success).toBe(false);
    expect(EvidenceResult.safeParse({ ok: true, evidence: { ...evidence, alerts: [{ ...evidence.alerts[0], status: "nope" }] } }).success).toBe(false);
  });

  it("labels fact kinds", () => {
    expect(factLabel("blood_thinner")).toBe("Blood thinner");
    expect(factLabel("age")).toBe("Age");
  });
});
