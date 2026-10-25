import { afterEach, describe, expect, it } from "vitest";
import { validateEnv } from "./env.js";
import { auth, KEY, testGateway, type TestGateway } from "./testkit.js";
import { originAllowed } from "./app.js";

let gw: TestGateway | null = null;
afterEach(async () => {
  await gw?.app.close();
  gw = null;
});

describe("env (X-01b)", () => {
  it("boots with LASTWELL_FAKES=all and no vendor secrets", () => {
    const r = validateEnv({ PUBLIC_BASE_URL: "http://127.0.0.1:1", INTERNAL_API_KEY: "abcdefgh12", LASTWELL_FAKES: "all" });
    expect(r.problems).toEqual([]);
    expect([...(r.env?.fakes ?? [])].sort()).toEqual(["claude", "store", "stt", "tts", "twilio"]);
  });

  it("names every missing variable when nothing is faked", () => {
    const r = validateEnv({ PUBLIC_BASE_URL: "https://x.example", INTERNAL_API_KEY: "abcdefgh12" });
    const text = r.problems.join("\n");
    for (const v of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "DISPATCHER_PHONE", "ALERT_ALLOWED_NUMBERS", "CARTESIA_API_KEY", "ANTHROPIC_API_KEY", "CONVEX_URL"]) {
      expect(text).toContain(v);
    }
  });

  it("names a missing required variable even with fakes", () => {
    const r = validateEnv({ LASTWELL_FAKES: "all", INTERNAL_API_KEY: "abcdefgh12" });
    expect(r.problems.join("\n")).toContain("PUBLIC_BASE_URL");
  });

  it("DEMO_MODE=true refuses any fake; unknown fake names are rejected", () => {
    expect(validateEnv({ PUBLIC_BASE_URL: "https://x.example", INTERNAL_API_KEY: "abcdefgh12", LASTWELL_FAKES: "tts", DEMO_MODE: "true" }).problems.join()).toMatch(/DEMO_MODE=true refuses fakes/);
    expect(validateEnv({ PUBLIC_BASE_URL: "https://x.example", INTERNAL_API_KEY: "abcdefgh12", LASTWELL_FAKES: "all,phone" }).problems.join()).toMatch(/unknown item "phone"/);
  });

  it("ALERT_ALLOWED_NUMBERS must be E.164", () => {
    expect(validateEnv({ PUBLIC_BASE_URL: "https://x.example", INTERNAL_API_KEY: "abcdefgh12", LASTWELL_FAKES: "all", ALERT_ALLOWED_NUMBERS: "+14155550100,4155550101" }).problems.join()).toMatch(/ALERT_ALLOWED_NUMBERS/);
  });
});

describe("gateway app", () => {
  it("GET /healthz reports the active fakes", async () => {
    gw = testGateway();
    const res = await gw.app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, liveCalls: 0, cartesia: "ok", version: "0.0.0" });
    expect(res.json().fakes).toHaveLength(5);
  });

  it("REST needs x-internal-key", async () => {
    gw = testGateway();
    expect((await gw.app.inject({ method: "GET", url: "/api/config" })).statusCode).toBe(401);
    expect((await gw.app.inject({ method: "GET", url: "/api/config", headers: { "x-internal-key": "nope" } })).statusCode).toBe(401);
    const ok = await gw.app.inject({ method: "GET", url: "/api/config", headers: auth });
    expect(ok.json()).toEqual({
      demoAlertToCaller: false,
      featureBrowserMic: true,
      featureQa: false,
      callTimezone: "America/Los_Angeles",
      alertDefaultTargetPhone: "+14155550100",
      alertDelivery: "phone",
    });
  });

  it("GET /api/ws-token issues a 64-hex token valid for 600 s", async () => {
    gw = testGateway();
    const res = await gw.app.inject({ method: "GET", url: "/api/ws-token", headers: { "x-internal-key": KEY } });
    expect(res.json().token).toMatch(/^[0-9a-f]{64}$/);
    expect(res.json().expiresInS).toBe(600);
  });

  it("dev routes exist only with fakes and without DEMO_MODE", async () => {
    gw = testGateway();
    expect((await gw.app.inject({ method: "POST", url: "/api/dev/calls", headers: auth, payload: {} })).statusCode).toBe(201);
    await gw.app.close();
    gw = testGateway({ env: { LASTWELL_FAKES: "", DEMO_MODE: "true", TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", CARTESIA_API_KEY: "k", ANTHROPIC_API_KEY: "k", CONVEX_URL: "https://x.convex.cloud" } });
    expect((await gw.app.inject({ method: "POST", url: "/api/dev/calls", headers: auth, payload: {} })).statusCode).toBe(404);
  });

  it("an unknown id is a 404 with an error code", async () => {
    gw = testGateway();
    const res = await gw.app.inject({ method: "GET", url: "/api/calls/6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f607", headers: auth });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("unknown_call");
  });

  it("WebSocket origins: none or local web app only", () => {
    expect(originAllowed(undefined)).toBe(true);
    expect(originAllowed("http://localhost:3000")).toBe(true);
    expect(originAllowed("http://127.0.0.1:13000")).toBe(true);
    expect(originAllowed("http://evil")).toBe(false);
    expect(originAllowed("https://localhost.evil.com")).toBe(false);
  });
});
