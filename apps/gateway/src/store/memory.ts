// MemoryStore: the `store` fake (docs/10 §4). Same semantics as convex/store.ts, in process maps.
import type { CaseState, Utterance } from "@lastwell/core";
import type { AlertPatch, AlertRow, CallPatch, CallRow, NewAlert, NewCall, QaTurnRow, Store, StoredCall } from "./types.js";

export class MemoryStore implements Store {
  readonly kind = "memory" as const;
  private calls = new Map<string, CallRow & { order: number }>();
  private utterances = new Map<string, Utterance[]>();
  private states = new Map<string, CaseState>();
  private alerts = new Map<string, AlertRow & { createdMs: number }>();
  private order = 0;

  async insertCall(call: NewCall): Promise<void> {
    if (this.calls.has(call.callId)) return;
    this.calls.set(call.callId, { ...call, streamStartedAt: null, endedAt: null, status: "live", lastError: null, order: this.order++ });
  }

  async patchCall(callId: string, patch: CallPatch): Promise<void> {
    const c = this.calls.get(callId);
    if (c) this.calls.set(callId, { ...c, ...patch });
  }

  async insertUtterance(u: Utterance): Promise<void> {
    const list = this.utterances.get(u.callId) ?? [];
    if (list.some((x) => x.seq === u.seq)) return;
    list.push(u);
    list.sort((a, b) => a.seq - b.seq);
    this.utterances.set(u.callId, list);
  }

  async upsertCaseState(state: CaseState): Promise<void> {
    const existing = this.states.get(state.callId);
    if (existing && state.version < existing.version) return;
    this.states.set(state.callId, state);
  }

  async setCallError(callId: string, lastError: string): Promise<void> {
    await this.patchCall(callId, { lastError });
  }

  async insertAlert(alert: NewAlert): Promise<void> {
    if (this.alerts.has(alert.alertId)) return;
    this.alerts.set(alert.alertId, {
      ...alert,
      emsConfirmedAt: null,
      lastError: null,
      updatedAt: alert.createdAt,
      qaTurns: [],
      createdMs: Date.now(),
    });
  }

  async patchAlert(alertId: string, patch: AlertPatch, updatedAt: string): Promise<void> {
    const a = this.alerts.get(alertId);
    if (a) this.alerts.set(alertId, { ...a, ...patch, updatedAt });
  }

  async insertQaTurn(turn: QaTurnRow): Promise<void> {
    const a = this.alerts.get(turn.alertId);
    if (a && !a.qaTurns.some((t) => t.seq === turn.seq)) a.qaTurns.push(turn);
  }

  async deleteTestCalls(): Promise<{ alertIds: string[] }> {
    const alertIds: string[] = [];
    for (const c of [...this.calls.values()].filter((x) => x.label === "TEST")) {
      for (const a of [...this.alerts.values()].filter((x) => x.callId === c.callId)) {
        alertIds.push(a.alertId);
        this.alerts.delete(a.alertId);
      }
      this.calls.delete(c.callId);
      this.utterances.delete(c.callId);
      this.states.delete(c.callId);
    }
    return { alertIds };
  }

  async listCalls(limit: number) {
    return [...this.calls.values()]
      .sort((a, b) => b.order - a.order)
      .slice(0, limit)
      .map(({ order: _o, ...call }) => ({ call, level: this.states.get(call.callId)?.level ?? ("none" as const) }));
  }

  async getCall(callId: string): Promise<StoredCall | null> {
    const c = this.calls.get(callId);
    if (!c) return null;
    const { order: _o, ...call } = c;
    return {
      call,
      utterances: [...(this.utterances.get(callId) ?? [])],
      caseState: this.states.get(callId) ?? null,
      alerts: [...this.alerts.values()].filter((a) => a.callId === callId).map(({ createdMs: _c, ...a }) => a),
    };
  }

  async listAlerts(sinceMs: number): Promise<AlertRow[]> {
    return [...this.alerts.values()]
      .filter((a) => a.createdMs >= sinceMs)
      .sort((a, b) => b.createdMs - a.createdMs)
      .map(({ createdMs: _c, ...a }) => a);
  }
}
