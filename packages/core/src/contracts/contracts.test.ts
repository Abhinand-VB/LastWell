import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  CaseState,
  EvalScript,
  FastPassOutput,
  InkEvent,
  QaOutput,
  ReasonerOutput,
  SonicWsEvent,
  TwilioMediaMessage,
  TwilioOutboundMessage,
  UiClientMessage,
  UiServerMessage,
  initialCaseState,
  type AlertSummary,
  type CallInfo,
  type Utterance,
} from "./index.js";
import { loadScripts } from "../eval/loadScripts.js";
import { validateScript } from "../eval/validateScript.js";

const SCRIPTS_DIR = fileURLToPath(new URL("../../../../apps/eval/scripts/", import.meta.url));
const readScript = (id: string): unknown => JSON.parse(readFileSync(`${SCRIPTS_DIR}${id}.json`, "utf8"));
const clone = <T>(v: T): T => structuredClone(v);

const CALL_ID = "6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f607";
const UTT_ID = "0b9a8c7d-6e5f-4a3b-9c2d-1e0f2a3b4c5d";
const ALERT_ID = "9e8d7c6b-5a49-4382-a716-05f4e3d2c1b0";

const utterance: Utterance = {
  id: UTT_ID,
  callId: CALL_ID,
  seq: 4,
  speaker: "caller",
  text: "Since lunch his words come out all mixed up and his right hand is weak, he can't lift his coffee cup.",
  tStartMs: 11000,
  tEndMs: 18200,
};

const ref = { quote: "he can't lift his coffee cup", utteranceId: UTT_ID, tMs: 11000, speaker: "caller" as const };

const sampleState: CaseState = {
  ...initialCaseState(CALL_ID, "2026-10-25T14:47:30-07:00"),
  version: 3,
  level: "likely",
  modelLevel: "likely",
  signs: [
    { kind: "arms", ref, source: "fast" },
    { kind: "speech", ref: { ...ref, quote: "his words come out all mixed up" }, source: "reasoner" },
  ],
  facts: [{ kind: "blood_thinner", value: "Eliquis", ref: { ...ref, quote: "he takes Eliquis" }, source: "fast" }],
  lkw: {
    phrase: "fine at about 2 PM",
    ref: { ...ref, quote: "He was fine at about 2 PM" },
    lkwAt: "2026-10-25T14:00:00-07:00",
    rangeStart: "2026-10-25T13:45:00-07:00",
    rangeEnd: "2026-10-25T14:15:00-07:00",
    confidence: "approx",
    note: null,
    display: "2:00 PM (1:45–2:15 PM)",
    minutesAgo: null,
  },
  lookalikes: [{ name: "low blood sugar", ask: "Is he diabetic?", ref: null }],
  nextQuestion: { kind: "blood_thinner", text: "Ask: does he take any blood thinners, like Eliquis, Xarelto or warfarin?" },
  summary: "Speech trouble and a weak right hand since about 2 PM.",
  reasonerQuestion: { kind: "none", text: "" },
  droppedCount: 1,
  warnings: ["reasoner_delayed"],
  latency: { fastPassMs: 820, reasonerMs: 3100, sttMs: 640 },
};

const callInfo: CallInfo = {
  id: CALL_ID,
  mode: "phone",
  callerNumberMasked: "+1415•••4321",
  startedAt: "2026-10-25T14:47:00-07:00",
  endedAt: null,
  status: "live",
  timezone: "America/Los_Angeles",
  label: null,
};

const alert: AlertSummary = {
  id: ALERT_ID,
  callId: CALL_ID,
  targetPhoneMasked: "+1415•••4321",
  status: "briefed",
  briefingText: "Stroke pre-alert from 911.",
  caseSnapshot: sampleState,
  emsConfirmedAt: null,
  createdAt: "2026-10-25T14:49:00-07:00",
  lastError: null,
  qaTurns: [{ seq: 1, question: "Is he on blood thinners?", answer: "Yes, Eliquis.", known: true }],
};

