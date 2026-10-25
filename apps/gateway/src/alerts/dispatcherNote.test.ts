import { afterEach, describe, expect, it } from "vitest";
import { createFakeModel, type ModelClient } from "@lastwell/core";
import { ALLOWED, auth, testGateway, until, type TestGateway } from "../testkit.js";
import { attributeNote, noteRefs, OVERRIDE_LINE, withDispatcherInput } from "./dispatcherNote.js";

let gw: TestGateway | null = null;
afterEach(async () => {
  await gw?.app.close();
  gw = null;
});

const NOTE = "Patient's daughter says he is allergic to penicillin.";
const BRIEF = "Stroke pre-alert from nine one one, approved by the dispatcher. Adult patient. Not yet confirmed by paramedics. Goodbye.";

async function likelyCall(g: TestGateway) {
  const call = g.calls.create({ mode: "phone", label: "dev", callerNumber: "+14155550123", streamStartedNow: true });
  g.calls.addFinal(call, { speaker: "caller", text: "It's my father, he's 78.", tStartMs: 2000, tEndMs: 2900 });
  g.calls.addFinal(call, { speaker: "caller", text: "His words come out all mixed up and he can't lift his coffee cup.", tStartMs: 3000, tEndMs: 5000 });
  g.calls.addFinal(call, { speaker: "caller", text: "Yes, he takes Eliquis.", tStartMs: 6000, tEndMs: 7000 });
  await until(() => {
    const s = g.calls.registry.get(call.id)?.runner?.state;
    return s?.level === "likely" && s.facts.some((f) => f.kind === "blood_thinner");
  });
  return call;
}

function quietCall(g: TestGateway) {
  const call = g.calls.create({ mode: "phone", label: "dev", callerNumber: "+14155550123", streamStartedNow: true });
  g.calls.addFinal(call, { speaker: "caller", text: "My husband just seems off tonight.", tStartMs: 2000, tEndMs: 3500 });
  return call;
}

const approve = (g: TestGateway, callId: string, payload: Record<string, unknown>) =>
  g.app.inject({ method: "POST", url: `/api/calls/${callId}/alert`, headers: { ...auth, "x-lastwell-actor": "Dispatcher 7" }, payload: { targetPhone: ALLOWED, confirm: true, ...payload } });

describe("dispatcher note and override (composer)", () => {
  it("appends the note verbatim after the close (docs/05 §7 sentence 8); no note → unchanged", () => {
    expect(withDispatcherInput(BRIEF, "likely", null)).toBe(BRIEF);
    expect(withDispatcherInput(BRIEF, "likely", NOTE)).toBe(`${BRIEF} The dispatcher adds: ${NOTE}`);
    expect(withDispatcherInput(BRIEF, "possible", "wife on the way")).toBe(`${BRIEF} The dispatcher adds: wife on the way`);
  });

  it("below possible: opens with the override line instead of the usual opening; possible and likely do not", () => {
    expect(OVERRIDE_LINE).toBe("Dispatcher-initiated pre-alert. LastWell has not detected stroke signs on this call.");
    expect(withDispatcherInput(BRIEF, "none", null)).toBe(`${OVERRIDE_LINE} Adult patient. Not yet confirmed by paramedics. Goodbye.`);
    expect(withDispatcherInput(BRIEF, "possible", null)).toBe(BRIEF);
    expect(OVERRIDE_LINE).not.toMatch(/not a stroke/i);
  });

  it("Q&A: note-only evidence is attributed to the dispatcher; mixed evidence says part is from the note", () => {
    const n = { id: "11111111-1111-4111-8111-111111111111", callId: "22222222-2222-4222-8222-222222222222", seq: 9, speaker: "dispatcher" as const, text: NOTE, tStartMs: 9000, tEndMs: 9000 };
    const out = { known: true, answer: "x", evidence: [{ quote: "allergic to penicillin" }, { quote: "he takes Eliquis" }] };
    const refs = noteRefs(out, n);
    expect(refs).toEqual([{ quote: "allergic to penicillin", utteranceId: n.id, tMs: 9000, speaker: "dispatcher" }]);
    expect(noteRefs(out, null)).toEqual([]);
    const fallback = { answer: "That wasn't mentioned on the call.", known: false, evidence: [], evidenceDropped: true };
    expect(attributeNote(fallback, refs)).toMatchObject({ known: true, answer: "The dispatcher said 'allergic to penicillin'." });
    const caller = { quote: "he takes Eliquis", utteranceId: "c", tMs: 0, speaker: "caller" as const };
    const known = { answer: "Takes Eliquis, per the caller.", known: true, evidence: [caller], evidenceDropped: false };
    expect(attributeNote(known, refs).answer).toBe("Takes Eliquis, per the caller. Part of this is from the dispatcher's note, not the caller.");
    expect(attributeNote(known, [])).toBe(known);
  });
});

