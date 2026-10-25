import { afterEach, describe, expect, it } from "vitest";
import { ALLOWED, NOT_ALLOWED, auth, testGateway, until, type TestGateway } from "../testkit.js";
import { canTransition } from "./alertRegistry.js";
import type { TtsClient } from "../tts/sonic.js";

let gw: TestGateway | null = null;
afterEach(async () => {
  await gw?.app.close();
  gw = null;
});

async function likelyCall(g: TestGateway) {
  const call = g.calls.create({ mode: "phone", label: "dev", streamStartedNow: true });
  g.calls.addFinal(call, { speaker: "caller", text: "It's my father, he's 78.", tStartMs: 0, tEndMs: 900 });
  g.calls.addFinal(call, { speaker: "caller", text: "His words come out all mixed up and he can't lift his coffee cup.", tStartMs: 1000, tEndMs: 2000 });
  g.calls.addFinal(call, { speaker: "caller", text: "Yes, he takes Eliquis.", tStartMs: 3000, tEndMs: 4000 });
  await until(() => g.calls.registry.get(call.id)?.runner?.state.level === "likely");
  return call;
}

describe("status machine", () => {
  it("moves forward only; terminal states stay", () => {
    expect(canTransition("calling", "ringing")).toBe(true);
    expect(canTransition("answered", "ringing")).toBe(false);
    expect(canTransition("completed", "failed")).toBe(false);
    expect(canTransition("briefed", "failed")).toBe(true);
  });
});

