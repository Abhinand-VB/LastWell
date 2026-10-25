// Wires one STT session (one track) to the call (docs/05 §5): partial → utterance.partial,
// final → Utterance (seq, store, broadcast, call runner), degraded → stt_degraded warning (docs/05 §9).
import type { Logger } from "pino";
import type { CallService } from "../pipeline/calls.js";
import type { LiveCall } from "../pipeline/callRegistry.js";
import type { SttSession } from "./sessions.js";

export function attachSession(calls: CallService, call: LiveCall, session: SttSession, log: Logger): void {
  const speaker = session.speaker;
  session.on("partial", (p) => {
    try {
      calls.addPartial(call, speaker, p.text, p.tStartMs);
    } catch (err) {
      calls.recordError(call, err);
    }
  });
  session.on("final", (f) => {
    try {
      calls.addFinal(call, { speaker, text: f.text, tStartMs: f.tStartMs, tEndMs: f.tEndMs, sttMs: f.sttMs });
    } catch (err) {
      calls.recordError(call, err);
    }
  });
  session.on("error", (e) => log.warn({ event: "stt.error", callId: call.id, speaker, ...e }, "stt error"));
  session.on("reconnected", () => log.warn({ event: "stt.reconnected", callId: call.id, speaker }, "stt reconnected"));
  session.on("degraded", (e) => {
    log.error({ event: "stt.degraded", callId: call.id, speaker, ...e }, "stt degraded");
    call.runner?.setWarning("stt_degraded", true);
  });
}
