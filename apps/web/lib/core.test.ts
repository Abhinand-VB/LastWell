import { describe, expect, it } from "vitest";
import { VERSION } from "@lastwell/core";

describe("@lastwell/web", () => {
  it("imports @lastwell/core", () => {
    expect(VERSION).toBe("0.0.0");
  });
});
