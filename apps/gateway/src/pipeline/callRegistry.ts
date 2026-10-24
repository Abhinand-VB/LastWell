// In-memory calls (docs/05 §3, docs/01 §5 step 10): the source of truth while a call is live; kept
// 30 minutes after it ends for snapshots and approvals, then evicted.
import type { CallInfo, CallMode, Utterance } from "@lastwell/core";
import type { CallRunner } from "./callRunner.js";

export const RESIDENT_AFTER_END_MS = 30 * 60 * 1000;

export interface LiveCall {
  id: string;
  mode: CallMode;
  label: string | null;
  callerNumber: string | null;
  twilioCallSid: string | null;
  timezone: string;
  startedAt: string;
  streamStartedAt: string | null;
  endedAt: string | null;
  status: "live" | "ended" | "failed";
  lastError: string | null;
  seq: number;
  utterances: Utterance[];
  runner: CallRunner | null;
  /** Ends media sources (Ink sessions, replay timers) when the call is ended from outside. */
  onEnd: Array<() => Promise<void> | void>;
}

export function maskNumber(n: string | null): string | null {
  if (n === null || n === "") return null;
  return `•••${n.slice(-4)}`;
}

export function callInfo(c: Pick<LiveCall, "id" | "mode" | "callerNumber" | "startedAt" | "endedAt" | "status" | "timezone" | "label">): CallInfo {
  return {
    id: c.id,
    mode: c.mode,
    callerNumberMasked: maskNumber(c.callerNumber),
    startedAt: c.startedAt,
    endedAt: c.endedAt,
    status: c.status,
    timezone: c.timezone,
    label: c.label,
  };
}

export class CallRegistry {
  private calls = new Map<string, LiveCall>();
  private evictions = new Map<string, NodeJS.Timeout>();

  create(init: Omit<LiveCall, "seq" | "utterances" | "runner" | "onEnd" | "endedAt" | "status" | "lastError" | "streamStartedAt"> & { streamStartedAt?: string | null }): LiveCall {
    const call: LiveCall = {
      ...init,
      streamStartedAt: init.streamStartedAt ?? null,
      endedAt: null,
      status: "live",
      lastError: null,
      seq: 0,
      utterances: [],
      runner: null,
      onEnd: [],
    };
    this.calls.set(call.id, call);
    return call;
  }

  get(id: string): LiveCall | undefined {
    return this.calls.get(id);
  }

  list(): LiveCall[] {
    return [...this.calls.values()];
  }

  get liveCount(): number {
    let n = 0;
    for (const c of this.calls.values()) if (c.status === "live") n++;
    return n;
  }

  /** Mark ended (idempotent) and schedule eviction. Returns false if it was already ended. */
  markEnded(id: string, endedAt: string): boolean {
    const c = this.calls.get(id);
    if (!c || c.status !== "live") return false;
    c.status = "ended";
    c.endedAt = endedAt;
    const t = setTimeout(() => this.evict(id), RESIDENT_AFTER_END_MS);
    t.unref();
    this.evictions.set(id, t);
    return true;
  }

  evict(id: string): void {
    this.calls.get(id)?.runner?.dispose();
    this.calls.delete(id);
    const t = this.evictions.get(id);
    if (t) clearTimeout(t);
    this.evictions.delete(id);
  }

  disposeAll(): void {
    for (const id of [...this.calls.keys()]) this.evict(id);
  }
}
