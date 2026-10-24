import { describe, expect, it } from "vitest";
import { USAGE } from "./usage.js";

describe("eval usage", () => {
  it("documents both modes", () => {
    expect(USAGE).toContain("--mode text|audio");
  });
});
