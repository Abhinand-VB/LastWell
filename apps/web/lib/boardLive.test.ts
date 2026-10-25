import { describe, expect, it } from "vitest";
import { boardLiveMode, BoardQueryResult, boardSinceMs, tokenRefreshDelayMs } from "./boardLive";
import { alert } from "./testFixtures";

describe("board live mode flag (proposed D-57)", () => {
  it("defaults to the WebSocket board when unset, empty, ws or unknown", () => {
    for (const raw of [undefined, "", "ws", "WS", "convx", "true", "1"]) expect(boardLiveMode(raw)).toBe("ws");
  });

  it("switches to Convex only for convex", () => {
    for (const raw of ["convex", "Convex", " convex "]) expect(boardLiveMode(raw)).toBe("convex");
  });
});

describe("board query result", () => {
  it("accepts unauthorized and a list of AlertSummary + label; rejects anything else", () => {
    expect(BoardQueryResult.parse({ ok: false, error: "unauthorized" })).toEqual({ ok: false, error: "unauthorized" });
    const a = alert();
    expect(BoardQueryResult.parse({ ok: true, items: [{ label: "A01", alert: a }] })).toEqual({ ok: true, items: [{ label: "A01", alert: a }] });
    expect(BoardQueryResult.safeParse({ ok: true, items: [{ label: null, alert: { ...a, status: "nope" } }] }).success).toBe(false);
    expect(BoardQueryResult.safeParse({ ok: false, error: "boom" }).success).toBe(false);
  });

  it("since is now − 24 h floored to the hour; tokens refresh at half life", () => {
    const now = Date.parse("2026-10-25T12:34:56Z");
    expect(new Date(boardSinceMs(now)).toISOString()).toBe("2026-10-24T12:00:00.000Z");
    expect(boardSinceMs(now + 60_000)).toBe(boardSinceMs(now));
    expect(tokenRefreshDelayMs(600)).toBe(300_000);
    expect(tokenRefreshDelayMs(2)).toBe(5_000);
  });
});
