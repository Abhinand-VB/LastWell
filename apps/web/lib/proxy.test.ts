import { describe, expect, it, vi } from "vitest";
import { gatewayTarget, proxyToGateway } from "./proxy";

const cfg = (fetchImpl: typeof fetch) => ({ gatewayUrl: "http://gw:8787", internalKey: "k-123", fetchImpl });

describe("gateway proxy", () => {
  it("maps paths and keeps the query string", () => {
    expect(gatewayTarget("http://gw", ["alerts"], "?sinceHours=24")).toBe("http://gw/api/alerts?sinceHours=24");
    expect(gatewayTarget("http://gw", ["calls", "abc", "alert"], "")).toBe("http://gw/api/calls/abc/alert");
  });

  it("rejects traversal and odd segments", () => {
    expect(gatewayTarget("http://gw", [".."], "")).toBeNull();
    expect(gatewayTarget("http://gw", ["a b"], "")).toBeNull();
    expect(gatewayTarget("http://gw", [], "")).toBeNull();
  });

  it("adds x-internal-key and forwards method, body and status", async () => {
    const fetchImpl = vi.fn(async () => new Response('{"error":{"code":"conflict","message":"not allowed"}}', { status: 409 }));
    const req = new Request("http://web/api/gateway/calls/x/alert", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"targetPhone":"+14155550100","confirm":true}',
    });
    const res = await proxyToGateway(req, ["calls", "x", "alert"], cfg(fetchImpl as unknown as typeof fetch));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: "conflict", message: "not allowed" } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://gw:8787/api/calls/x/alert");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-internal-key"]).toBe("k-123");
    expect(init.body).toBe('{"targetPhone":"+14155550100","confirm":true}');
  });

  it("returns 502 when the gateway is down", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const res = await proxyToGateway(new Request("http://web/api/gateway/config"), ["config"], cfg(fetchImpl as unknown as typeof fetch));
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("gateway_unreachable");
  });

  it("never echoes the key back to the browser", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const res = await proxyToGateway(new Request("http://web/api/gateway/config"), ["config"], cfg(fetchImpl as unknown as typeof fetch));
    expect([...res.headers.values()].join(" ")).not.toContain("k-123");
  });
});

describe("gateway proxy, binary bodies (D-43 audio)", () => {
  it("passes a WAV through byte for byte with its content type", async () => {
    const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0xff, 0x00, 0x80, 0xfe]);
    const fetchImpl = vi.fn(async () => new Response(wav, { status: 200, headers: { "content-type": "audio/wav" } }));
    const res = await proxyToGateway(new Request("http://web/api/gateway/alerts/a/audio"), ["alerts", "a", "audio"], cfg(fetchImpl as unknown as typeof fetch));
    expect(res.headers.get("content-type")).toBe("audio/wav");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(wav);
  });
});
