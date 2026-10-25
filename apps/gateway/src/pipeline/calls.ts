// Call lifecycle shared by every entry point (Twilio webhook, dev routes, replay, browser mic):
// create → (stream start) → final utterances → end. Wires the registry, the runner, the store and the hub.
import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import type { CallMode, CallSnapshot, ModelClient, Speaker, Utterance } from "@lastwell/core";
import type { Repo } from "../store/repo.js";
import type { UiHub } from "../ui/wsHub.js";
import { CallRunner } from "./callRunner.js";
import { CallRegistry, callInfo, type LiveCall } from "./callRegistry.js";

export interface CallServiceDeps {
  registry: CallRegistry;
  repo: Repo;
  hub: UiHub;
  log: Logger;
  model: ModelClient;
  timezone: string;
  likelyMinDistinctSigns: number;
  reasonerIntervalMs: number;
  now?: () => Date;
}

export interface CreateCallOptions {
  mode: CallMode;
  label?: string | null;
  callerNumber?: string | null;
  twilioCallSid?: string | null;
  /** Replay and dev calls start their stream clock at creation. */
  streamStartedNow?: boolean;
}

export interface FinalInput {
  speaker: Speaker;
  text: string;
  tStartMs: number;
  tEndMs: number;
  sttMs?: number | null;
}

/** Partials are throttled to one per 150 ms per speaker (docs/05 §5). */
export const PARTIAL_THROTTLE_MS = 150;

export class CallService {
  private lastPartial = new Map<string, number>();
  private readonly now: () => Date;

  constructor(private readonly deps: CallServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  get registry(): CallRegistry {
    return this.deps.registry;
  }

  create(o: CreateCallOptions): LiveCall {
    const startedAt = this.now().toISOString();
    const call = this.deps.registry.create({
      id: randomUUID(),
      mode: o.mode,
      label: o.label ?? null,
      callerNumber: o.callerNumber ?? null,
      twilioCallSid: o.twilioCallSid ?? null,
      timezone: this.deps.timezone,
      startedAt,
      streamStartedAt: o.streamStartedNow ? startedAt : null,
    });
    const log = this.deps.log.child({ callId: call.id });
    call.runner = new CallRunner(call, {
      model: this.deps.model,
      log: this.deps.log,
      timezone: this.deps.timezone,
      likelyMinDistinctSigns: this.deps.likelyMinDistinctSigns,
      reasonerIntervalMs: this.deps.reasonerIntervalMs,
      now: this.now,
      onPublish: (state) => {
        this.deps.repo.upsertCaseState(state);
        this.deps.hub.toCall(call.id, { type: "state.updated", callId: call.id, state });
      },
    });
    this.deps.repo.insertCall({
      callId: call.id,
      mode: call.mode,
      twilioCallSid: call.twilioCallSid,
      callerNumber: call.callerNumber,
      label: call.label,
      timezone: call.timezone,
      startedAt,
    });
    if (call.streamStartedAt !== null) this.deps.repo.patchCall(call.id, { streamStartedAt: call.streamStartedAt });
    log.info({ event: "call.created", mode: call.mode, label: call.label }, "call created");
    return call;
  }

  /** The zero point of every tStartMs (docs/05 §5): Twilio `start`, first mic frame. */
  markStreamStarted(call: LiveCall): void {
    if (call.streamStartedAt !== null) return;
    call.streamStartedAt = this.now().toISOString();
    this.deps.repo.patchCall(call.id, { streamStartedAt: call.streamStartedAt });
  }

  /** ms since the stream started (dev injection uses wall time). */
  elapsedMs(call: LiveCall): number {
    const base = Date.parse(call.streamStartedAt ?? call.startedAt);
    return Math.max(0, this.now().getTime() - base);
  }

  addFinal(call: LiveCall, f: FinalInput): Utterance | null {
    const text = f.text.trim();
    if (text === "") return null;
    const u: Utterance = {
      id: randomUUID(),
      callId: call.id,
      seq: ++call.seq,
      speaker: f.speaker,
      text,
      tStartMs: Math.max(0, Math.round(f.tStartMs)),
      tEndMs: Math.max(0, Math.round(f.tEndMs), Math.round(f.tStartMs)),
    };
    call.utterances.push(u);
    this.lastPartial.delete(`${call.id}:${f.speaker}`);
    this.deps.log.info(
      { event: "utterance.final", callId: call.id, speaker: u.speaker, seq: u.seq, tStartMs: u.tStartMs, ...(f.sttMs != null ? { ms: Math.round(f.sttMs) } : {}) },
      "utterance",
    );
    if (f.sttMs != null) this.deps.log.info({ event: "stt.turn_end", callId: call.id, speaker: u.speaker, seq: u.seq, ms: Math.round(f.sttMs) }, "stt turn end");
    this.deps.repo.insertUtterance(u);
    this.deps.hub.toCall(call.id, { type: "utterance.final", callId: call.id, utterance: u });
    try {
      if (f.sttMs != null) call.runner?.noteSttMs(f.sttMs);
      call.runner?.onUtterance(u);
    } catch (err) {
      this.recordError(call, err);
    }
    return u;
  }

  addPartial(call: LiveCall, speaker: Speaker, text: string, tStartMs: number): void {
    const key = `${call.id}:${speaker}`;
    const t = Date.now();
    if (t - (this.lastPartial.get(key) ?? 0) < PARTIAL_THROTTLE_MS) return;
    this.lastPartial.set(key, t);
    this.deps.hub.toCall(call.id, { type: "utterance.partial", callId: call.id, speaker, text, tStartMs: Math.round(tStartMs) });
  }

  recordError(call: LiveCall, err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    call.lastError = msg;
    this.deps.log.error({ event: "call.error", callId: call.id, err: err instanceof Error ? err.stack : msg }, "call error");
    this.deps.repo.setCallError(call.id, msg);
  }

  /** End the call (idempotent): close media sources, broadcast call.ended, final reasoner run. */
  async end(call: LiveCall): Promise<void> {
    const endedAt = this.now().toISOString();
    if (!this.deps.registry.markEnded(call.id, endedAt)) return;
    for (const f of call.onEnd.splice(0)) {
      try {
        await f();
      } catch (err) {
        this.recordError(call, err);
      }
    }
    this.deps.repo.patchCall(call.id, { endedAt, status: "ended" });
    this.deps.hub.toCall(call.id, { type: "call.ended", callId: call.id, endedAt });
    this.deps.log.info({ event: "call.ended", callId: call.id, utterances: call.utterances.length }, "call ended");
    try {
      await call.runner?.end();
    } catch (err) {
      this.recordError(call, err);
    }
  }

  snapshotOf(call: LiveCall, alerts: CallSnapshot["alerts"]): CallSnapshot {
    return {
      callId: call.id,
      call: callInfo(call),
      utterances: [...call.utterances],
      state: call.runner?.state ?? ({} as never),
      alerts,
    };
  }
}
