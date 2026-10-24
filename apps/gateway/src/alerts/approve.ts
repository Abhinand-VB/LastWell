// Approve → compose → Sonic bytes → outbound call (docs/05 §7), and every later alert action:
// status callbacks, stream start/mark/stop, retry, hang-up, EMS toggle, test briefing, clear tests.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Logger } from "pino";
import { CaseState, composeBriefing, type AlertStatus, type AlertSummary } from "@lastwell/core";
import type { CallService } from "../pipeline/calls.js";
import type { Repo } from "../store/repo.js";
import type { TtsClient } from "../tts/sonic.js";
import { NotAllowedError, type TelephonyClient } from "../twilio/client.js";
import type { UiHub } from "../ui/wsHub.js";
import { ACTIVE_STATUSES, AlertRegistry, canTransition, reachedAnswered, toSummary, type AlertRecord } from "./alertRegistry.js";

const TEST_FIXTURE = fileURLToPath(new URL("../../../../packages/core/src/fixtures/caseState.TEST.json", import.meta.url));

export interface AlertServiceDeps {
  alerts: AlertRegistry;
  calls: CallService;
  repo: Repo;
  hub: UiHub;
  log: Logger;
  tts: TtsClient;
  telephony: TelephonyClient;
  allowedNumbers: readonly string[];
  timezone: string;
  qaEnabled: boolean;
  now?: () => Date;
}

export type ActionResult<T> = { ok: true; value: T } | { ok: false; status: number; code: string; message: string };

const fail = (status: number, code: string, message: string): ActionResult<never> => ({ ok: false, status, code, message });

export const SYNTH_FAILED = "Briefing synthesis failed — retry";

