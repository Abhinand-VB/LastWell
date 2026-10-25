import { describe, expect, it } from "vitest";
import { isActive, latestAlert, sendErrorText, statusSteps, stepIndex } from "./alerts";
import { GatewayError } from "./gateway";
import { alert } from "./testFixtures";

describe("alert helpers", () => {
  it("steps follow featureQa", () => {
    expect(statusSteps(false)).toEqual(["calling", "ringing", "answered", "briefed", "completed"]);
    expect(statusSteps(true)).toContain("qa");
    expect(stepIndex("queued", statusSteps(false))).toBe(-1);
    expect(stepIndex("briefed", statusSteps(false))).toBe(3);
    expect(stepIndex("qa", statusSteps(false))).toBe(3);
  });

  it("latest alert and active states", () => {
    const a1 = alert({ id: "b0100000-0000-4000-8000-000000000002", createdAt: "2026-10-25T14:50:00-07:00", status: "failed" });
    const a2 = alert({ createdAt: "2026-10-25T14:55:00-07:00", status: "ringing" });
    expect(latestAlert([a1, a2])?.id).toBe(a2.id);
    expect(latestAlert([])).toBeNull();
    expect(isActive(a2)).toBe(true);
    expect(isActive(a1)).toBe(false);
  });

  it("allowlist 409 is spelled out", () => {
    const t = sendErrorText(new GatewayError(409, "not_allowed", "+15551234567 is not in ALERT_ALLOWED_NUMBERS"));
    expect(t).toMatch(/not on the allowed list/);
    expect(t).toMatch(/No call was placed/);
    expect(sendErrorText(new GatewayError(409, "alert_active", "an alert is already in progress"))).toBe(
      "Not sent: an alert is already in progress",
    );
    expect(sendErrorText(new GatewayError(0, "network", "x"))).toMatch(/unreachable/);
  });
});

describe("local delivery (D-43, W-12)", () => {
  it("steps, labels and play availability", async () => {
    const { canPlay, statusLabel } = await import("./alerts");
    expect(statusSteps(false, "local")).toEqual(["queued", "briefed", "completed"]);
    expect(stepIndex("queued", statusSteps(false, "local"))).toBe(0);
    expect(statusLabel("queued", "local")).toBe("Ready to play");
    expect(statusLabel("queued", "phone")).toBe("Preparing briefing");
    expect(canPlay(alert({ status: "queued" }), "local")).toBe(true);
    expect(canPlay(alert({ status: "completed" }), "local")).toBe(true);
    expect(canPlay(alert({ status: "failed" }), "local")).toBe(false);
    expect(canPlay(alert({ status: "queued" }), "phone")).toBe(false);
  });
});

describe("home pre-alert column", () => {
  it("shows the newest alert's status, or why there is none", async () => {
    const { preAlertCell } = await import("./alerts");
    expect(preAlertCell([], true)).toEqual({ text: "Not sent yet", tone: "none" });
    expect(preAlertCell([], false)).toEqual({ text: "No pre-alert", tone: "none" });
    expect(preAlertCell([alert({ status: "calling" })], false)).toEqual({ text: "Calling stroke team…", tone: "active" });
    expect(preAlertCell([alert({ status: "completed" })], false)).toEqual({ text: "Briefed · completed", tone: "done" });
    expect(preAlertCell([alert({ status: "failed" })], false).tone).toBe("failed");
    const older = alert({ status: "failed", createdAt: "2026-10-25T14:40:00-07:00" });
    expect(preAlertCell([older, alert({ id: "b0100000-0000-4000-8000-000000000002", status: "ringing" })], false).text).toBe("Ringing");
  });
});