describe("eval scripts (docs/07 §4)", () => {
  it.each(["A01", "B01", "C01"])("%s parses and passes the cross-field rules", (id) => {
    const data = readScript(id);
    expect(EvalScript.safeParse(data).success).toBe(true);
    const check = validateScript(data);
    expect(check.ok ? [] : check.errors).toEqual([]);
  });

  it("rejects likely with one sign kind", () => {
    const broken = clone(readScript("A01")) as { truth: { signs: string[] } };
    broken.truth.signs = ["speech"];
    const check = validateScript(broken);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.errors.join("\n")).toMatch(/needs ≥ 2 distinct sign kinds/);
  });

  it("rejects likely without a focal sign (D-21)", () => {
    const broken = clone(readScript("A01")) as { truth: { signs: string[] } };
    broken.truth.signs = ["balance", "eyes"];
    const check = validateScript(broken);
    expect(check.ok).toBe(false);
  });

  it("rejects an id/type mismatch and an offset in callStartLocal", () => {
    const broken = clone(readScript("B01")) as { type: string; callStartLocal: string };
    broken.type = "classic";
    broken.callStartLocal = "2026-10-25T19:20:00-07:00";
    const check = validateScript(broken);
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.errors.some((e) => e.startsWith("type:"))).toBe(true);
      expect(check.errors.some((e) => e.startsWith("callStartLocal:"))).toBe(true);
    }
  });

  it("requires sourceId and audio on hard_audio scripts", () => {
    const check = validateScript({
      id: "E03", type: "hard_audio", title: "B01 with TV", sourceId: null, callStartLocal: "2026-10-25T19:20:00",
      turns: [], truth: { isStroke: true, expectedLevel: "possible", signs: ["balance"], lkw: null, bloodThinner: null, lookalike: null, facts: [] },
      audio: null, group: "tv_background",
    });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.errors).toHaveLength(2);
  });

  it("expands hard_audio turns and truth from sourceId", () => {
    const e03 = {
      id: "E03", type: "hard_audio", title: "B01 with TV in the background", sourceId: "B01",
      callStartLocal: "2026-10-25T00:00:00",
      turns: [], truth: { isStroke: false, expectedLevel: "none", signs: [], lkw: null, bloodThinner: null, lookalike: null, facts: [] },
      audio: { file: "E03.wav", sampleRate: 16000, speakerTag: "single_mic" }, group: "tv_background",
    };
    const { scripts, errors } = loadScripts([
      { source: "scripts/B01.json", data: readScript("B01") },
      { source: "scripts/E03.json", data: e03 },
    ]);
    expect(errors).toEqual([]);
    const e = scripts.find((s) => s.id === "E03");
    expect(e?.turns).toHaveLength(12);
    expect(e?.truth.signs).toEqual(["balance", "eyes"]);
    expect(e?.callStartLocal).toBe("2026-10-25T19:20:00");
    expect(e?.group).toBe("tv_background");
  });

  it("reports a file name that does not match the id, and duplicate ids", () => {
    const { errors } = loadScripts([
      { source: "scripts/A01.json", data: readScript("A01") },
      { source: "scripts/A02.json", data: readScript("A01") },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.errors[0]).toMatch(/file name must be A01.json/);
  });
});

describe("CaseState", () => {
  it("initial state parses", () => {
    expect(CaseState.parse(initialCaseState(CALL_ID, "2026-10-25T14:47:00-07:00")).version).toBe(0);
  });

  it("a sample state round-trips through JSON", () => {
    const back = CaseState.parse(JSON.parse(JSON.stringify(sampleState)));
    expect(back).toEqual(sampleState);
  });

  it("rejects a datetime without offset", () => {
    expect(CaseState.safeParse({ ...sampleState, updatedAt: "2026-10-25T14:47:30" }).success).toBe(false);
  });
});