export class AlertService {
  private readonly now: () => Date;
  constructor(private readonly deps: AlertServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  get registry(): AlertRegistry {
    return this.deps.alerts;
  }

  summary(a: AlertRecord): AlertSummary {
    return toSummary(a);
  }

  private broadcast(a: AlertRecord): void {
    this.deps.hub.toCallAndBoard(a.callId, { type: "alert.updated", alert: toSummary(a) });
  }

  /** Apply a status change (forward only unless forced) + store + broadcast. Returns false if refused. */
  setStatus(a: AlertRecord, to: AlertStatus, opts: { lastError?: string | null; force?: boolean } = {}): boolean {
    if (!opts.force && !canTransition(a.status, to)) return false;
    const from = a.status;
    a.status = to;
    if (opts.lastError !== undefined) a.lastError = opts.lastError;
    a.updatedAt = this.now().toISOString();
    this.deps.repo.patchAlert(a.id, { status: to, ...(opts.lastError !== undefined ? { lastError: opts.lastError } : {}) }, a.updatedAt);
    this.deps.log.info({ event: `alert.${to}`, alertId: a.id, callId: a.callId, from }, `alert ${to}`);
    this.broadcast(a);
    return true;
  }

  private allowed(phone: string): boolean {
    return this.deps.allowedNumbers.includes(phone);
  }

  private notAllowed(phone: string): ActionResult<never> {
    return fail(409, "not_allowed", `${phone} is not on the allowed list (ALERT_ALLOWED_NUMBERS); no call was placed`);
  }

  /** POST /api/calls/:callId/alert */
  async approve(callId: string, targetPhone: string): Promise<ActionResult<AlertSummary>> {
    const t0 = Date.now();
    if (!this.allowed(targetPhone)) return this.notAllowed(targetPhone);
    const call = this.deps.calls.registry.get(callId);
    if (!call || !call.runner) return fail(404, "unknown_call", `unknown call ${callId}`);
    const state = call.runner.state;
    if (state.level === "none") return fail(409, "no_signs", "No stroke signs heard yet: nothing to pre-alert");
    if (this.deps.alerts.forCall(callId).some((a) => ACTIVE_STATUSES.includes(a.status))) {
      return fail(409, "alert_active", "an alert for this call is already in progress");
    }
    const a = this.create(callId, call.label, targetPhone, state, [...call.utterances]);
    const r = await this.synthesizeAndDial(a);
    if (!r.ok) return r;
    this.deps.log.info({ event: "alert.created", alertId: a.id, callId, ms: Date.now() - t0, words: a.briefingText.split(/\s+/).length }, "alert created");
    return { ok: true, value: toSummary(a) };
  }

  private create(callId: string, callLabel: string | null, targetPhone: string, snapshot: CaseState, transcript: AlertRecord["transcriptSnapshot"]): AlertRecord {
    const now = this.now();
    const { text } = composeBriefing(snapshot, now, this.deps.timezone, { qaEnabled: this.deps.qaEnabled });
    const createdAt = now.toISOString();
    const a: AlertRecord = {
      id: randomUUID(),
      callId,
      callLabel,
      targetPhone,
      status: "queued",
      briefingText: text,
      caseSnapshot: snapshot,
      transcriptSnapshot: transcript,
      twilioCallSid: null,
      emsConfirmedAt: null,
      lastError: null,
      createdAt,
      updatedAt: createdAt,
      qaTurns: [],
      audio: null,
      audioPending: null,
      answeredAtMs: null,
    };
    this.deps.alerts.add(a);
    this.deps.repo.insertAlert({
      alertId: a.id,
      callId,
      targetPhone,
      status: a.status,
      briefingText: a.briefingText,
      caseSnapshot: snapshot,
      transcriptSnapshot: transcript,
      twilioCallSid: null,
      createdAt,
    });
    this.broadcast(a);
    return a;
  }

  /**
   * Audio (cached or fresh) and the outbound call run in parallel: the phone needs seconds to ring and
   * be answered, Sonic needs about one second per 8 s of speech, so dialing first saves ~3 s. If
   * synthesis fails, the call is hung up and the alert fails (502). Failures mark the alert failed.
   */
  private async synthesizeAndDial(a: AlertRecord): Promise<ActionResult<AlertSummary>> {
    const t0 = Date.now();
    const before = a.status;
    const audio = a.audio !== null ? Promise.resolve(a.audio) : this.synthesize(a);
    a.audioPending = audio.catch(() => null);
    const dial = this.deps.telephony.placeCall({ to: a.targetPhone, alertId: a.id });
    const [synth, placed] = await Promise.allSettled([audio, dial]);
    if (placed.status === "fulfilled") {
      a.twilioCallSid = placed.value.sid;
      this.deps.repo.patchAlert(a.id, { twilioCallSid: placed.value.sid }, this.now().toISOString());
    }
    if (synth.status === "rejected") {
      if (placed.status === "fulfilled") await this.hangupSid(a, placed.value.sid);
      a.twilioCallSid = null;
      this.setStatus(a, "failed", { lastError: SYNTH_FAILED, force: true });
      return fail(502, "tts_failed", `Cartesia: ${SYNTH_FAILED}`);
    }
    if (placed.status === "rejected") {
      const err: unknown = placed.reason;
      if (err instanceof NotAllowedError) {
        this.setStatus(a, "failed", { lastError: err.message, force: true });
        return this.notAllowed(a.targetPhone);
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.deps.log.error({ event: "twilio.call_error", alertId: a.id, err: msg }, "outbound call failed");
      this.setStatus(a, "failed", { lastError: `Call failed: ${msg}`, force: true });
      return fail(502, "twilio_failed", `Twilio: ${msg}`);
    }
    // Unless the new call's own callbacks already moved it on (a fast fake), the alert is now `calling`.
    if (a.status === before) this.setStatus(a, "calling", { lastError: null, force: true });
    this.deps.log.info({ event: "alert.dialed", alertId: a.id, ms: Date.now() - t0 }, "dialed and audio ready");
    return { ok: true, value: toSummary(a) };
  }

  private async synthesize(a: AlertRecord): Promise<Buffer> {
    const t = Date.now();
    try {
      const buf = await this.deps.tts.synthesize(a.briefingText);
      a.audio = buf;
      this.deps.log.info({ event: "tts.synthesized", alertId: a.id, ms: Date.now() - t, bytes: buf.length }, "briefing synthesized");
      return buf;
    } catch (err) {
      this.deps.log.error({ event: "tts.error", alertId: a.id, err: err instanceof Error ? err.message : String(err) }, "sonic failed");
      throw err;
    }
  }

  /** POST /twilio/alert-status (docs/03 §6 mapping). Callbacks for a superseded sid are ignored. */
  onTwilioStatus(sid: string, callStatus: string): void {
    const a = this.deps.alerts.bySid(sid);
    if (!a) {
      this.deps.log.info({ event: "twilio.status_unmatched", sid, callStatus }, "status for unknown sid");
      return;
    }
    switch (callStatus) {
      case "ringing":
        this.setStatus(a, "ringing");
        return;
      case "completed":
        if (reachedAnswered(a.status)) this.setStatus(a, "completed");
        else this.setStatus(a, "failed", { lastError: "not answered" });
        return;
      case "busy":
      case "no-answer":
      case "failed":
      case "canceled":
        // After the stream answered, any terminal callback means the call is over, not that it failed.
        if (reachedAnswered(a.status)) this.setStatus(a, "completed");
        else this.setStatus(a, "failed", { lastError: callStatus });
        return;
      default:
        return; // queued, initiated, in-progress: the stream's start sets answered
    }
  }

  /** Alert media stream `start`. */
  onAnswered(a: AlertRecord): void {
    a.answeredAtMs = Date.now();
    this.setStatus(a, "answered");
  }

  /** The `briefing` mark came back: the whole briefing was played. */
  async onBriefingPlayed(a: AlertRecord): Promise<void> {
    this.setStatus(a, "briefed");
    this.deps.log.info({ event: "alert.briefing_done", alertId: a.id, ms: a.answeredAtMs === null ? null : Date.now() - a.answeredAtMs }, "briefing played");
    if (!this.deps.qaEnabled) await this.hangupSid(a);
  }

  /** Stream `stop` / socket close. */
  onStreamEnded(a: AlertRecord): void {
    if (reachedAnswered(a.status)) this.setStatus(a, "completed");
  }

  private async hangupSid(a: AlertRecord, sid: string | null = a.twilioCallSid): Promise<void> {
    if (sid === null) return;
    try {
      await this.deps.telephony.endCall(sid);
    } catch (err) {
      this.deps.log.warn({ event: "twilio.hangup_error", alertId: a.id, err: err instanceof Error ? err.message : String(err) }, "hangup failed");
    }
  }

  /**
   * An alert from memory, or rehydrated from the store after a gateway restart (V-10): no audio, so a
   * retry re-synthesizes from the stored briefingText.
   */
  private async load(alertId: string): Promise<AlertRecord | undefined> {
    const mem = this.deps.alerts.get(alertId);
    if (mem) return mem;
    const row = (await this.deps.repo.listAlerts(0)).find((r) => r.alertId === alertId);
    if (!row) return undefined;
    const call = await this.deps.repo.getCall(row.callId);
    const a: AlertRecord = {
      id: row.alertId,
      callId: row.callId,
      callLabel: call?.call.label ?? null,
      targetPhone: row.targetPhone,
      status: row.status,
      briefingText: row.briefingText,
      caseSnapshot: row.caseSnapshot,
      transcriptSnapshot: row.transcriptSnapshot,
      twilioCallSid: row.twilioCallSid,
      emsConfirmedAt: row.emsConfirmedAt,
      lastError: row.lastError,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      qaTurns: row.qaTurns,
      audio: null,
      audioPending: null,
      answeredAtMs: null,
    };
    this.deps.alerts.add(a);
    this.deps.log.info({ event: "alert.rehydrated", alertId, status: a.status }, "alert loaded from the store");
    return a;
  }

  /** POST /api/alerts/:id/hangup */
  async hangup(alertId: string): Promise<ActionResult<true>> {
    const a = await this.load(alertId);
    if (!a) return fail(404, "unknown_alert", `unknown alert ${alertId}`);
    await this.hangupSid(a);
    return { ok: true, value: true };
  }

  /** POST /api/alerts/:id/retry ("Call again"): from calling, ringing or failed; same alert row. */
  async retry(alertId: string): Promise<ActionResult<AlertSummary>> {
    const a = await this.load(alertId);
    if (!a) return fail(404, "unknown_alert", `unknown alert ${alertId}`);
    if (!["calling", "ringing", "failed"].includes(a.status)) return fail(409, "bad_state", `cannot retry from ${a.status}`);
    if (!this.allowed(a.targetPhone)) return this.notAllowed(a.targetPhone);
    // Forget the old sid first so its own completed/canceled callback is ignored.
    const previous = a.twilioCallSid;
    a.twilioCallSid = null;
    if (previous !== null && a.status !== "failed") await this.hangupSid(a, previous);
    this.deps.log.info({ event: "alert.retry", alertId: a.id, previousSid: previous, cachedAudio: a.audio !== null }, "retry");
    return this.synthesizeAndDial(a);
  }

  /** POST /api/alerts/:id/ems-confirm */
  async emsConfirm(alertId: string, confirmed: boolean): Promise<ActionResult<AlertSummary>> {
    const a = await this.load(alertId);
    if (!a) return fail(404, "unknown_alert", `unknown alert ${alertId}`);
    a.emsConfirmedAt = confirmed ? this.now().toISOString() : null;
    a.updatedAt = this.now().toISOString();
    this.deps.repo.patchAlert(a.id, { emsConfirmedAt: a.emsConfirmedAt }, a.updatedAt);
    this.broadcast(a);
    return { ok: true, value: toSummary(a) };
  }

  /** POST /api/alerts/test-briefing: canned TEST state on a fresh `replay` call labelled TEST. */
  async testBriefing(targetPhone: string): Promise<ActionResult<AlertSummary>> {
    if (!this.allowed(targetPhone)) return this.notAllowed(targetPhone);
    const call = this.deps.calls.create({ mode: "replay", label: "TEST", streamStartedNow: true });
    const raw = JSON.parse(readFileSync(TEST_FIXTURE, "utf8")) as CaseState;
    const utteranceId = randomUUID();
    const snapshot = CaseState.parse({
      ...raw,
      callId: call.id,
      updatedAt: this.now().toISOString(),
      signs: raw.signs.map((s) => ({ ...s, ref: { ...s.ref, utteranceId } })),
      facts: raw.facts.map((f) => ({ ...f, ref: { ...f.ref, utteranceId } })),
    });
    await this.deps.calls.end(call);
    const a = this.create(call.id, "TEST", targetPhone, snapshot, []);
    return this.synthesizeAndDial(a);
  }

  /** DELETE /api/alerts/test */
  async deleteTest(): Promise<number> {
    const removed = new Set<string>();
    for (const a of this.deps.alerts.list()) {
      if (a.callLabel !== "TEST") continue;
      if (a.twilioCallSid !== null && ACTIVE_STATUSES.includes(a.status)) await this.hangupSid(a);
      this.deps.alerts.delete(a.id);
      removed.add(a.id);
    }
    for (const c of this.deps.calls.registry.list()) if (c.label === "TEST") this.deps.calls.registry.evict(c.id);
    const stored = await this.deps.repo.deleteTestCalls();
    for (const id of stored.alertIds) removed.add(id);
    for (const alertId of removed) this.deps.hub.toAll({ type: "alert.removed", alertId });
    this.deps.log.info({ event: "alert.test_cleared", deleted: removed.size }, "test alerts cleared");
    return removed.size;
  }

  /** Board: in-memory alerts plus stored ones from before a restart, newest first. */
  async board(sinceMs: number): Promise<AlertSummary[]> {
    const mem = this.deps.alerts.list().filter((a) => Date.parse(a.createdAt) >= sinceMs);
    const ids = new Set(mem.map((a) => a.id));
    const stored = (await this.deps.repo.listAlerts(sinceMs)).filter((a) => !ids.has(a.alertId));
    const all = [...mem.map(toSummary), ...stored.map(toSummary)];
    return all.sort((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt));
  }
}
