// The real store: Convex functions in ../../convex/store.ts over ConvexHttpClient (docs/02, D-29).
// Every call passes the shared secret (INTERNAL_API_KEY). Rows are validated loosely on the way out.
import { ConvexHttpClient } from "convex/browser";
import type { CaseState, Level, Utterance } from "@lastwell/core";
import { api } from "./convexApi.js";
import type { AlertPatch, AlertRow, CallPatch, CallRow, NewAlert, NewCall, QaTurnRow, Store, StoredCall } from "./types.js";

type Doc = Record<string, unknown>;

function callRow(d: Doc): CallRow {
  return {
    callId: String(d.callId),
    mode: d.mode as CallRow["mode"],
    twilioCallSid: (d.twilioCallSid as string | null) ?? null,
    callerNumber: (d.callerNumber as string | null) ?? null,
    label: (d.label as string | null) ?? null,
    timezone: String(d.timezone),
    startedAt: String(d.startedAt),
    streamStartedAt: (d.streamStartedAt as string | null) ?? null,
    endedAt: (d.endedAt as string | null) ?? null,
    status: d.status as CallRow["status"],
    lastError: (d.lastError as string | null) ?? null,
  };
}

function utteranceRow(d: Doc): Utterance {
  return {
    id: String(d.utteranceId),
    callId: String(d.callId),
    seq: Number(d.seq),
    speaker: d.speaker as Utterance["speaker"],
    text: String(d.text),
    tStartMs: Number(d.tStartMs),
    tEndMs: Number(d.tEndMs),
  };
}

function alertRow(d: Doc): AlertRow {
  return {
    alertId: String(d.alertId),
    callId: String(d.callId),
    targetPhone: String(d.targetPhone),
    status: d.status as AlertRow["status"],
    briefingText: String(d.briefingText),
    caseSnapshot: d.caseSnapshot as CaseState,
    transcriptSnapshot: (d.transcriptSnapshot as Utterance[]) ?? [],
    twilioCallSid: (d.twilioCallSid as string | null) ?? null,
    createdAt: String(d.createdAt),
    emsConfirmedAt: (d.emsConfirmedAt as string | null) ?? null,
    lastError: (d.lastError as string | null) ?? null,
    updatedAt: String(d.updatedAt),
    qaTurns: ((d.qaTurns as Doc[] | undefined) ?? []).map((t) => ({
      alertId: String(t.alertId),
      seq: Number(t.seq),
      question: String(t.question),
      answer: String(t.answer),
      known: Boolean(t.known),
      evidence: t.evidence,
      ms: (t.ms as number | null) ?? null,
    })),
  };
}

export class ConvexStore implements Store {
  readonly kind = "convex" as const;
  private readonly client: ConvexHttpClient;
  private readonly secret: string;

  constructor(url: string, secret: string) {
    this.client = new ConvexHttpClient(url);
    this.secret = secret;
  }

  async insertCall(call: NewCall): Promise<void> {
    await this.client.mutation(api.store.insertCall, { secret: this.secret, call });
  }
  async patchCall(callId: string, patch: CallPatch): Promise<void> {
    await this.client.mutation(api.store.patchCall, { secret: this.secret, callId, patch });
  }
  async insertUtterance(u: Utterance): Promise<void> {
    const { id, ...rest } = u;
    await this.client.mutation(api.store.insertUtterance, { secret: this.secret, utterance: { utteranceId: id, ...rest } });
  }
  async upsertCaseState(state: CaseState): Promise<void> {
    await this.client.mutation(api.store.upsertCaseState, {
      secret: this.secret,
      callId: state.callId,
      version: state.version,
      state,
      fastPassMs: state.latency.fastPassMs,
      reasonerMs: state.latency.reasonerMs,
      updatedAt: state.updatedAt,
    });
  }
  async setCallError(callId: string, lastError: string): Promise<void> {
    await this.client.mutation(api.store.setCallError, { secret: this.secret, callId, lastError });
  }
  async insertAlert(alert: NewAlert): Promise<void> {
    await this.client.mutation(api.store.insertAlert, { secret: this.secret, alert });
  }
  async patchAlert(alertId: string, patch: AlertPatch, updatedAt: string): Promise<void> {
    await this.client.mutation(api.store.patchAlert, { secret: this.secret, alertId, patch, updatedAt });
  }
  async insertQaTurn(turn: QaTurnRow): Promise<void> {
    await this.client.mutation(api.store.insertQaTurn, { secret: this.secret, turn });
  }
  async deleteTestCalls(): Promise<{ alertIds: string[] }> {
    const r = await this.client.mutation(api.store.deleteTestCalls, { secret: this.secret });
    return { alertIds: r.alertIds };
  }
  async listCalls(limit: number): Promise<{ call: CallRow; level: Level }[]> {
    const rows = await this.client.query(api.store.listCalls, { secret: this.secret, limit });
    return rows.map((r) => ({ call: callRow(r.call as Doc), level: r.level as Level }));
  }
  async getCall(callId: string): Promise<StoredCall | null> {
    const r = await this.client.query(api.store.getCall, { secret: this.secret, callId });
    if (r === null) return null;
    return {
      call: callRow(r.call as Doc),
      utterances: (r.utterances as Doc[]).map(utteranceRow),
      caseState: ((r.caseState as Doc | null)?.state as CaseState | undefined) ?? null,
      alerts: (r.alerts as Doc[]).map(alertRow),
    };
  }
  async listAlerts(sinceMs: number): Promise<AlertRow[]> {
    const rows = await this.client.query(api.store.listAlerts, { secret: this.secret, sinceMs });
    return (rows as Doc[]).map(alertRow);
  }
}
