import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

describe("gateway app", () => {
  const app = buildApp({ logLevel: "silent" });
  afterAll(() => app.close());

  it("GET /healthz returns JSON", async () => {
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.json()).toMatchObject({ ok: true, liveCalls: 0, version: "0.0.0" });
  });
});