describe("UI WebSocket (docs/03 §5)", () => {
  const serverMessages: unknown[] = [
    { type: "auth.ok" },
    { type: "error", code: "unauthorized", message: "bad token" },
    { type: "snapshot", callId: CALL_ID, call: callInfo, utterances: [utterance], state: sampleState, alerts: [alert] },
    { type: "board.snapshot", alerts: [alert] },
    { type: "utterance.partial", callId: CALL_ID, speaker: "caller", text: "Since lunch his", tStartMs: 11000 },
    { type: "utterance.final", callId: CALL_ID, utterance },
    { type: "state.updated", callId: CALL_ID, state: sampleState },
    { type: "alert.updated", alert },
    { type: "call.ended", callId: CALL_ID, endedAt: "2026-10-25T14:48:00-07:00" },
    { type: "alert.removed", alertId: ALERT_ID },
    { type: "pong" },
  ];

  it("covers every server variant", () => {
    const types = new Set(serverMessages.map((m) => (m as { type: string }).type));
    expect(types.size).toBe(UiServerMessage.options.length);
  });

  it.each(serverMessages.map((m) => [(m as { type: string }).type, m]))("server %s parses", (_type, msg) => {
    const parsed = UiServerMessage.safeParse(msg);
    expect(parsed.error?.issues ?? []).toEqual([]);
  });

  it("rejects an unknown server type", () => {
    expect(UiServerMessage.safeParse({ type: "state.patch" }).success).toBe(false);
  });

  it.each([
    [{ type: "auth", token: "ab12" }],
    [{ type: "subscribe", scope: "call", callId: CALL_ID }],
    [{ type: "subscribe", scope: "board" }],
    [{ type: "unsubscribe", scope: "call", callId: CALL_ID }],
    [{ type: "unsubscribe", scope: "board" }],
    [{ type: "ping" }],
  ])("client %j parses", (msg) => {
    expect(UiClientMessage.safeParse(msg).success).toBe(true);
  });

  it("rejects a call subscribe without callId", () => {
    expect(UiClientMessage.safeParse({ type: "subscribe", scope: "call" }).success).toBe(false);
  });
});

describe("model outputs (docs/03 §4)", () => {
  const fast = {
    signs: [{ kind: "arms", quote: "he can't lift his coffee cup" }],
    facts: [{ kind: "last_known_well", value: "since lunch", quote: "Since lunch" }],
  };

  it("FastPassOutput parses a valid output", () => {
    expect(FastPassOutput.safeParse(fast).success).toBe(true);
  });

  it("FastPassOutput with an extra field fails", () => {
    expect(FastPassOutput.safeParse({ ...fast, confidence: 0.9 }).success).toBe(false);
  });

  it("FastPassOutput with an extra nested field fails", () => {
    expect(FastPassOutput.safeParse({ ...fast, signs: [{ kind: "arms", quote: "x", t: 11 }] }).success).toBe(false);
  });

  it("ReasonerOutput and QaOutput parse valid outputs and reject extras", () => {
    const reasoner = {
      level: "likely",
      signs: [{ kind: "speech", quote: "his words come out all mixed up" }],
      last_known_well: { phrase: "fine at about 2 PM", quote: "He was fine at about 2 PM" },
      blood_thinner: { value: "Eliquis", quote: "he takes Eliquis" },
      other_facts: [{ kind: "age", value: "78", quote: "he's 78" }],
      lookalikes: [{ name: "low blood sugar", ask: "Is he diabetic?", quote: null }],
      next_question: { kind: "none", text: "" },
      summary: "Mixed-up words and a weak right hand since about 2 PM.",
    };
    expect(ReasonerOutput.safeParse(reasoner).success).toBe(true);
    expect(ReasonerOutput.safeParse({ ...reasoner, reasoning: "…" }).success).toBe(false);
    const qa = { known: true, answer: "Yes, he takes Eliquis.", evidence: [{ quote: "he takes Eliquis" }] };
    expect(QaOutput.safeParse(qa).success).toBe(true);
    expect(QaOutput.safeParse({ ...qa, confidence: "high" }).success).toBe(false);
  });

  it.each([
    ["FastPassOutput", FastPassOutput],
    ["ReasonerOutput", ReasonerOutput],
    ["QaOutput", QaOutput],
  ] as const)("%s converts with the SDK's zodOutputFormat", (_name, schema) => {
    const format = zodOutputFormat(schema);
    expect(format.type).toBe("json_schema");
    expect(JSON.stringify(format.schema)).not.toMatch(/"(reasoning|rationale|thinking|steps)"/);
  });
});

