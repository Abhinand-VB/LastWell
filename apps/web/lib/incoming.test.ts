import { describe, expect, it } from "vitest";
import type { CallListItem } from "@lastwell/core";
import { CONSOLE_TAB, newLiveCall, openTarget } from "./incoming";

const call = (id: string, over: Partial<CallListItem> = {}): CallListItem => ({
  id,
  mode: "phone",
  callerNumberMasked: "•••1234",
  startedAt: "2026-10-25T09:00:00.000Z",
  endedAt: null,
  status: "live",
  timezone: "America/Los_Angeles",
  label: null,
  level: "none",
  ...over,
});

describe("newLiveCall", () => {
  it("ignores calls already seen", () => {
    expect(newLiveCall([call("a")], new Set(["a"]))).toBeNull();
  });

  it("live phone calls and replays open the console; mic calls and ended calls do not", () => {
    const quiet = [call("m", { mode: "browser" }), call("e", { status: "ended", endedAt: "2026-10-25T09:05:00.000Z" })];
    expect(newLiveCall(quiet, new Set())).toBeNull();
    expect(newLiveCall([...quiet, call("p")], new Set())?.id).toBe("p");
    expect(newLiveCall([...quiet, call("r", { mode: "replay", label: "A01" })], new Set())?.id).toBe("r");
  });

  it("picks the newest when two arrive together", () => {
    const calls = [call("old"), call("new", { startedAt: "2026-10-25T09:01:00.000Z" })];
    expect(newLiveCall(calls, new Set())?.id).toBe("new");
  });
});

describe("openTarget", () => {
  it("reuses the console tab unless it shows a live call", () => {
    expect(openTarget([call("a")], null)).toBe(CONSOLE_TAB);
    expect(openTarget([call("a", { status: "ended" })], "a")).toBe(CONSOLE_TAB);
    expect(openTarget([call("a")], "gone")).toBe(CONSOLE_TAB);
    expect(openTarget([call("a")], "a")).toBe("_blank");
  });
});
