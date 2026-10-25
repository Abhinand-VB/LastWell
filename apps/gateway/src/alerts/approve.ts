// Approve → compose → Sonic bytes → outbound call (docs/05 §7), and every later alert action:
// status callbacks, stream start/mark/stop, retry, hang-up, EMS toggle, test briefing, clear tests.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Logger } from "pino";
import { CaseState, composeBriefing, type AlertStatus, type AlertSummary, type ModelClient } from "@lastwell/core";
import { finalizeQa, type QaFinal } from "./qaAnswer.js";
import { attributeNote, noteRefs, belowPossible, noteUtterance, withDispatcherInput } from "./dispatcherNote.js";
import { answerFromState } from "./qaFast.js";
import type { CallService } from "../pipeline/calls.js";
import { maskNumber } from "../pipeline/callRegistry.js";
import type { AuditEvent, DispatcherAction } from "../audit/auditTrail.js";
import type { Repo } from "../store/repo.js";
import type { TtsClient } from "../tts/sonic.js";
import { NotAllowedError, type TelephonyClient } from "../twilio/client.js";
import type { UiHub } from "../ui/wsHub.js";
import { CALL_LIMIT_TEXT, EXTRAS_TIMEOUT_MS, withTimeout, type BriefingAudioStore, type CallLimiter } from "./convexExtras.js";
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
  /** D-43: `local` synthesizes but places no call; the browser fetches the audio and reports `played`. */
  delivery?: "phone" | "local";
  /** Q&A on the briefing call (V-08, FEATURE_QA_ENABLED). */
  model?: ModelClient;
  now?: () => Date;
  /** Proposed D-57, CONVEX_AUDIO_STORAGE: keep the Sonic bytes in Convex file storage. Absent = off. */
  audioStore?: BriefingAudioStore | null;
  /** Proposed D-57, CONVEX_CALL_RATE_LIMIT: per-number outbound call limit, on top of the allowlist. Absent = off. */
  callLimiter?: CallLimiter | null;
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

  /** Append to the call's audit trail (in memory while the call is resident). */
  private audit(callId: string, ev: AuditEvent): void {
    this.deps.calls.registry.get(callId)?.audit.push(ev);
  }

  private action(
    callId: string,
    action: DispatcherAction,
    actor: string,
    alertId: string | null,
    detail: string | null = null,
    targetPhone: string | null = null,
    input: { note?: string | null; override?: boolean } = {},
  ): void {
    const extra = action === "approve" ? { note: input.note ?? null, override: input.override === true } : {};
    this.audit(callId, { at: this.now().toISOString(), type: "dispatcher", action, actor, alertId, targetPhoneMasked: maskNumber(targetPhone), detail, ...extra });
    this.deps.log.info({ event: "audit.action", callId, alertId, action, actor }, "dispatcher action");
  }

  /** Apply a status change (forward only unless forced) + store + broadcast. Returns false if refused. */
  setStatus(a: AlertRecord, to: AlertStatus, opts: { lastError?: string | null; force?: boolean; ms?: number } = {}): boolean {
    if (!opts.force && !canTransition(a.status, to)) return false;
    const from = a.status;
    a.status = to;
    if (opts.lastError !== undefined) a.lastError = opts.lastError;
    a.updatedAt = this.now().toISOString();
    this.deps.repo.patchAlert(a.id, { status: to, ...(opts.lastError !== undefined ? { lastError: opts.lastError } : {}) }, a.updatedAt);
    this.deps.log.info({ event: `alert.${to}`, alertId: a.id, callId: a.callId, from, ...(opts.ms !== undefined ? { ms: opts.ms } : {}) }, `alert ${to}`);
    this.audit(a.callId, { at: a.updatedAt, type: "alert.status", alertId: a.id, from, to, lastError: a.lastError });
    this.broadcast(a);
    return true;
  }

  private allowed(phone: string): boolean {
    return this.deps.allowedNumbers.includes(phone);
  }

  private notAllowed(phone: string): ActionResult<never> {
    return fail(409, "not_allowed", `${phone} is not on the allowed list (ALERT_ALLOWED_NUMBERS); no call was placed`);
  }

  /**
   * Proposed D-57: one outbound-call credit for `phone` from the Convex rate limiter (CONVEX_CALL_RATE_LIMIT).
   * Checked after the allowlist, never instead of it. No limiter, local delivery (no call) or Convex
   * unreachable → null (allowed; the allowlist still guards every call).
   */
  private async callLimited(phone: string): Promise<ActionResult<never> | null> {
    const limiter = this.deps.callLimiter;
    if (!limiter || this.deps.delivery === "local") return null;
    try {
      const r = await withTimeout(limiter.takeAlertCall(phone), EXTRAS_TIMEOUT_MS, "rate limit");
      if (r.ok) return null;
      const s = Math.max(1, Math.ceil(r.retryAfterMs / 1000));
      this.deps.log.warn({ event: "alert.rate_limited", retryAfterMs: r.retryAfterMs }, "outbound call refused by the rate limit");
      return fail(409, "rate_limited", `Rate limit reached for ${phone} (${CALL_LIMIT_TEXT}); try again in ${s} s. No call was placed`);
    } catch (err) {
      this.deps.log.warn({ event: "rate_limit.unavailable", err: err instanceof Error ? err.message : String(err) }, "rate limit not checked");
      return null;
    }
  }

  /** POST /api/calls/:callId/alert */
  async approve(callId: string, targetPhone: string, actor = "dispatcher console", input: { note?: string | null; override?: boolean } = {}): Promise<ActionResult<AlertSummary>> {
    const t0 = Date.now();
    const call = this.deps.calls.registry.get(callId);
    if (!this.allowed(targetPhone)) {
      if (call) this.action(callId, "approve", actor, null, "refused: number not on ALERT_ALLOWED_NUMBERS, no call placed", targetPhone, { note: input.note ?? null });
      return this.notAllowed(targetPhone);
    }
    if (!call || !call.runner) return fail(404, "unknown_call", `unknown call ${callId}`);
    const state = call.runner.state;
    const note = input.note ? input.note : null;
    const override = belowPossible(state.level);
    if (override && input.override !== true) {
      return fail(409, "override_required", "No stroke signs heard yet: send override: true to pre-alert on the dispatcher's judgment (D-53)");
    }
    if (this.deps.alerts.forCall(callId).some((a) => ACTIVE_STATUSES.includes(a.status))) {
      return fail(409, "alert_active", "an alert for this call is already in progress");
    }
    const limited = await this.callLimited(targetPhone);
    if (limited) {
      this.action(callId, "approve", actor, null, "refused: alert-call rate limit reached, no call placed", targetPhone, { note });
      return limited;
    }
    const a = this.create(callId, call.label, targetPhone, state, [...call.utterances], note, override);
    this.action(
      callId,
      "approve",
      actor,
      a.id,
      `level ${state.level}${override ? " (dispatcher override: below possible)" : ""}; briefing composed from the state at approval (version ${state.version})${note ? "; with a dispatcher note" : ""}`,
      targetPhone,
      { note, override },
    );
    const r = await this.synthesizeAndDial(a);
    if (!r.ok) return r;
    this.deps.log.info({ event: "alert.created", alertId: a.id, callId, ms: Date.now() - t0, words: a.briefingText.split(/\s+/).length }, "alert created");
    return { ok: true, value: toSummary(a) };
  }

  private create(callId: string, callLabel: string | null, targetPhone: string, snapshot: CaseState, transcript: AlertRecord["transcriptSnapshot"], note: string | null = null, override = false): AlertRecord {
    const now = this.now();
    const text = withDispatcherInput(composeBriefing(snapshot, now, this.deps.timezone, { qaEnabled: this.deps.qaEnabled }).text, snapshot.level, note);
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
      note,
      override,
      noteUtterance: note ? noteUtterance(note, transcript, callId) : null,
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
    if (this.deps.delivery === "local") return this.synthesizeOnly(a);
    const t0 = Date.now();
    const before = a.status;
    const audio = this.audioFor(a);
    a.audioPending = audio.catch(() => null);
    a.dialedAtMs = Date.now();
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

  /** D-43 local delivery: no call; the alert stays `queued` until the browser reports `played`. */
  private async synthesizeOnly(a: AlertRecord): Promise<ActionResult<AlertSummary>> {
    const audio = this.audioFor(a);
    a.audioPending = audio.catch(() => null);
    try {
      await audio;
    } catch {
      this.setStatus(a, "failed", { lastError: SYNTH_FAILED, force: true });
      return fail(502, "tts_failed", `Cartesia: ${SYNTH_FAILED}`);
    }
    if (a.status === "failed") this.setStatus(a, "queued", { lastError: null, force: true });
    this.deps.log.info({ event: "alert.local_ready", alertId: a.id, bytes: a.audio?.length ?? 0 }, "briefing ready to play in the browser");
    return { ok: true, value: toSummary(a) };
  }

  /** GET /api/alerts/:id/audio: the cached µ-law briefing; re-synthesized from briefingText if the cache is gone. */
  async briefingAudio(alertId: string): Promise<ActionResult<Buffer>> {
    const a = await this.load(alertId);
    if (!a) return fail(404, "unknown_alert", `unknown alert ${alertId}`);
    const cached = a.audio ?? (a.audioPending ? await a.audioPending : null);
    if (cached !== null) return { ok: true, value: cached };
    try {
      return { ok: true, value: await this.audioFor(a) };
    } catch {
      return fail(502, "tts_failed", `Cartesia: ${SYNTH_FAILED}`);
    }
  }

  /** POST /api/alerts/:id/played: the browser finished playing the briefing → briefed → completed. */
  async played(alertId: string, actor = "dispatcher console"): Promise<ActionResult<AlertSummary>> {
    const a = await this.load(alertId);
    if (!a) return fail(404, "unknown_alert", `unknown alert ${alertId}`);
    if (a.status !== "completed") this.action(a.callId, "played_locally", actor, a.id);
    if (a.status === "completed") return { ok: true, value: toSummary(a) };
    if (a.status === "failed") return fail(409, "bad_state", "the briefing failed; retry first");
    if (a.status !== "briefed") this.setStatus(a, "briefed");
    this.setStatus(a, "completed");
    return { ok: true, value: toSummary(a) };
  }

  private async synthesize(a: AlertRecord): Promise<Buffer> {
    const t = Date.now();
    try {
      const buf = await this.deps.tts.synthesize(a.briefingText);
      a.audio = buf;
      this.deps.log.info({ event: "tts.synthesized", alertId: a.id, ms: Date.now() - t, bytes: buf.length }, "briefing synthesized");
      if (this.deps.audioStore) this.storeAudio(this.deps.audioStore, a, buf);
      return buf;
    } catch (err) {
      this.deps.log.error({ event: "tts.error", alertId: a.id, err: err instanceof Error ? err.message : String(err) }, "sonic failed");
      throw err;
    }
  }

  /** The cached bytes, else (proposed D-57, CONVEX_AUDIO_STORAGE) the stored file for an alert rehydrated after a restart, else Sonic. */
  private audioFor(a: AlertRecord): Promise<Buffer> {
    if (a.audio !== null) return Promise.resolve(a.audio);
    if (!this.deps.audioStore || !a.rehydrated) return this.synthesize(a);
    return this.storedOrSynthesize(this.deps.audioStore, a);
  }

  private async storedOrSynthesize(store: BriefingAudioStore, a: AlertRecord): Promise<Buffer> {
    const t = Date.now();
    try {
      const buf = await withTimeout(store.loadBriefingAudio(a.id), EXTRAS_TIMEOUT_MS, "stored audio");
      if (buf !== null && buf.length > 0) {
        a.audio = buf;
        this.deps.log.info({ event: "audio.from_storage", alertId: a.id, ms: Date.now() - t, bytes: buf.length }, "briefing loaded from Convex storage");
        return buf;
      }
    } catch (err) {
      this.deps.log.warn({ event: "audio.storage_error", alertId: a.id, err: err instanceof Error ? err.message : String(err) }, "stored audio unavailable");
    }
    return this.synthesize(a);
  }

  /** Write-through like the store: never awaited by the call path, failures only logged. */
  private storeAudio(store: BriefingAudioStore, a: AlertRecord, buf: Buffer): void {
    store.saveBriefingAudio(a.id, buf).then(
      () => this.deps.log.info({ event: "audio.stored", alertId: a.id, bytes: buf.length }, "briefing saved to Convex storage"),
      (err: unknown) => this.deps.log.warn({ event: "audio.storage_error", alertId: a.id, err: err instanceof Error ? err.message : String(err) }, "briefing not saved"),
    );
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
    // ms = ring time: outbound call placed → the stream started (the phone was picked up).
    this.setStatus(a, "answered", a.dialedAtMs != null ? { ms: a.answeredAtMs - a.dialedAtMs } : {});
  }

  /** The `briefing` mark came back: the whole briefing was played. */
  async onBriefingPlayed(a: AlertRecord): Promise<void> {
    this.setStatus(a, "briefed");
    this.deps.log.info({ event: "alert.briefing_done", alertId: a.id, ms: a.answeredAtMs === null ? null : Date.now() - a.answeredAtMs }, "briefing played");
    if (!this.deps.qaEnabled) await this.hangupSid(a);
  }

  get qaEnabled(): boolean {
    return this.deps.qaEnabled;
  }

  /** The briefing finished and Q&A is on: status qa. */
  onQaOpen(a: AlertRecord): void {
    this.setStatus(a, "qa");
  }

  /**
   * One neurologist question → validated answer text (docs/04 §4). The fast path answers common
   * questions from the case state with no model call; the rest go to the model. Never throws.
   */
  async answerQuestion(a: AlertRecord, question: string): Promise<QaFinal & { modelMs: number; path: "fast" | "model" }> {
    const now = this.now();
    const nu = a.noteUtterance ?? null;
    const transcript = nu ? [...a.transcriptSnapshot, nu] : a.transcriptSnapshot;
    const fast = answerFromState(question, a.caseSnapshot, a.transcriptSnapshot, now, this.deps.timezone);
    if (fast !== null) {
      this.deps.log.info({ event: "qa.fast", alertId: a.id, topics: fast.topics }, "answered from the case state");
      return { answer: fast.answer, known: fast.known, evidence: fast.evidence, evidenceDropped: false, modelMs: 0, path: "fast" };
    }
    let out = null;
    let modelMs = 0;
    try {
      if (!this.deps.model) throw new Error("no model");
      const r = await this.deps.model.answer({ questionText: question, utterances: transcript, state: a.caseSnapshot, now, timezone: this.deps.timezone });
      out = r.output;
      modelMs = Math.round(r.ms);
    } catch (err) {
      this.deps.log.warn({ event: "qa.model_error", alertId: a.id, err: err instanceof Error ? err.message : String(err) }, "qa model failed");
    }
    const final = attributeNote(finalizeQa(question, out, { state: a.caseSnapshot, transcript: a.transcriptSnapshot }, now, this.deps.timezone), noteRefs(out, nu));
    if (final.evidenceDropped) this.deps.log.info({ event: "qa.evidence_dropped", alertId: a.id }, "qa evidence did not validate");
    return { ...final, modelMs, path: "model" };
  }

  /** Record an answered turn (store + board/console via alert.updated). */
  recordQaTurn(a: AlertRecord, seq: number, question: string, f: QaFinal, ms: number | null): void {
    const turn = { alertId: a.id, seq, question, answer: f.answer, known: f.known, evidence: f.evidence, ms };
    a.qaTurns.push(turn);
    this.deps.repo.insertQaTurn(turn);
    this.broadcast(a);
  }

  async hangupAlert(a: AlertRecord): Promise<void> {
    await this.hangupSid(a);
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
      rehydrated: true,
    };
    this.deps.alerts.add(a);
    this.deps.log.info({ event: "alert.rehydrated", alertId, status: a.status }, "alert loaded from the store");
    return a;
  }

  /** POST /api/alerts/:id/hangup */
  async hangup(alertId: string, actor = "dispatcher console"): Promise<ActionResult<true>> {
    const a = await this.load(alertId);
    if (!a) return fail(404, "unknown_alert", `unknown alert ${alertId}`);
    this.action(a.callId, "hangup", actor, a.id);
    await this.hangupSid(a);
    return { ok: true, value: true };
  }

  /** POST /api/alerts/:id/retry ("Call again"): from calling, ringing or failed; same alert row. */
  async retry(alertId: string, actor = "dispatcher console"): Promise<ActionResult<AlertSummary>> {
    const a = await this.load(alertId);
    if (!a) return fail(404, "unknown_alert", `unknown alert ${alertId}`);
    this.action(a.callId, "retry", actor, a.id, `from ${a.status}`, a.targetPhone);
    const retryable = this.deps.delivery === "local" ? ["queued", "failed"] : ["calling", "ringing", "failed"];
    if (!retryable.includes(a.status)) return fail(409, "bad_state", `cannot retry from ${a.status}`);
    if (!this.allowed(a.targetPhone)) return this.notAllowed(a.targetPhone);
    const limited = await this.callLimited(a.targetPhone);
    if (limited) return limited;
    // Forget the old sid first so its own completed/canceled callback is ignored.
    const previous = a.twilioCallSid;
    a.twilioCallSid = null;
    if (previous !== null && a.status !== "failed") await this.hangupSid(a, previous);
    this.deps.log.info({ event: "alert.retry", alertId: a.id, previousSid: previous, cachedAudio: a.audio !== null }, "retry");
    return this.synthesizeAndDial(a);
  }

  /** POST /api/alerts/:id/ems-confirm */
  async emsConfirm(alertId: string, confirmed: boolean, actor = "dispatcher console"): Promise<ActionResult<AlertSummary>> {
    const a = await this.load(alertId);
    if (!a) return fail(404, "unknown_alert", `unknown alert ${alertId}`);
    this.action(a.callId, confirmed ? "ems_confirm" : "ems_unconfirm", actor, a.id);
    a.emsConfirmedAt = confirmed ? this.now().toISOString() : null;
    a.updatedAt = this.now().toISOString();
    this.deps.repo.patchAlert(a.id, { emsConfirmedAt: a.emsConfirmedAt }, a.updatedAt);
    this.broadcast(a);
    return { ok: true, value: toSummary(a) };
  }

  /** POST /api/alerts/test-briefing: canned TEST state on a fresh `replay` call labelled TEST. */
  async testBriefing(targetPhone: string): Promise<ActionResult<AlertSummary>> {
    if (!this.allowed(targetPhone)) return this.notAllowed(targetPhone);
    const limited = await this.callLimited(targetPhone);
    if (limited) return limited;
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
