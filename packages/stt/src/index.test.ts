import { describe, expect, it } from "vitest";
import { CORE_VERSION } from "./index.js";

describe("@lastwell/stt", () => {
  it("resolves @lastwell/core through the workspace", () => {
    expect(CORE_VERSION).toBe("0.0.0");
  });
});