describe("POST /api/calls/:callId/alert with note / override", () => {
  it("note is spoken verbatim and recorded in the audit (approve action + alert)", async () => {
    gw = testGateway({ telephonySpeed: 1000 });
    const call = await likelyCall(gw);
    const res = await approve(gw, call.id, { notes: `  ${NOTE}  ` });
    expect(res.statusCode).toBe(200);
    const alertId = res.json().alert.id as string;
    expect(gw.alerts.registry.get(alertId)!.briefingText).toMatch(/Not yet confirmed by paramedics\. (Goodbye|You can ask me about the call now)\. The dispatcher adds: Patient's daughter says he is allergic to penicillin\.$/);
    expect(gw.alerts.registry.get(alertId)!.briefingText.startsWith("Stroke pre-alert from nine one one")).toBe(true);
    await until(() => gw!.alerts.registry.get(alertId)?.status === "completed", 5000);
    const a = (await gw.app.inject({ method: "GET", url: `/api/calls/${call.id}/audit`, headers: auth })).json();
    expect(a.dispatcherActions).toEqual([expect.objectContaining({ action: "approve", actor: "Dispatcher 7", alertId, note: NOTE, override: false, detail: expect.stringMatching(/with a dispatcher note/) })]);
    expect(a.alerts[0]).toMatchObject({ dispatcherNote: NOTE, override: false });
  });

  it("a note over 200 characters is a 400 and nothing is placed", async () => {
    gw = testGateway({ telephonySpeed: 1000 });
    const call = await likelyCall(gw);
    const res = await approve(gw, call.id, { notes: "x".repeat(201) });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("bad_request");
    expect(gw.alerts.registry.forCall(call.id)).toHaveLength(0);
    expect((await approve(gw, call.id, { notes: "x".repeat(200) })).statusCode).toBe(200);
  });

  it("below possible: 409 override_required without override: true; with it, the override opener, audited as an override", async () => {
    gw = testGateway({ telephonySpeed: 1000 });
    const call = quietCall(gw);
    await until(() => gw!.calls.registry.get(call.id)?.runner !== undefined && gw!.calls.registry.get(call.id)!.runner!.state.version > 0);
    expect(gw.calls.registry.get(call.id)!.runner!.state.level).toBe("none");
    const refused = await approve(gw, call.id, { notes: NOTE });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe("override_required");
    expect(gw.alerts.registry.forCall(call.id)).toHaveLength(0);
    const res = await approve(gw, call.id, { notes: NOTE, override: true });
    expect(res.statusCode).toBe(200);
    const alertId = res.json().alert.id as string;
    const text = gw.alerts.registry.get(alertId)!.briefingText;
    expect(text.startsWith(OVERRIDE_LINE)).toBe(true);
    expect(text).toContain(`The dispatcher adds: ${NOTE}`);
    expect(text).not.toMatch(/not a stroke/i);
    const a = (await gw.app.inject({ method: "GET", url: `/api/calls/${call.id}/audit`, headers: auth })).json();
    expect(a.dispatcherActions.at(-1)).toMatchObject({ action: "approve", alertId, override: true, note: NOTE, detail: expect.stringMatching(/dispatcher override/) });
    expect(a.alerts[0]).toMatchObject({ override: true, dispatcherNote: NOTE, levelAtApproval: "none" });
  });

  it("Q&A: the model may quote the note; the answer is attributed to the dispatcher, and call facts stay the caller's", async () => {
    const fake = createFakeModel();
    const model: ModelClient = {
      ...fake,
      answer: async (input) => {
        if (!/allerg/i.test(input.questionText)) return fake.answer(input);
        const n = input.utterances.find((u) => u.text === NOTE);
        return { output: n ? { known: true, answer: "The caller said he is allergic to penicillin.", evidence: [{ quote: "allergic to penicillin" }] } : { known: false, answer: "", evidence: [] }, ms: 5 } as Awaited<ReturnType<ModelClient["answer"]>>;
      },
    };
    gw = testGateway({ telephonySpeed: 0.0001, model });
    const call = await likelyCall(gw);
    const alertId = (await approve(gw, call.id, { note: NOTE })).json().alert.id as string;
    const rec = gw.alerts.registry.get(alertId)!;
    const r = await gw.alerts.answerQuestion(rec, "Any allergies?");
    expect(r).toMatchObject({ known: true, path: "model", answer: "The dispatcher said 'allergic to penicillin'." });
    expect(r.evidence).toEqual([expect.objectContaining({ speaker: "dispatcher", quote: "allergic to penicillin" })]);
    // The note never enters the call transcript; caller facts are answered as before.
    expect(rec.transcriptSnapshot.some((u) => u.text === NOTE)).toBe(false);
    const bt = await gw.alerts.answerQuestion(rec, "Is he on blood thinners?");
    expect(bt.answer).toMatch(/Eliquis, per the caller/);
  });
});