describe("Twilio messages (docs/01 §4.1, docs/03 §12)", () => {
  it.each([
    [{ event: "connected", protocol: "Call", version: "1.0.0" }],
    [
      {
        event: "start",
        sequenceNumber: "1",
        streamSid: "MZ123",
        start: {
          streamSid: "MZ123",
          accountSid: "AC123",
          callSid: "CA123",
          tracks: ["inbound", "outbound"],
          customParameters: { callId: CALL_ID },
          mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 },
        },
      },
    ],
    [{ event: "media", streamSid: "MZ123", media: { track: "inbound", chunk: "2", timestamp: "40", payload: "//7+" } }],
    [{ event: "media", streamSid: "MZ123", media: { track: "outbound", chunk: "3", timestamp: "60", payload: "//7+" } }],
    [{ event: "mark", streamSid: "MZ123", mark: { name: "briefing" } }],
    [{ event: "stop", streamSid: "MZ123", stop: { accountSid: "AC123", callSid: "CA123" } }],
  ])("inbound %j parses", (msg) => {
    expect(TwilioMediaMessage.safeParse(msg).success).toBe(true);
  });

  it("a media message without track parses (treated as inbound by the gateway)", () => {
    const parsed = TwilioMediaMessage.parse({ event: "media", streamSid: "MZ1", media: { timestamp: "20", payload: "" } });
    expect(parsed.event === "media" && parsed.media.track).toBeUndefined();
  });

  it("keeps unknown fields (passthrough)", () => {
    const parsed = TwilioMediaMessage.parse({ event: "connected", protocol: "Call" });
    expect(parsed).toHaveProperty("protocol", "Call");
  });

  it("start without accountSid fails", () => {
    expect(TwilioMediaMessage.safeParse({ event: "start", streamSid: "MZ1", start: { callSid: "CA1" } }).success).toBe(false);
  });

  it.each([
    [{ event: "media", streamSid: "MZ1", media: { payload: "//7+" } }],
    [{ event: "mark", streamSid: "MZ1", mark: { name: "briefing" } }],
    [{ event: "clear", streamSid: "MZ1" }],
  ])("outbound %j parses", (msg) => {
    expect(TwilioOutboundMessage.safeParse(msg).success).toBe(true);
  });
});

describe("Cartesia messages (docs/01 §4.2–§4.3, docs/03 §13)", () => {
  it.each([
    [{ type: "connected", request_id: "req_1" }],
    [{ type: "turn.start" }],
    [{ type: "turn.update", transcript: "Since lunch his" }],
    [{ type: "turn.eager_end", transcript: "Since lunch his words" }],
    [{ type: "turn.resume" }],
    [{ type: "turn.end", transcript: "Since lunch his words come out all mixed up." }],
    [{ type: "error", status_code: 401, title: "Unauthorized", message: "bad key", error_code: "auth" }],
  ])("Ink %j parses", (msg) => {
    expect(InkEvent.safeParse(msg).success).toBe(true);
  });

  it.each([
    [{ type: "chunk", data: "//7+", done: false, context_id: "ctx-1" }],
    [{ type: "done", context_id: "ctx-1" }],
    [{ type: "error", message: "bad voice" }],
  ])("Sonic %j parses", (msg) => {
    expect(SonicWsEvent.safeParse(msg).success).toBe(true);
  });

  it("turn.end without transcript fails", () => {
    expect(InkEvent.safeParse({ type: "turn.end" }).success).toBe(false);
  });
});
