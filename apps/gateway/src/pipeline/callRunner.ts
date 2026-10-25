// Per-call orchestrator (docs/05 §6): fast pass FIFO (one in flight) per caller utterance, reasoner
// scheduler (interval + immediate trigger, one in flight, rerun once), CaseState publishing.
// Every model failure is logged and absorbed: one call's error never reaches the process.
import type { Logger } from "pino";
import {
  addWarning,
  applyFastPass,
  applyReasoner,
  initialCaseState,
  parseLkw,
  publish,
  removeWarning,
  setSttLatency,
  validateFastPass,
  validateReasoner,
  type CaseState,
  type ModelClient,
  type ReducerConfig,
  type Utterance,
  type Warning,
} from "@lastwell/core";

export interface RunnerDeps {
  model: ModelClient;
  log: Logger;
  timezone: string;
  likelyMinDistinctSigns: number;
  reasonerIntervalMs: number;
  now?: () => Date;
  /** Called after every publish (store write-through + UI broadcast). */
  onPublish: (state: CaseState) => void;
}

export interface RunnerCall {
  readonly id: string;
  readonly startedAt: string;
  streamStartedAt: string | null;
  readonly utterances: Utterance[];
}

/** Three consecutive reasoner failures raise `reasoner_delayed` (docs/05 §9). */
export const REASONER_FAILURES_FOR_WARNING = 3;

export class CallRunner {
  private stateValue: CaseState;
  private fastQueue: Utterance[] = [];
  private fastInFlight: Promise<void> | null = null;
  private reasonerInFlight: Promise<void> | null = null;
  private rerunAfter = false;
  private dirty = false;
  private reasonerFailures = 0;
  private timer: NodeJS.Timeout | null = null;
  private ended = false;
  private readonly now: () => Date;
  private readonly log: Logger;

  constructor(
    private readonly call: RunnerCall,
    private readonly deps: RunnerDeps,
  ) {
    this.now = deps.now ?? (() => new Date());
    this.log = deps.log.child({ callId: call.id });
    this.stateValue = initialCaseState(call.id, this.now().toISOString());
    this.timer = setInterval(() => this.tick(), deps.reasonerIntervalMs);
    this.timer.unref();
  }

  get state(): CaseState {
    return this.stateValue;
  }

  private cfg(): ReducerConfig {
    return {
      likelyMinDistinctSigns: this.deps.likelyMinDistinctSigns,
      timezone: this.deps.timezone,
      streamStartedAt: this.call.streamStartedAt ?? this.call.startedAt,
      parseLkw,
    };
  }

  private publishState(next: CaseState): void {
    this.stateValue = publish(next, this.now());
    try {
      this.deps.onPublish(this.stateValue);
    } catch (err) {
      this.log.error({ event: "runner.publish_error", err: String(err) }, "publish failed");
    }
  }

  /** A final utterance has been appended to the call's transcript. */
  onUtterance(u: Utterance): void {
    this.dirty = true;
    if (u.speaker === "caller" || u.speaker === "mixed") {
      this.fastQueue.push(u);
      this.pumpFast();
    }
  }

  noteSttMs(ms: number): void {
    this.stateValue = setSttLatency(this.stateValue, ms);
  }

  setWarning(w: Warning, on: boolean): void {
    const next = on ? addWarning(this.stateValue, w) : removeWarning(this.stateValue, w);
    if (next !== this.stateValue) this.publishState(next);
  }

  private pumpFast(): void {
    if (this.fastInFlight !== null) return;
    const u = this.fastQueue.shift();
    if (u === undefined) return;
    this.fastInFlight = this.runFast(u).finally(() => {
      this.fastInFlight = null;
      this.pumpFast();
    });
  }

  private async runFast(u: Utterance): Promise<void> {
    const transcript = this.call.utterances;
    const idx = transcript.findIndex((x) => x.id === u.id);
    const prev = idx > 0 ? transcript[idx - 1] : undefined;
    const prevDispatcherText = prev?.speaker === "dispatcher" ? prev.text : null;
    try {
      const r = await this.deps.model.fastPass({ utteranceText: u.text, prevDispatcherText });
      this.log.info({ event: "fastpass.done", ms: Math.round(r.ms), seq: u.seq, empty: r.output === null }, "fast pass");
      if (r.output === null) return;
      const v = validateFastPass(r.output, u);
      for (const d of v.drops) this.log.info({ event: "validator.dropped", pass: "fast", ...d }, "dropped");
      const res = applyFastPass(this.stateValue, v, transcript, this.cfg(), r.ms);
      this.publishState(res.state);
      if (res.newSign || res.newKeyFact) this.scheduleReasoner();
    } catch (err) {
      this.log.warn({ event: "fastpass.error", seq: u.seq, err: err instanceof Error ? err.message : String(err) }, "fast pass failed");
    }
  }

  private tick(): void {
    if (this.ended || !this.dirty || this.reasonerInFlight !== null) return;
    this.startReasoner();
  }

  private scheduleReasoner(): void {
    if (this.reasonerInFlight !== null) {
      this.rerunAfter = true;
      return;
    }
    this.startReasoner();
  }

  private startReasoner(): Promise<void> {
    const p = this.runReasoner().finally(() => {
      this.reasonerInFlight = null;
      if (this.rerunAfter) {
        this.rerunAfter = false;
        this.startReasoner();
      }
    });
    this.reasonerInFlight = p;
    return p;
  }

  private async runReasoner(): Promise<void> {
    this.dirty = false;
    const utterances = [...this.call.utterances];
    if (utterances.length === 0) return;
    const now = this.now();
    try {
      const r = await this.deps.model.reason({
        utterances,
        state: this.stateValue,
        callStartedAt: new Date(this.call.streamStartedAt ?? this.call.startedAt),
        now,
        timezone: this.deps.timezone,
      });
      this.log.info({ event: "reasoner.done", ms: Math.round(r.ms), empty: r.output === null }, "reasoner");
      if (r.output === null) return;
      const v = validateReasoner(r.output, utterances);
      for (const d of v.drops) this.log.info({ event: "validator.dropped", pass: "reasoner", ...d }, "dropped");
      this.reasonerFailures = 0;
      const res = applyReasoner(this.stateValue, v, utterances, this.cfg(), r.ms);
      this.publishState(removeWarning(res.state, "reasoner_delayed"));
    } catch (err) {
      this.reasonerFailures++;
      this.log.warn({ event: "reasoner.error", failures: this.reasonerFailures, err: err instanceof Error ? err.message : String(err) }, "reasoner failed");
      if (this.reasonerFailures >= REASONER_FAILURES_FOR_WARNING) this.setWarning("reasoner_delayed", true);
      this.dirty = true; // retry on the next tick
    }
  }

  /** Call ended: stop the timer, drain the fast pass queue, run the reasoner once more (docs/05 §6). */
  async end(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    while (this.fastInFlight !== null || this.fastQueue.length > 0) {
      if (this.fastInFlight !== null) await this.fastInFlight;
      else this.pumpFast();
    }
    while (this.reasonerInFlight !== null) await this.reasonerInFlight;
    if (this.call.utterances.length > 0) await this.startReasoner();
  }

  /** Stop timers without the final run (eviction, shutdown). */
  dispose(): void {
    this.ended = true;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
