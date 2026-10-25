import { afterEach, describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { QA_FALLBACK, type CaseState, type Utterance } from "@lastwell/core";
import type { InkSessionEvents } from "@lastwell/stt";
import { finalizeQa, LKW_NOT_ESTABLISHED } from "./qaAnswer.js";
import { QA_CLOSING, QA_NOT_MENTIONED, QA_SYSTEM, QA_UNCLEAR } from "./qaIntent.js";
import { AlertStreamSession } from "../twilio/alertStream.js";
import { FakeTtsStream, type TtsStream } from "../tts/sonicWs.js";
import type { SttSession, SttSessionOptions } from "../stt/sessions.js";
import type { TwilioOutMessage } from "../tts/audioChunks.js";
import { createLogger } from "../log.js";
import { ALLOWED, auth, testGateway, until, type TestGateway } from "../testkit.js";

const A01 = JSON.parse(readFileSync(fileURLToPath(new URL("../../../../packages/core/src/fixtures/caseState.A01.json", import.meta.url)), "utf8")) as CaseState;

function transcriptFor(state: CaseState): Utterance[] {
  const seen = new Map<string, Utterance>();
  const refs = [...state.signs.map((s) => s.ref), ...state.facts.map((f) => f.ref), ...(state.lkw ? [state.lkw.ref] : [])];
  refs.forEach((r, i) => {
    if (!seen.has(r.utteranceId)) seen.set(r.utteranceId, { id: r.utteranceId, callId: state.callId, seq: i + 1, speaker: r.speaker, text: r.quote, tStartMs: r.tMs, tEndMs: r.tMs + 1000 });
  });
  return [...seen.values()];
}

const NOW = new Date("2026-10-25T21:47:00Z"); // 2:47 PM PDT

describe("finalizeQa (docs/04 §4 post-processing)", () => {
  const snap = { state: A01, transcript: transcriptFor(A01) };
  it("known with a validating quote → the model's answer", () => {
    const r = finalizeQa("Is he on blood thinners?", { known: true, answer: "Yes, Eliquis.", evidence: [{ quote: A01.facts.find((f) => f.kind === "blood_thinner")!.ref.quote }] }, snap, NOW, "America/Los_Angeles");
    expect(r).toMatchObject({ answer: "Yes, Eliquis.", known: true, evidenceDropped: false });
  });
  it("known with an invented quote → fallback, evidence dropped", () => {
    const r = finalizeQa("Is he on blood thinners?", { known: true, answer: "Yes, warfarin.", evidence: [{ quote: "he takes warfarin daily" }] }, snap, NOW, "America/Los_Angeles");
    expect(r).toMatchObject({ answer: QA_FALLBACK, known: false, evidenceDropped: true });
  });
  it("known=false or no output → fallback", () => {
    expect(finalizeQa("Any seizure before this?", { known: false, answer: "", evidence: [] }, snap, NOW, "America/Los_Angeles").answer).toBe(QA_FALLBACK);
    expect(finalizeQa("Any seizure before this?", null, snap, NOW, "America/Los_Angeles").answer).toBe(QA_FALLBACK);
  });
  it("LKW questions use the parser's spoken time, never the model's", () => {
    const r = finalizeQa("When was he last normal?", { known: true, answer: "Around lunch.", evidence: [{ quote: A01.lkw!.ref.quote }] }, snap, NOW, "America/Los_Angeles");
    expect(r.answer).toMatch(/^Last seen normal at 2:00 PM, \d+ minutes ago\. Around lunch\.$/);
    expect(r.answer).not.toMatch(/[()–]/);
    const unknown = finalizeQa("When was he last known well?", { known: true, answer: "At 2 PM.", evidence: [] }, { ...snap, state: { ...A01, lkw: null } }, NOW, "America/Los_Angeles");
    expect(unknown.answer).toBe(LKW_NOT_ESTABLISHED);
  });
});

class ScriptedStt extends EventEmitter<InkSessionEvents> implements SttSession {
  readonly degraded = false;
  audio = 0;
  closed = false;
  constructor(readonly opts: SttSessionOptions) {
    super();
  }
  get speaker() {
    return this.opts.speaker;
  }
  sendAudio(b: Buffer) {
    this.audio += b.length;
  }
  sendSilence() {}
  async close() {
    this.closed = true;
  }
}

let gw: TestGateway | null = null;
afterEach(async () => {
  await gw?.app.close();
  gw = null;
});

describe("Q&A loop on the briefing call (V-08)", () => {
  async function setup(qaIdleMs = 60_000, ttsFactory?: () => TtsStream) {
    gw = testGateway({ env: { FEATURE_QA_ENABLED: "true" }, telephonySpeed: 0.0001 });
    const call = gw.calls.create({ mode: "phone", label: "dev", streamStartedNow: true });
    gw.calls.addFinal(call, { speaker: "caller", text: "It's my father, he's 78.", tStartMs: 0, tEndMs: 900 });
    gw.calls.addFinal(call, { speaker: "caller", text: "His words come out all mixed up and he can't lift his coffee cup.", tStartMs: 1000, tEndMs: 2000 });
    gw.calls.addFinal(call, { speaker: "caller", text: "Yes, he takes Eliquis.", tStartMs: 3000, tEndMs: 4000 });
    await until(() => call.runner!.state.level === "likely" && call.runner!.state.facts.some((f) => f.kind === "blood_thinner"));
    const res = await gw.app.inject({ method: "POST", url: `/api/calls/${call.id}/alert`, headers: auth, payload: { targetPhone: ALLOWED, confirm: true } });
    const alert = gw.alerts.registry.get(res.json().alert.id)!;
    expect(alert.briefingText).toMatch(/You can ask me about the call now\.$/);
    const sent: TwilioOutMessage[] = [];
    const stts: ScriptedStt[] = [];
    const tts = new FakeTtsStream();
    const s = new AlertStreamSession(
      {
        alerts: gw.alerts,
        log: createLogger("silent"),
        expectedAccountSid: "ACx",
        qaIdleMs,
        ttsStream: ttsFactory ?? (() => tts),
        stt: (o) => {
          const x = new ScriptedStt(o);
          stts.push(x);
          return x;
        },
      },
      (m) => sent.push(m),
      () => {},
    );
    s.handle({ event: "start", streamSid: "MZ1", start: { accountSid: "ACx", callSid: "CA1", customParameters: { alertId: alert.id } } });
    s.handle({ event: "media", streamSid: "MZ1", media: { track: "inbound", timestamp: "20", payload: "AAAA" } });
    expect(stts).toHaveLength(0); // no STT during the briefing
    s.handle({ event: "mark", streamSid: "MZ1", mark: { name: "briefing" } });
    expect(alert.status).toBe("qa");
    expect(stts[0]!.opts).toMatchObject({ profile: "qa", encoding: "pcm_mulaw", sampleRate: 8000 });
    sent.length = 0;
    return { s, alert, sent, stt: stts[0]!, tts };
  }

  it("question → answer spoken as media, then mark answer-1; inbound audio reaches Ink; turn recorded", async () => {
    const { s, alert, sent, stt, tts } = await setup();
    s.handle({ event: "media", streamSid: "MZ1", media: { track: "inbound", timestamp: "40", payload: "AAAA" } });
    expect(stt.audio).toBe(3);
    stt.emit("final", { text: "Is he on blood thinners?", tStartMs: 0, tEndMs: 900, sttMs: 100 });
    await until(() => sent.some((m) => m.event === "mark"));
    expect(sent.at(-1)).toEqual({ event: "mark", streamSid: "MZ1", mark: { name: "answer-1" } });
    expect(sent.slice(0, -1).every((m) => m.event === "media")).toBe(true);
    expect(tts.spoken[0]).toMatch(/Eliquis/);
    expect(alert.qaTurns[0]).toMatchObject({ seq: 1, question: "Is he on blood thinners?", known: true });
    s.handle({ event: "mark", streamSid: "MZ1", mark: { name: "answer-1" } });
    stt.emit("final", { text: "Any seizure before this?", tStartMs: 0, tEndMs: 900, sttMs: 100 });
    await until(() => alert.qaTurns.length === 2);
    expect(alert.qaTurns[1]!.answer).toBe(QA_FALLBACK);
  });

  it("barge-in: talking over an answer sends clear and cancels the TTS context", async () => {
    const { sent, stt, tts } = await setup();
    stt.emit("final", { text: "When was he last normal? Tell me everything about the whole afternoon and the lunch and the time please", tStartMs: 0, tEndMs: 900, sttMs: 100 });
    await until(() => sent.some((m) => m.event === "media"));
    stt.emit("turn.start", { tStartMs: 0 });
    expect(sent.some((m) => m.event === "clear")).toBe(true);
    expect(tts.cancelled).toEqual(["a-1"]);
  });

  it("Sonic socket fails during an answer: nothing is spoken, no turn recorded, the next question gets a fresh socket (docs/05 §9)", async () => {
    const opened: TtsStream[] = [];
    let n = 0;
    const factory = (): TtsStream => {
      n++;
      const s: TtsStream =
        n <= 1
          ? { speak: async () => Promise.reject(new Error("socket closed")), cancel: () => {}, close: () => {} }
          : new FakeTtsStream();
      opened.push(s);
      return s;
    };
    const { alert, sent, stt } = await setup(60_000, factory);
    stt.emit("final", { text: "Is he on blood thinners?", tStartMs: 0, tEndMs: 900, sttMs: 100 });
    await until(() => opened.length === 2);
    expect(sent).toEqual([]);
    expect(alert.qaTurns).toHaveLength(0);
    expect(alert.status).toBe("qa");
    stt.emit("final", { text: "Is he on blood thinners?", tStartMs: 0, tEndMs: 900, sttMs: 100 });
    await until(() => alert.qaTurns.length === 1);
    expect((opened[1] as FakeTtsStream).spoken[0]).toMatch(/Eliquis/);
    expect(sent.at(-1)).toEqual({ event: "mark", streamSid: "MZ1", mark: { name: "answer-2" } });
  });

  it("D-49: 'not mentioned' rotates among fixed phrasings and is never recorded as known", async () => {
    const { s, alert, stt } = await setup();
    const asks = ["Any seizure before this?", "Does he have diabetes?", "Any recent surgery?", "Any seizure before this?"];
    for (const [i, q] of asks.entries()) {
      stt.emit("final", { text: q, tStartMs: 0, tEndMs: 900, sttMs: 100 });
      await until(() => alert.qaTurns.length === i + 1);
      s.handle({ event: "mark", streamSid: "MZ1", mark: { name: `answer-${i + 1}` } });
    }
    expect(alert.qaTurns.map((t) => t.answer)).toEqual([...QA_NOT_MENTIONED, QA_NOT_MENTIONED[0]]);
    expect(alert.qaTurns.every((t) => !t.known && (t.evidence as unknown[]).length === 0)).toBe(true);
  });

  it("D-49: an acknowledgment says nothing and keeps listening; no model call, no turn", async () => {
    const { sent, stt, tts, alert } = await setup();
    stt.emit("final", { text: "Mm-hm.", tStartMs: 0, tEndMs: 300, sttMs: 50 });
    stt.emit("final", { text: "Ok.", tStartMs: 0, tEndMs: 300, sttMs: 50 });
    await new Promise((r) => setTimeout(r, 100));
    expect(sent).toEqual([]);
    expect(tts.spoken).toEqual([]);
    expect(alert.qaTurns).toHaveLength(0);
    expect(alert.status).toBe("qa");
  });

  it("D-49: unclear → reprompt; who is this → system line; neither is a recorded turn", async () => {
    const { s, stt, tts, sent, alert } = await setup();
    stt.emit("final", { text: "Um.", tStartMs: 0, tEndMs: 300, sttMs: 50 });
    await until(() => sent.some((m) => m.event === "mark"));
    expect(tts.spoken).toEqual([QA_UNCLEAR]);
    expect(sent.at(-1)).toEqual({ event: "mark", streamSid: "MZ1", mark: { name: "answer-1" } });
    s.handle({ event: "mark", streamSid: "MZ1", mark: { name: "answer-1" } });
    stt.emit("final", { text: "Who is this?", tStartMs: 0, tEndMs: 900, sttMs: 50 });
    await until(() => tts.spoken.length === 2);
    expect(tts.spoken[1]).toBe(QA_SYSTEM);
    expect(alert.qaTurns).toHaveLength(0);
  });

  it("D-49: 'ok, thank you' → the closing line, then a clean hang-up after its mark → completed", async () => {
    const { s, stt, tts, sent, alert } = await setup();
    stt.emit("final", { text: "ok, thank you", tStartMs: 0, tEndMs: 900, sttMs: 50 });
    await until(() => sent.some((m) => m.event === "mark"));
    expect(tts.spoken).toEqual([QA_CLOSING]);
    expect(sent.at(-1)).toEqual({ event: "mark", streamSid: "MZ1", mark: { name: "closing-1" } });
    stt.emit("final", { text: "Is he on blood thinners?", tStartMs: 0, tEndMs: 900, sttMs: 50 }); // after the closing: ignored
    s.handle({ event: "mark", streamSid: "MZ1", mark: { name: "closing-1" } });
    await until(() => alert.status === "completed");
    expect(tts.spoken).toHaveLength(1);
    expect(alert.qaTurns).toHaveLength(0);
  });

  it("silence after an answer hangs up", async () => {
    const { alert } = await setup(50);
    // No question within qaIdleMs → hang-up → the call ends → completed (it had answered).
    await until(() => alert.status === "completed");
  });
});
