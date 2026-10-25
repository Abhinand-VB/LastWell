import { afterEach, describe, expect, it } from "vitest";
import { ALLOWED, NOT_ALLOWED, auth, testGateway, until, type TestGateway } from "../testkit.js";
import { actorOf } from "./auditTrail.js";

let gw: TestGateway | null = null;
afterEach(async () => {
  await gw?.app.close();
  gw = null;
});

async function likelyCall(g: TestGateway) {
  const call = g.calls.create({ mode: "phone", label: "dev", callerNumber: "+14155550123", streamStartedNow: true });
  g.calls.addFinal(call, { speaker: "dispatcher", text: "911, what is the address of your emergency?", tStartMs: 0, tEndMs: 1500 });
  g.calls.addFinal(call, { speaker: "caller", text: "It's my father, he's 78.", tStartMs: 2000, tEndMs: 2900 });
  g.calls.addFinal(call, { speaker: "caller", text: "His words come out all mixed up and he can't lift his coffee cup.", tStartMs: 3000, tEndMs: 5000 });
  g.calls.addFinal(call, { speaker: "caller", text: "Yes, he takes Eliquis.", tStartMs: 6000, tEndMs: 7000 });
  await until(() => {
    const s = g.calls.registry.get(call.id)?.runner?.state;
    return s?.level === "likely" && s.facts.some((f) => f.kind === "blood_thinner");
  });
  return call;
}

const getAudit = (g: TestGateway, callId: string) => g.app.inject({ method: "GET", url: `/api/calls/${callId}/audit`, headers: auth });

