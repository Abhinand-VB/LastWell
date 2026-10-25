// Proposed D-57: GET /api/board-token exists only with FEATURE_CONVEX_BOARD=true and the Convex store.
import { afterEach, describe, expect, it } from "vitest";
import { ConvexStore } from "../store/convex.js";
import { auth, testGateway, type TestGateway } from "../testkit.js";

class StubConvexStore extends ConvexStore {
  fail = false;
  constructor() {
    super("https://example.convex.cloud", "unused");
  }
  override async issueBoardToken(): Promise<{ token: string; expiresInS: number }> {
    if (this.fail) throw new Error("convex down");
    return { token: "c".repeat(64), expiresInS: 600 };
  }
}

let gw: TestGateway | null = null;
afterEach(async () => {
  await gw?.app.close();
  gw = null;
});

const get = (g: TestGateway, headers: Record<string, string> = auth) => g.app.inject({ method: "GET", url: "/api/board-token", headers });

describe("GET /api/board-token (proposed D-57)", () => {
  it("is absent by default, even with the Convex store", async () => {
    gw = testGateway({ store: new StubConvexStore() });
    expect((await get(gw)).statusCode).toBe(404);
  });

  it("is absent with the flag on but the in-memory store", async () => {
    gw = testGateway({ env: { FEATURE_CONVEX_BOARD: "true" } });
    expect((await get(gw)).statusCode).toBe(404);
  });

  it("issues a token with the flag on and the Convex store; needs x-internal-key; 503 when Convex fails", async () => {
    const store = new StubConvexStore();
    gw = testGateway({ env: { FEATURE_CONVEX_BOARD: "true" }, store });
    expect((await get(gw, {})).statusCode).toBe(401);
    const res = await get(gw);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ token: "c".repeat(64), expiresInS: 600 });
    store.fail = true;
    const down = await get(gw);
    expect(down.statusCode).toBe(503);
    expect(down.json().error.code).toBe("store_unavailable");
  });
});
