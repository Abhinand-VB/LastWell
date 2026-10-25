import { afterEach, describe, expect, it, vi } from "vitest";
import { parseWav } from "@lastwell/stt";
import { ALLOWED, auth, testGateway, until, type TestGateway } from "../testkit.js";
import { mulawToPcm16 } from "../tts/audioChunks.js";
import type { TtsClient } from "../tts/sonic.js";

let gw: TestGateway | null = null;
afterEach(async () => {
  await gw?.app.close();
  gw = null;
});

async function likelyCall(g: TestGateway) {
  const call = g.calls.create({ mode: "browser", label: "dev", streamStartedNow: true });
  g.calls.addFinal(call, { speaker: "caller", text: "It's my father, he's 78.", tStartMs: 0, tEndMs: 900 });
  g.calls.addFinal(call, { speaker: "caller", text: "His words come out all mixed up and he can't lift his coffee cup.", tStartMs: 1000, tEndMs: 2000 });
  await until(() => g.calls.registry.get(call.id)?.runner?.state.level === "likely");
  return call;
}

const approve = (g: TestGateway, callId: string) =>
  g.app.inject({ method: "POST", url: `/api/calls/${callId}/alert`, headers: auth, payload: { targetPhone: ALLOWED, confirm: true } });

describe("µ-law → PCM16", () => {
  it("decodes G.711 reference points", () => {
    const pcm = mulawToPcm16(Buffer.from([0xff, 0x7f, 0x00, 0x80]));
    expect([0, 1, 2, 3].map((i) => pcm.readInt16LE(i * 2))).toEqual([0, 0, -32124, 32124]);
  });
});

describe("ALERT_DELIVERY=local (V-12, D-43)", () => {
  it("approve synthesizes, places no call, serves the WAV of exactly the cached audio; played → briefed → completed", async () => {
    gw = testGateway({ env: { ALERT_DELIVERY: "local" }, telephonySpeed: 1000 });
    const sent = vi.spyOn(gw.hub, "toCallAndBoard");
    const call = await likelyCall(gw);
    const res = await approve(gw, call.id);
    expect(res.statusCode).toBe(200);
    const alert = res.json().alert;
    expect(alert.status).toBe("queued");
    expect(gw.tts.calls).toEqual([alert.briefingText]);
    expect(gw.telephony.placed).toHaveLength(0);

    const cached = gw.alerts.registry.get(alert.id)!.audio!;
    const wavRes = await gw.app.inject({ method: "GET", url: `/api/alerts/${alert.id}/audio`, headers: auth });
    expect(wavRes.statusCode).toBe(200);
    expect(wavRes.headers["content-type"]).toBe("audio/wav");
    const wav = parseWav(wavRes.rawPayload);
    expect(wav).toMatchObject({ sampleRate: 8000, channels: 1, bitsPerSample: 16 });
    expect(wav.data.equals(mulawToPcm16(cached))).toBe(true);
    expect(gw.tts.calls).toHaveLength(1); // served from the cache

    const played = await gw.app.inject({ method: "POST", url: `/api/alerts/${alert.id}/played`, headers: auth, payload: {} });
    expect(played.statusCode).toBe(200);
    expect(played.json().alert.status).toBe("completed");
    const statuses = sent.mock.calls.map(([, m]) => (m.type === "alert.updated" ? m.alert.status : null));
    expect(statuses).toEqual(["queued", "briefed", "completed"]);
    expect((await gw.store.listAlerts(0))[0]).toMatchObject({ alertId: alert.id, status: "completed" });
    // Idempotent: a second report changes nothing.
    expect((await gw.app.inject({ method: "POST", url: `/api/alerts/${alert.id}/played`, headers: auth, payload: {} })).json().alert.status).toBe("completed");
  });

  it("audio is re-synthesized from briefingText when the cache is gone (restart); unknown id → 404", async () => {
    gw = testGateway({ env: { ALERT_DELIVERY: "local" } });
    const call = await likelyCall(gw);
    const alert = (await approve(gw, call.id)).json().alert;
    gw.alerts.registry.delete(alert.id); // as after a gateway restart: only the store has it
    const wavRes = await gw.app.inject({ method: "GET", url: `/api/alerts/${alert.id}/audio`, headers: auth });
    expect(wavRes.statusCode).toBe(200);
    expect(gw.tts.calls).toEqual([alert.briefingText, alert.briefingText]);
    expect(parseWav(wavRes.rawPayload).data.length).toBeGreaterThan(0);
    const missing = await gw.app.inject({ method: "GET", url: `/api/alerts/6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f607/audio`, headers: auth });
    expect(missing.statusCode).toBe(404);
  });

  it("synthesis failure → failed 502; retry re-synthesizes and returns to queued; test briefing works the same way", async () => {
    gw = testGateway({ env: { ALERT_DELIVERY: "local" } });
    const real = gw.tts.synthesize.bind(gw.tts);
    let failNext = true;
    (gw.tts as TtsClient).synthesize = async (t: string) => {
      if (failNext) {
        failNext = false;
        throw new Error("sonic down");
      }
      return real(t);
    };
    const call = await likelyCall(gw);
    const res = await approve(gw, call.id);
    expect(res.statusCode).toBe(502);
    const [a] = gw.alerts.registry.forCall(call.id);
    expect(a!.status).toBe("failed");
    expect((await gw.app.inject({ method: "POST", url: `/api/alerts/${a!.id}/played`, headers: auth, payload: {} })).statusCode).toBe(409);
    const retry = await gw.app.inject({ method: "POST", url: `/api/alerts/${a!.id}/retry`, headers: auth, payload: {} });
    expect(retry.json().alert).toMatchObject({ status: "queued", lastError: null });

    const test = await gw.app.inject({ method: "POST", url: "/api/alerts/test-briefing", headers: auth, payload: { targetPhone: ALLOWED } });
    expect(test.json().alert.status).toBe("queued");
    expect(gw.telephony.placed).toHaveLength(0);
    const cfg = await gw.app.inject({ method: "GET", url: "/api/config", headers: auth });
    expect(cfg.json().alertDelivery).toBe("local");
  });
});
