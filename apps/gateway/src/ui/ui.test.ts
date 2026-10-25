import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { AddressInfo } from "node:net";
import { auth, testGateway, until, type TestGateway } from "../testkit.js";

let gw: TestGateway | null = null;
const sockets: WebSocket[] = [];
afterEach(async () => {
  for (const s of sockets) s.terminate();
  sockets.length = 0;
  await gw?.app.close();
  gw = null;
});

async function listen(g: TestGateway): Promise<string> {
  await g.app.listen({ port: 0, host: "127.0.0.1" });
  return `ws://127.0.0.1:${(g.app.server.address() as AddressInfo).port}`;
}

function open(url: string, origin?: string): Promise<{ ws: WebSocket; msgs: Record<string, unknown>[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, origin ? { origin } : {});
    sockets.push(ws);
    const msgs: Record<string, unknown>[] = [];
    ws.on("message", (d) => msgs.push(JSON.parse(d.toString())));
    ws.on("open", () => resolve({ ws, msgs }));
    ws.on("unexpected-response", (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    ws.on("error", reject);
  });
}

async function token(g: TestGateway): Promise<string> {
  return (await g.app.inject({ method: "GET", url: "/api/ws-token", headers: auth })).json().token;
}

describe("/ws/ui (V-04)", () => {
  it("refuses an upgrade from Origin http://evil", async () => {
    gw = testGateway();
    const base = await listen(gw);
    await expect(open(`${base}/ws/ui`, "http://evil")).rejects.toThrow(/403/);
    await open(`${base}/ws/ui`, "http://localhost:3000");
  });

  it("bad token → error unauthorized; good token → auth.ok, subscribe → snapshot, then live partial/final/state", async () => {
    gw = testGateway();
    const base = await listen(gw);
    const bad = await open(`${base}/ws/ui`);
    bad.ws.send(JSON.stringify({ type: "auth", token: "nope" }));
    await until(() => bad.msgs.length > 0);
    expect(bad.msgs[0]).toMatchObject({ type: "error", code: "unauthorized" });

    const { ws, msgs } = await open(`${base}/ws/ui`);
    ws.send(JSON.stringify({ type: "subscribe", scope: "board" }));
    await until(() => msgs.length > 0);
    expect(msgs[0]).toMatchObject({ type: "error", code: "unauthorized" });
    ws.send(JSON.stringify({ type: "auth", token: await token(gw) }));
    const call = gw.calls.create({ mode: "phone", streamStartedNow: true });
    ws.send(JSON.stringify({ type: "subscribe", scope: "call", callId: call.id }));
    await until(() => msgs.some((m) => m.type === "snapshot"));
    expect(msgs.find((m) => m.type === "auth.ok")).toBeDefined();
    gw.calls.addPartial(call, "caller", "He can't", 100);
    gw.calls.addFinal(call, { speaker: "caller", text: "He can't lift his coffee cup.", tStartMs: 100, tEndMs: 900 });
    await until(() => msgs.some((m) => m.type === "state.updated"));
    const types = msgs.map((m) => m.type);
    expect(types.indexOf("utterance.partial")).toBeLessThan(types.indexOf("utterance.final"));
    const snap = await gw.app.inject({ method: "GET", url: `/api/calls/${call.id}`, headers: auth });
    expect(snap.json().utterances.map((u: { text: string }) => u.text)).toEqual(["He can't lift his coffee cup."]);
    ws.send(JSON.stringify({ type: "subscribe", scope: "call", callId: "6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f607" }));
    ws.send(JSON.stringify({ type: "ping" }));
    await until(() => msgs.some((m) => m.type === "pong"));
    expect(msgs.some((m) => m.type === "error" && m.code === "unknown_call")).toBe(true);
    // store write-through
    expect((await gw.store.getCall(call.id))?.utterances).toHaveLength(1);
  });
});

describe("replay (V-11)", () => {
  it("B01 at speed 50: possible, balance + eyes, face/arm banner, LKW about 30 min before now, call.ended", async () => {
    gw = testGateway();
    const base = await listen(gw);
    const { ws, msgs } = await open(`${base}/ws/ui`);
    ws.send(JSON.stringify({ type: "auth", token: await token(gw) }));
    const res = await gw.app.inject({ method: "POST", url: "/api/calls/replay", headers: auth, payload: { scriptId: "B01", speed: 50 } });
    expect(res.statusCode).toBe(200);
    const callId = res.json().callId as string;
    ws.send(JSON.stringify({ type: "subscribe", scope: "call", callId }));
    await until(() => msgs.some((m) => m.type === "call.ended"), 8000);
    await until(() => gw!.calls.registry.get(callId)?.runner !== null);
    await new Promise((r) => setTimeout(r, 200));
    const state = gw.calls.registry.get(callId)!.runner!.state;
    expect(state.level).toBe("possible");
    expect(new Set(state.signs.map((s) => s.kind))).toEqual(new Set(["balance", "eyes"]));
    const banners = msgs.flatMap((m) => (m.type === "state.updated" ? [(m.state as { nextQuestion: { kind: string } | null }).nextQuestion?.kind] : []));
    expect(banners.some((k) => k === "face" || k === "arms")).toBe(true);
    const minutesAgo = (Date.now() - Date.parse(state.lkw!.lkwAt!)) / 60000;
    expect(minutesAgo).toBeGreaterThan(20);
    expect(minutesAgo).toBeLessThan(40);
    const call = (await gw.app.inject({ method: "GET", url: "/api/calls", headers: auth })).json().calls[0];
    expect(call).toMatchObject({ mode: "replay", label: "B01", callerNumberMasked: null, level: "possible", status: "ended" });
  });

  it("unknown script → 404, bad id → 400", async () => {
    gw = testGateway();
    expect((await gw.app.inject({ method: "POST", url: "/api/calls/replay", headers: auth, payload: { scriptId: "A99" } })).statusCode).toBe(404);
    expect((await gw.app.inject({ method: "POST", url: "/api/calls/replay", headers: auth, payload: { scriptId: "../x" } })).statusCode).toBe(400);
  });
});