describe("approve (V-06)", () => {
  it("409 at level none; 409 outside the allowlist with no call placed; 404 unknown call", async () => {
    gw = testGateway();
    const call = gw.calls.create({ mode: "phone", streamStartedNow: true });
    const none = await gw.app.inject({ method: "POST", url: `/api/calls/${call.id}/alert`, headers: auth, payload: { targetPhone: ALLOWED, confirm: true } });
    expect(none.statusCode).toBe(409);
    const live = await likelyCall(gw);
    const refused = await gw.app.inject({ method: "POST", url: `/api/calls/${live.id}/alert`, headers: auth, payload: { targetPhone: NOT_ALLOWED, confirm: true } });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.message).toMatch(/ALERT_ALLOWED_NUMBERS/);
    expect(gw.telephony.placed).toHaveLength(0);
    const unknown = await gw.app.inject({ method: "POST", url: `/api/calls/6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f607/alert`, headers: auth, payload: { targetPhone: ALLOWED, confirm: true } });
    expect(unknown.statusCode).toBe(404);
    const noConfirm = await gw.app.inject({ method: "POST", url: `/api/calls/${live.id}/alert`, headers: auth, payload: { targetPhone: ALLOWED } });
    expect(noConfirm.statusCode).toBe(400);
  });

  it("composes the briefing from the snapshot, snapshots the transcript, dials, and walks to completed; a second approve is 409", async () => {
    gw = testGateway({ telephonySpeed: 1000 });
    const call = await likelyCall(gw);
    const res = await gw.app.inject({ method: "POST", url: `/api/calls/${call.id}/alert`, headers: auth, payload: { targetPhone: ALLOWED, confirm: true } });
    expect(res.statusCode).toBe(200);
    const alert = res.json().alert;
    expect(alert.status).toBe("calling");
    expect(alert.targetPhoneMasked).toBe("•••0100");
    expect(alert.briefingText).toContain("78-year-old man");
    expect(alert.briefingText).toContain("Blood thinner: Eliquis");
    expect(alert.briefingText).toMatch(/Goodbye\.$/);
    expect(gw.tts.calls).toEqual([alert.briefingText]);
    expect(gw.telephony.placed).toEqual([{ to: ALLOWED, alertId: alert.id }]);
    const rec = gw.alerts.registry.get(alert.id)!;
    expect(rec.transcriptSnapshot).toHaveLength(3);
    const again = await gw.app.inject({ method: "POST", url: `/api/calls/${call.id}/alert`, headers: auth, payload: { targetPhone: ALLOWED, confirm: true } });
    expect(again.statusCode).toBe(409);
    await until(() => rec.status === "completed", 5000);
    const stored = await gw.store.listAlerts(0);
    expect(stored[0]).toMatchObject({ alertId: alert.id, status: "completed", briefingText: alert.briefingText });
    const board = await gw.app.inject({ method: "GET", url: "/api/alerts?sinceHours=24", headers: auth });
    expect(board.json().alerts.map((a: { id: string }) => a.id)).toEqual([alert.id]);
  });

  it("Sonic failure → alert failed with a retry message (502); retry re-synthesizes and dials", async () => {
    let fail = true;
    gw = testGateway({ telephonySpeed: 1000 });
    const tts: TtsClient = { synthesize: async (t) => {
      if (fail) throw new Error("HTTP 500");
      return gw!.tts.synthesize(t);
    } };
    (gw.alerts as unknown as { deps: { tts: TtsClient } }).deps.tts = tts;
    const call = await likelyCall(gw);
    const res = await gw.app.inject({ method: "POST", url: `/api/calls/${call.id}/alert`, headers: auth, payload: { targetPhone: ALLOWED, confirm: true } });
    expect(res.statusCode).toBe(502);
    const rec = gw.alerts.registry.forCall(call.id)[0]!;
    expect(rec.status).toBe("failed");
    expect(rec.lastError).toMatch(/synthesis failed/);
    fail = false;
    const retry = await gw.app.inject({ method: "POST", url: `/api/alerts/${rec.id}/retry`, headers: auth, payload: {} });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().alert.status).toBe("calling");
  });

  it("retry from ringing ends the first call and re-dials with the cached audio (no second synthesis)", async () => {
    gw = testGateway({ telephonySpeed: 1 });
    const call = await likelyCall(gw);
    const res = await gw.app.inject({ method: "POST", url: `/api/calls/${call.id}/alert`, headers: auth, payload: { targetPhone: ALLOWED, confirm: true } });
    const rec = gw.alerts.registry.get(res.json().alert.id)!;
    await until(() => rec.status === "ringing", 3000);
    const firstSid = rec.twilioCallSid;
    const retry = await gw.app.inject({ method: "POST", url: `/api/alerts/${rec.id}/retry`, headers: auth, payload: {} });
    expect(retry.json().alert.status).toBe("calling");
    expect(rec.twilioCallSid).not.toBe(firstSid);
    expect(gw.tts.calls).toHaveLength(1);
    expect(gw.telephony.placed).toHaveLength(2);
    expect(rec.status).toBe("calling");
  });

  it("D-41: an aspirin caller's briefing names the drug, never 'blood thinner' (spoken and stored)", async () => {
    gw = testGateway({ telephonySpeed: 1000 });
    const call = gw.calls.create({ mode: "phone", label: "dev", streamStartedNow: true });
    gw.calls.addFinal(call, { speaker: "caller", text: "It's my father, he's 78.", tStartMs: 0, tEndMs: 900 });
    gw.calls.addFinal(call, { speaker: "caller", text: "His words come out all mixed up and he can't lift his coffee cup.", tStartMs: 1000, tEndMs: 2000 });
    gw.calls.addFinal(call, { speaker: "caller", text: "He takes daily aspirin.", tStartMs: 3000, tEndMs: 4000 });
    await until(() => {
      const s = gw!.calls.registry.get(call.id)?.runner?.state;
      return s?.level === "likely" && s.facts.some((f) => f.kind === "blood_thinner");
    });
    const res = await gw.app.inject({ method: "POST", url: `/api/calls/${call.id}/alert`, headers: auth, payload: { targetPhone: ALLOWED, confirm: true } });
    const alert = res.json().alert;
    expect(alert.briefingText).toMatch(/aspirin, per the caller\./i);
    expect(alert.briefingText).not.toMatch(/blood thinner/i);
    expect(gw.tts.calls).toEqual([alert.briefingText]);
  });

  it("test briefing → TEST alert; DELETE /api/alerts/test removes it", async () => {
    gw = testGateway({ telephonySpeed: 1000 });
    const res = await gw.app.inject({ method: "POST", url: "/api/alerts/test-briefing", headers: auth, payload: { targetPhone: ALLOWED } });
    expect(res.statusCode).toBe(200);
    const alert = res.json().alert;
    expect(alert.briefingText).toContain("was not established on the call");
    expect(alert.briefingText).toContain("Blood thinners were not mentioned");
    const calls = (await gw.app.inject({ method: "GET", url: "/api/calls", headers: auth })).json().calls;
    expect(calls[0].label).toBe("TEST");
    const del = await gw.app.inject({ method: "DELETE", url: "/api/alerts/test", headers: auth });
    expect(del.json()).toEqual({ deleted: 1 });
    expect(gw.alerts.registry.get(alert.id)).toBeUndefined();
  });

  it("ems-confirm toggles emsConfirmedAt", async () => {
    gw = testGateway({ telephonySpeed: 1000 });
    const call = await likelyCall(gw);
    const a = (await gw.app.inject({ method: "POST", url: `/api/calls/${call.id}/alert`, headers: auth, payload: { targetPhone: ALLOWED, confirm: true } })).json().alert;
    const on = await gw.app.inject({ method: "POST", url: `/api/alerts/${a.id}/ems-confirm`, headers: auth, payload: { confirmed: true } });
    expect(on.json().alert.emsConfirmedAt).not.toBeNull();
    const off = await gw.app.inject({ method: "POST", url: `/api/alerts/${a.id}/ems-confirm`, headers: auth, payload: { confirmed: false } });
    expect(off.json().alert.emsConfirmedAt).toBeNull();
  });

  it("dials in parallel with synthesis: an answer before the audio is ready waits for it, then briefs", async () => {
    gw = testGateway({ telephonySpeed: 100 }); // answers 20 ms after dialing
    const slow: TtsClient = { synthesize: async (t) => {
      await new Promise((r) => setTimeout(r, 300));
      return gw!.tts.synthesize(t);
    } };
    (gw.alerts as unknown as { deps: { tts: TtsClient } }).deps.tts = slow;
    const call = await likelyCall(gw);
    const res = await gw.app.inject({ method: "POST", url: `/api/calls/${call.id}/alert`, headers: auth, payload: { targetPhone: ALLOWED, confirm: true } });
    expect(res.statusCode).toBe(200);
    const rec = gw.alerts.registry.get(res.json().alert.id)!;
    await until(() => rec.status === "completed", 5000);
    const media = gw.telephony.sent.filter((x) => x.msg.event === "media");
    expect(media.length).toBeGreaterThan(1);
    expect(gw.telephony.sent.at(-1)?.msg).toMatchObject({ event: "mark", mark: { name: "briefing" } });
  });

  it("retry after a gateway restart re-synthesizes from the stored briefingText (V-10)", async () => {
    gw = testGateway({ telephonySpeed: 0.0001 }); // never rings: stays `calling`
    const call = await likelyCall(gw);
    const a = (await gw.app.inject({ method: "POST", url: `/api/calls/${call.id}/alert`, headers: auth, payload: { targetPhone: ALLOWED, confirm: true } })).json().alert;
    const store = gw.store;
    await new Promise((r) => setTimeout(r, 20)); // write-through settles
    await gw.app.close();
    gw = testGateway({ store, telephonySpeed: 0.0001 });
    const retry = await gw.app.inject({ method: "POST", url: `/api/alerts/${a.id}/retry`, headers: auth, payload: {} });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().alert.status).toBe("calling");
    expect(gw.tts.calls).toEqual([a.briefingText]);
    expect(gw.telephony.placed).toEqual([{ to: ALLOWED, alertId: a.id }]);
  });
});