describe("GET /api/calls/:callId/audit", () => {
  it("transcript, quoted signs/facts, level changes with reasons, who approved to which number, alert status history", async () => {
    gw = testGateway({ telephonySpeed: 1000 });
    const call = await likelyCall(gw);
    const refused = await gw.app.inject({ method: "POST", url: `/api/calls/${call.id}/alert`, headers: { ...auth, "x-lastwell-actor": "Dispatcher 7" }, payload: { targetPhone: NOT_ALLOWED, confirm: true } });
    expect(refused.statusCode).toBe(409);
    const res = await gw.app.inject({ method: "POST", url: `/api/calls/${call.id}/alert`, headers: { ...auth, "x-lastwell-actor": "Dispatcher 7" }, payload: { targetPhone: ALLOWED, confirm: true } });
    const alertId = res.json().alert.id as string;
    await until(() => gw!.alerts.registry.get(alertId)?.status === "completed", 5000);

    const r = await getAudit(gw, call.id);
    expect(r.statusCode).toBe(200);
    const a = r.json();
    expect(a).toMatchObject({ auditVersion: 1, callId: call.id, historyComplete: true, finalLevel: "likely", notes: [] });

    // Every utterance, with speaker and both clocks.
    expect(a.utterances.map((u: { speaker: string }) => u.speaker)).toEqual(["dispatcher", "caller", "caller", "caller"]);
    expect(a.utterances[2]).toMatchObject({ tStartMs: 3000, at: new Date(Date.parse(a.streamStartedAt) + 3000).toISOString() });

    // Every sign and fact carries a verbatim quote from an utterance and its timestamp.
    const texts = new Map<string, string>(a.utterances.map((u: { utteranceId: string; text: string }) => [u.utteranceId, u.text]));
    for (const x of [...a.signs, ...a.facts]) {
      expect(texts.get(x.utteranceId)).toContain(x.quote);
      expect(typeof x.tMs).toBe("number");
      expect(x.at).toMatch(/Z$/);
    }
    expect(a.facts.find((f: { kind: string }) => f.kind === "blood_thinner")).toMatchObject({ value: expect.stringMatching(/Eliquis/), quote: expect.stringMatching(/Eliquis/) });

    // Level changes with the level guard's reason.
    expect(a.levelChanges.map((e: { from: string; to: string }) => `${e.from}>${e.to}`)).toEqual(["none>possible", "possible>likely"]);
    expect(a.levelChanges.at(-1)).toMatchObject({ modelLevel: "likely", reason: expect.stringMatching(/reasoner says likely/) });
    expect(a.levelChanges.at(-1).signKinds.length).toBeGreaterThanOrEqual(2);

    // Dispatcher actions: who, when, which number (masked), including the refused attempt.
    expect(a.dispatcherActions).toEqual([
      expect.objectContaining({ action: "approve", actor: "Dispatcher 7", alertId: null, targetPhoneMasked: "•••0123", detail: expect.stringMatching(/refused/) }),
      expect.objectContaining({ action: "approve", actor: "Dispatcher 7", alertId, targetPhoneMasked: "•••0100", at: expect.any(String) }),
    ]);

    // Alert status history, forward only, ending completed.
    const alert = a.alerts[0];
    expect(alert).toMatchObject({ alertId, status: "completed", targetPhoneMasked: "•••0100", levelAtApproval: "likely" });
    expect(alert.statusChanges.map((e: { to: string }) => e.to)).toEqual(["calling", "ringing", "answered", "briefed", "completed"]);

    // Events are chronological; no full phone number anywhere in the record.
    const ats = a.events.map((e: { at: string }) => Date.parse(e.at));
    expect([...ats].sort((x, y) => x - y)).toEqual(ats);
    expect(r.body).not.toContain(ALLOWED);
    expect(r.body).not.toContain(NOT_ALLOWED);
  });

  it("Q&A exchanges carry their evidence quotes; ems-confirm and retry are dispatcher actions", async () => {
    gw = testGateway({ telephonySpeed: 0.0001 });
    const call = await likelyCall(gw);
    const alertId = (await gw.app.inject({ method: "POST", url: `/api/calls/${call.id}/alert`, headers: auth, payload: { targetPhone: ALLOWED, confirm: true } })).json().alert.id as string;
    const rec = gw.alerts.registry.get(alertId)!;
    const r = await gw.alerts.answerQuestion(rec, "Is he on blood thinners?");
    gw.alerts.recordQaTurn(rec, 1, "Is he on blood thinners?", r, 900);
    await gw.app.inject({ method: "POST", url: `/api/alerts/${alertId}/ems-confirm`, headers: auth, payload: { confirmed: true } });
    await gw.app.inject({ method: "POST", url: `/api/alerts/${alertId}/retry`, headers: auth, payload: {} });
    const a = (await getAudit(gw, call.id)).json();
    expect(a.alerts[0].qa).toEqual([
      expect.objectContaining({ seq: 1, question: "Is he on blood thinners?", known: true, evidence: [expect.objectContaining({ quote: expect.stringMatching(/Eliquis/), speaker: "caller", tMs: 6000 })] }),
    ]);
    expect(a.dispatcherActions.map((d: { action: string; actor: string }) => `${d.action}:${d.actor}`)).toEqual([
      "approve:dispatcher console",
      "ems_confirm:dispatcher console",
      "retry:dispatcher console",
    ]);
  });

  it("after a restart it is rebuilt from the store (final state, transcript, alerts), marked historyComplete: false", async () => {
    gw = testGateway({ telephonySpeed: 1000 });
    const call = await likelyCall(gw);
    const alertId = (await gw.app.inject({ method: "POST", url: `/api/calls/${call.id}/alert`, headers: auth, payload: { targetPhone: ALLOWED, confirm: true } })).json().alert.id as string;
    await until(() => gw!.alerts.registry.get(alertId)?.status === "completed", 5000);
    await gw.calls.end(call);
    gw.calls.registry.evict(call.id);
    gw.alerts.registry.delete(alertId);
    const a = (await getAudit(gw, call.id)).json();
    expect(a).toMatchObject({ historyComplete: false, finalLevel: "likely", levelChanges: [], dispatcherActions: [] });
    expect(a.notes[0]).toMatch(/Rebuilt from the store/);
    expect(a.utterances).toHaveLength(4);
    expect(a.signs.length).toBeGreaterThan(0);
    expect(a.alerts[0]).toMatchObject({ alertId, status: "completed", targetPhoneMasked: "•••0100" });
  });

  it("is behind the internal key; unknown call → 404", async () => {
    gw = testGateway();
    const call = gw.calls.create({ mode: "phone", streamStartedNow: true });
    expect((await gw.app.inject({ method: "GET", url: `/api/calls/${call.id}/audit` })).statusCode).toBe(401);
    expect((await getAudit(gw, "6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f607")).statusCode).toBe(404);
  });

  it("actor header is cleaned; absent → dispatcher console", () => {
    expect(actorOf(undefined)).toBe("dispatcher console");
    expect(actorOf("  Dispatcher <b>7</b> ")).toBe("Dispatcher b7b");
    expect(actorOf("x".repeat(100))).toHaveLength(64);
  });
});
