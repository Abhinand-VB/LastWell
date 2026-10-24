import { describe, expect, it } from "vitest";
import { applyBoardMessage, applyMessage, emptyCallView } from "./callState";
import { A01_STATE, CALL_ID, alert, callInfo, utt } from "./testFixtures";

const snapshot = (over: Partial<Parameters<typeof applyMessage>[1]> = {}) =>
  ({
    type: "snapshot",
    callId: CALL_ID,
    call: callInfo(),
    utterances: [utt(1, "dispatcher", "911, what is the address of your emergency?")],
    state: A01_STATE,
    alerts: [],
    ...over,
  }) as Parameters<typeof applyMessage>[1];

describe("applyMessage (docs/03 §5 rules)", () => {
  it("snapshot fills the view", () => {
    const v = applyMessage(emptyCallView(CALL_ID), snapshot());
    expect(v.call?.status).toBe("live");
    expect(v.utterances).toHaveLength(1);
    expect(v.state?.version).toBe(A01_STATE.version);
  });

  it("drops a state.updated with a lower version", () => {
    let v = applyMessage(emptyCallView(CALL_ID), snapshot());
    v = applyMessage(v, { type: "state.updated", callId: CALL_ID, state: { ...A01_STATE, version: 2, level: "none" } });
    expect(v.state?.level).toBe("likely");
    v = applyMessage(v, { type: "state.updated", callId: CALL_ID, state: { ...A01_STATE, version: 9, level: "possible" } });
    expect(v.state?.level).toBe("possible");
  });

  it("keeps one partial per speaker, replaced in place, removed by that speaker's final", () => {
    let v = applyMessage(emptyCallView(CALL_ID), snapshot());
    v = applyMessage(v, { type: "utterance.partial", callId: CALL_ID, speaker: "caller", text: "It's my", tStartMs: 2000 });
    v = applyMessage(v, { type: "utterance.partial", callId: CALL_ID, speaker: "caller", text: "It's my father", tStartMs: 2000 });
    v = applyMessage(v, { type: "utterance.partial", callId: CALL_ID, speaker: "dispatcher", text: "Okay", tStartMs: 2100 });
    expect(v.partials).toHaveLength(2);
    expect(v.partials.find((p) => p.speaker === "caller")?.text).toBe("It's my father");
    v = applyMessage(v, { type: "utterance.final", callId: CALL_ID, utterance: utt(2, "caller", "It's my father, he's 78.") });
    expect(v.partials.map((p) => p.speaker)).toEqual(["dispatcher"]);
    expect(v.utterances.map((u) => u.seq)).toEqual([1, 2]);
  });

  it("orders finals by seq and ignores duplicates", () => {
    let v = applyMessage(emptyCallView(CALL_ID), snapshot({ utterances: [] } as never));
    v = applyMessage(v, { type: "utterance.final", callId: CALL_ID, utterance: utt(3, "caller", "c") });
    v = applyMessage(v, { type: "utterance.final", callId: CALL_ID, utterance: utt(2, "caller", "b") });
    v = applyMessage(v, { type: "utterance.final", callId: CALL_ID, utterance: utt(3, "caller", "c") });
    expect(v.utterances.map((u) => u.seq)).toEqual([2, 3]);
  });

  it("a later snapshot keeps finals it does not contain yet and a newer state", () => {
    let v = applyMessage(emptyCallView(CALL_ID), snapshot());
    v = applyMessage(v, { type: "utterance.final", callId: CALL_ID, utterance: utt(2, "caller", "b") });
    v = applyMessage(v, { type: "state.updated", callId: CALL_ID, state: { ...A01_STATE, version: 10 } });
    v = applyMessage(v, snapshot());
    expect(v.utterances.map((u) => u.seq)).toEqual([1, 2]);
    expect(v.state?.version).toBe(10);
  });

  it("ignores messages for other calls", () => {
    const v0 = applyMessage(emptyCallView(CALL_ID), snapshot());
    const other = "c0100000-0000-4000-8000-000000000000";
    const v1 = applyMessage(v0, { type: "state.updated", callId: other, state: { ...A01_STATE, callId: other, version: 99 } });
    expect(v1).toBe(v0);
  });

  it("alert.updated upserts, alert.removed drops, call.ended marks the call", () => {
    let v = applyMessage(emptyCallView(CALL_ID), snapshot());
    v = applyMessage(v, { type: "alert.updated", alert: alert() });
    v = applyMessage(v, { type: "alert.updated", alert: alert({ status: "ringing" }) });
    expect(v.alerts.map((a) => a.status)).toEqual(["ringing"]);
    v = applyMessage(v, { type: "call.ended", callId: CALL_ID, endedAt: "2026-10-25T14:52:00-07:00" });
    expect(v.call?.status).toBe("ended");
    v = applyMessage(v, { type: "alert.removed", alertId: alert().id });
    expect(v.alerts).toEqual([]);
  });
});

describe("applyBoardMessage", () => {
  it("snapshot, update and removal, newest first", () => {
    const older = alert({ id: "b0100000-0000-4000-8000-000000000002", createdAt: "2026-10-25T13:00:00-07:00" });
    let list = applyBoardMessage([], { type: "board.snapshot", alerts: [older, alert()] });
    expect(list[0]?.id).toBe(alert().id);
    list = applyBoardMessage(list, { type: "alert.updated", alert: alert({ status: "briefed" }) });
    expect(list[0]?.status).toBe("briefed");
    list = applyBoardMessage(list, { type: "alert.removed", alertId: older.id });
    expect(list).toHaveLength(1);
  });
});
