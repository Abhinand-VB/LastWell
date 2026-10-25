import { afterEach, describe, expect, it } from "vitest";
import twilio from "twilio";
import { alertTwiml, inboundTwiml } from "./twiml.js";
import { signatureValid } from "./voiceWebhook.js";
import { testGateway, type TestGateway } from "../testkit.js";

const TOKEN = "fixed-test-auth-token";
const BASE = "https://gw.example.test";

let gw: TestGateway | null = null;
afterEach(async () => {
  await gw?.app.close();
  gw = null;
});

describe("TwiML (V-01)", () => {
  it("inbound: <Start><Stream both_tracks> with callId, then <Dial> the dispatcher, then the <Say> fallback", () => {
    expect(
      inboundTwiml({ publicBaseUrl: BASE, callId: "6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f607", twilioPhoneNumber: "+14155550199", dispatcherPhone: "+14155550101" }),
    ).toMatchInlineSnapshot(
      `"<?xml version="1.0" encoding="UTF-8"?><Response><Start><Stream url="wss://gw.example.test/twilio/media" track="both_tracks"><Parameter name="callId" value="6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f607"/></Stream></Start><Dial callerId="+14155550199" timeout="25" answerOnBridge="true"><Number>+14155550101</Number></Dial><Say>The dispatcher could not be reached. Goodbye.</Say></Response>"`,
    );
  });

  it("briefing: <Connect><Stream> with alertId and nothing after it (G-04)", () => {
    expect(alertTwiml(BASE, "9e8d7c6b-5a49-4382-a716-05f4e3d2c1b0")).toMatchInlineSnapshot(
      `"<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="wss://gw.example.test/twilio/alert-media"><Parameter name="alertId" value="9e8d7c6b-5a49-4382-a716-05f4e3d2c1b0"/></Stream></Connect></Response>"`,
    );
  });
});

describe("signature validation (V-01)", () => {
  const params = { CallSid: "CA1", From: "+14155550123", To: "+14155550199", CallStatus: "ringing", Direction: "inbound" };
  const url = `${BASE}/twilio/voice`;
  const good = twilio.getExpectedTwilioSignature(TOKEN, url, params);

  it("accepts Twilio's signature for the public URL, rejects anything else", () => {
    expect(signatureValid(TOKEN, good, url, params)).toBe(true);
    expect(signatureValid(TOKEN, good, "http://localhost:8787/twilio/voice", params)).toBe(false);
    expect(signatureValid(TOKEN, good, url, { ...params, From: "+19999999999" })).toBe(false);
    expect(signatureValid(TOKEN, undefined, url, params)).toBe(false);
    expect(signatureValid(undefined, good, url, params)).toBe(false);
  });

  it("POST /twilio/voice: forged → 403; signed → TwiML and a live call", async () => {
    gw = testGateway({ env: { TWILIO_AUTH_TOKEN: TOKEN } });
    const form = new URLSearchParams(params).toString();
    const headers = { "content-type": "application/x-www-form-urlencoded" };
    const forged = await gw.app.inject({ method: "POST", url: "/twilio/voice", payload: form, headers: { ...headers, "x-twilio-signature": "AAAA" } });
    expect(forged.statusCode).toBe(403);
    const ok = await gw.app.inject({ method: "POST", url: "/twilio/voice", payload: form, headers: { ...headers, "x-twilio-signature": good } });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers["content-type"]).toMatch(/text\/xml/);
    expect(ok.body).toContain("<Dial");
    const calls = gw.calls.registry.list();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ mode: "phone", callerNumber: "+14155550123", twilioCallSid: "CA1", status: "live" });
  });

  it("POST /twilio/alert-status is signature-checked too", async () => {
    gw = testGateway({ env: { TWILIO_AUTH_TOKEN: TOKEN } });
    const res = await gw.app.inject({
      method: "POST",
      url: "/twilio/alert-status",
      payload: "CallSid=CA9&CallStatus=ringing",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": "bad" },
    });
    expect(res.statusCode).toBe(403);
  });
});
