// Write-through wrapper (docs/02 §2): writes are fire-and-forget and never block the audio path;
// failures log `store.error` and the call continues. Reads return null/[] on failure.
import type { Logger } from "pino";
import type { CaseState, Utterance } from "@lastwell/core";
import type { AlertPatch, AlertRow, CallPatch, CallRow, NewAlert, NewCall, QaTurnRow, Store, StoredCall } from "./types.js";
import type { Level } from "@lastwell/core";

export class Repo {
  constructor(
    readonly store: Store,
    private readonly log: Logger,
  ) {}

  private fire(op: string, ids: Record<string, string>, p: () => Promise<unknown>): void {
    let promise: Promise<unknown>;
    try {
      promise = p();
    } catch (err) {
      promise = Promise.reject(err);
    }
    promise.catch((err: unknown) =>
      this.log.warn({ event: "store.error", op, ...ids, err: err instanceof Error ? err.message : String(err) }, "store write failed"),
    );
  }

  private async read<T>(op: string, fallback: T, p: () => Promise<T>): Promise<T> {
    try {
      return await p();
    } catch (err) {
      this.log.warn({ event: "store.error", op, err: err instanceof Error ? err.message : String(err) }, "store read failed");
      return fallback;
    }
  }

  insertCall(c: NewCall): void {
    this.fire("insertCall", { callId: c.callId }, () => this.store.insertCall(c));
  }
  patchCall(callId: string, patch: CallPatch): void {
    this.fire("patchCall", { callId }, () => this.store.patchCall(callId, patch));
  }
  insertUtterance(u: Utterance): void {
    this.fire("insertUtterance", { callId: u.callId }, () => this.store.insertUtterance(u));
  }
  upsertCaseState(s: CaseState): void {
    this.fire("upsertCaseState", { callId: s.callId }, () => this.store.upsertCaseState(s));
  }
  setCallError(callId: string, msg: string): void {
    this.fire("setCallError", { callId }, () => this.store.setCallError(callId, msg));
  }
  insertAlert(a: NewAlert): void {
    this.fire("insertAlert", { callId: a.callId, alertId: a.alertId }, () => this.store.insertAlert(a));
  }
  patchAlert(alertId: string, patch: AlertPatch, updatedAt: string): void {
    this.fire("patchAlert", { alertId }, () => this.store.patchAlert(alertId, patch, updatedAt));
  }
  insertQaTurn(t: QaTurnRow): void {
    this.fire("insertQaTurn", { alertId: t.alertId }, () => this.store.insertQaTurn(t));
  }

  deleteTestCalls(): Promise<{ alertIds: string[] }> {
    return this.read("deleteTestCalls", { alertIds: [] }, () => this.store.deleteTestCalls());
  }
  listCalls(limit: number): Promise<{ call: CallRow; level: Level }[]> {
    return this.read("listCalls", [], () => this.store.listCalls(limit));
  }
  getCall(callId: string): Promise<StoredCall | null> {
    return this.read("getCall", null, () => this.store.getCall(callId));
  }
  listAlerts(sinceMs: number): Promise<AlertRow[]> {
    return this.read("listAlerts", [], () => this.store.listAlerts(sinceMs));
  }
}
