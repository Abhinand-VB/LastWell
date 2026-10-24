import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { AddressInfo } from "node:net";
import { auth, testGateway, until, type TestGateway } from "../testkit.js";

let gw: TestGateway | null = null;
afterEach(async () => {
  await gw?.app.close();
  gw = null;
});

describe("browser-mic fallback (V-09)", () => {
  it("creates a browser call, accepts pcm frames with the token, finals are `mixed`, {type:end} ends the call", async () => {
    gw = testGateway();
    await gw.app.listen({ port: 0, host: "127.0.0.1" });
    const port = (gw.app.server.address() as AddressInfo).port;
    const res = await gw.app.inject({ method: "POST", url: "/api/calls/browser", headers: { ...auth, host: `localhost:${port}` }, payload: {} });
    expect(res.statusCode).toBe(200);
    const { callId, micWsUrl } = res.json();
    expect(micWsUrl).toMatch(new RegExp(`^ws://localhost:${port}/browser/media/${callId}\\?token=[0-9a-f]{64}$`));
    const call = gw.calls.registry.get(callId)!;
    expect(call.mode).toBe("browser");
    expect(call.streamStartedAt).toBeNull();

    const bad = new WebSocket(micWsUrl.replace(/token=[0-9a-f]+/, "token=nope"));
    const badClose = await new Promise<number>((r) => bad.on("close", (c) => r(c)));
    expect(badClose).toBe(1008);

    const ws = new WebSocket(micWsUrl);
    await new Promise((r) => ws.on("open", r));
    ws.send(Buffer.alloc(640));
    await until(() => call.streamStartedAt !== null);
    gw.calls.addFinal(call, { speaker: "mixed", text: "His face is drooping on one side.", tStartMs: 20, tEndMs: 900 });
    await until(() => call.runner!.state.signs.length > 0);
    expect(call.utterances[0]!.speaker).toBe("mixed");
    ws.send(JSON.stringify({ type: "end" }));
    await until(() => call.status === "ended");
    ws.close();
  });

  it("FEATURE_BROWSER_MIC=false → 409", async () => {
    gw = testGateway({ env: { FEATURE_BROWSER_MIC: "false" } });
    const res = await gw.app.inject({ method: "POST", url: "/api/calls/browser", headers: auth, payload: {} });
    expect(res.statusCode).toBe(409);
  });
});
