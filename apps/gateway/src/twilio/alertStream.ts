// WS /twilio/alert-media (docs/05 §8): the briefing, then (FEATURE_QA_ENABLED) the Q&A loop with
// barge-in; with Q&A off it hangs up after the `briefing` mark. Transport-agnostic: the real route and
// FakeTelephony both drive AlertStreamSession.
import type { Logger } from "pino";
import { TwilioMediaMessage } from "@lastwell/core";
import type { AlertRecord } from "../alerts/alertRegistry.js";
import type { AlertService } from "../alerts/approve.js";
import type { SttSession, SttSessionFactory } from "../stt/sessions.js";
import { briefingMessages, type TwilioOutMessage } from "../tts/audioChunks.js";
import type { TtsStream, TtsStreamFactory } from "../tts/sonicWs.js";
import { QA_FALLBACK } from "@lastwell/core";
import { classifyQa, isFragment, QA_CLOSING, QA_FILLERS, QA_NOT_MENTIONED, QA_SYSTEM, QA_UNCLEAR } from "../alerts/qaIntent.js";

export interface AlertStreamDeps {
  alerts: AlertService;
  log: Logger;
  expectedAccountSid: string;
  /** Q&A (V-08); unused when FEATURE_QA_ENABLED=false. */
  stt?: SttSessionFactory;
  ttsStream?: TtsStreamFactory;
  /** Hang up after this long without a question (docs/05 §8: 60 s). */
  qaIdleMs?: number;
  /** Speak a filler when the answer is not ready this long after the final (default 700). */
  fillerAfterMs?: number;
  /** How long a short fragment waits for the rest of the question (default 700). */
  fragmentHoldMs?: number;
}

type Answer = Awaited<ReturnType<AlertService["answerQuestion"]>>;
const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

type Phase = "briefing" | "qa" | "answering";

export class AlertStreamSession {
  private alert: AlertRecord | null = null;
  private streamSid: string | null = null;
  private ended = false;
  private phase: Phase = "briefing";
  private ink: SttSession | null = null;
  private tts: TtsStream | null = null;
  private answerSeq = 0;
  private currentContext: string | null = null;
  private lastInboundTs = 0;
  private idle: NodeJS.Timeout | null = null;
  private notMentioned = 0;
  private closing = false;
  /** Answer started on Ink's eager end-of-turn; reused when the final transcript matches. */
  private spec: { key: string; result: Promise<Answer> } | null = null;
  /** Filler audio (base64 µ-law chunks), synthesized once when Q&A opens. */
  private fillers: Array<string[] | null> = QA_FILLERS.map(() => null);
  private fillerIdx = 0;
  /** A short fragment held briefly in case the speaker continues after a pause (Ink split the turn). */
  private fragment: { text: string; timer: NodeJS.Timeout } | null = null;
  /** The held fragment, once the speaker continued: prefixed to the next final. */
  private prefix: string | null = null;

  constructor(
    private readonly deps: AlertStreamDeps,
    private readonly send: (m: TwilioOutMessage) => void,
    private readonly close: (code: number, reason: string) => void,
  ) {}

  handle(json: unknown): void {
    try {
      this.handleInner(json);
    } catch (err) {
      this.deps.log.error({ event: "alert_media.handler_error", alertId: this.alert?.id, err: err instanceof Error ? err.stack : String(err) }, "alert stream error");
    }
  }

  private handleInner(json: unknown): void {
    const parsed = TwilioMediaMessage.safeParse(json);
    if (!parsed.success) {
      this.deps.log.debug({ event: "alert_media.unknown", json }, "ignored message");
      return;
    }
    const msg = parsed.data;
    switch (msg.event) {
      case "start": {
        const alertId = msg.start.customParameters?.alertId;
        const alert = alertId ? this.deps.alerts.registry.get(alertId) : undefined;
        if (msg.start.accountSid !== this.deps.expectedAccountSid || !alert) {
          this.deps.log.warn({ event: "alert_media.rejected", alertId, accountSidOk: msg.start.accountSid === this.deps.expectedAccountSid }, "rejected stream");
          this.close(1008, "unknown alert");
          return;
        }
        this.alert = alert;
        this.streamSid = msg.streamSid;
        this.deps.alerts.onAnswered(alert);
        // Open the TTS socket now so its handshake is not on the answer path.
        if (this.qaOn) this.tts = this.deps.ttsStream!();
        this.playBriefing(alert, msg.streamSid);
        return;
      }
      case "mark":
        if (!this.alert) return;
        if (msg.mark.name === "briefing") {
          void this.deps.alerts.onBriefingPlayed(this.alert);
          if (this.qaOn) this.openQa(this.alert);
        } else if (msg.mark.name === `closing-${this.answerSeq}`) {
          void this.deps.alerts.hangupAlert(this.alert);
        } else if (msg.mark.name === `answer-${this.answerSeq}` && this.phase === "answering") {
          this.phase = "qa";
          this.armIdle();
        }
        return;
      case "media": {
        const ts = Number(msg.media.timestamp);
        if (Number.isFinite(ts)) this.lastInboundTs = ts;
        if (this.phase !== "briefing") this.ink?.sendAudio(Buffer.from(msg.media.payload, "base64"));
        return;
      }
      case "stop":
        this.end();
        return;
      default:
        return; // connected, dtmf
    }
  }

  private get qaOn(): boolean {
    return this.deps.alerts.qaEnabled && this.deps.stt !== undefined && this.deps.ttsStream !== undefined;
  }

  private openQa(alert: AlertRecord): void {
    this.phase = "qa";
    this.deps.alerts.onQaOpen(alert);
    const ink = this.deps.stt!({ speaker: "caller", encoding: "pcm_mulaw", sampleRate: 8000, profile: "qa", getTs: () => this.lastInboundTs });
    this.ink = ink;
    ink.on("final", (f) => this.onFinal(alert, f.text, f.sttMs, f.confidence));
    ink.on("eager", (e) => this.onEager(alert, e.text));
    ink.on("resume", () => {
      this.spec = null;
    });
    ink.on("turn.start", () => {
      if (this.fragment) {
        // The speaker went on: join the held fragment to what comes next.
        clearTimeout(this.fragment.timer);
        this.prefix = this.fragment.text;
        this.fragment = null;
      }
      this.bargeIn();
    });
    void this.cacheFillers();
    ink.on("error", (e) => this.deps.log.warn({ event: "qa.stt_error", alertId: alert.id, ...e }, "qa stt error"));
    this.armIdle();
  }

  private logError(err: unknown): void {
    this.deps.log.error({ event: "qa.error", alertId: this.alert?.id, err: err instanceof Error ? err.stack : String(err) }, "qa error");
  }

  /** The neurologist talks over an answer: empty Twilio's buffer and cancel the TTS context. */
  private bargeIn(): void {
    if (this.phase !== "answering" || this.streamSid === null) return;
    this.send({ event: "clear", streamSid: this.streamSid });
    if (this.currentContext) this.tts?.cancel(this.currentContext);
    this.deps.log.info({ event: "qa.barge_in", alertId: this.alert?.id, seq: this.answerSeq }, "barge-in");
    this.phase = "qa";
  }

  private armIdle(): void {
    if (this.idle) clearTimeout(this.idle);
    this.idle = setTimeout(() => {
      if (this.ended || this.phase === "answering" || !this.alert) return;
      this.deps.log.info({ event: "qa.idle_hangup", alertId: this.alert.id }, "no question: hanging up");
      void this.deps.alerts.hangupAlert(this.alert);
    }, this.deps.qaIdleMs ?? 60_000);
    this.idle.unref?.();
  }

  private onFinal(alert: AlertRecord, raw: string, eotMs: number, confidence?: number): void {
    const text = this.prefix === null ? raw : `${this.prefix} ${raw}`;
    this.prefix = null;
    const run = () => void this.onQuestion(alert, text, eotMs, confidence).catch((err: unknown) => this.logError(err));
    if (isFragment(text)) {
      const t = setTimeout(() => {
        this.fragment = null;
        run();
      }, this.deps.fragmentHoldMs ?? 700);
      t.unref?.();
      this.fragment = { text, timer: t };
      return;
    }
    run();
  }

  /** Synthesize the fillers once, off the answer path, so playing one costs no Sonic round trip. */
  private async cacheFillers(): Promise<void> {
    for (const [i, text] of QA_FILLERS.entries()) {
      const chunks: string[] = [];
      try {
        await this.tts?.speak(text, `filler-${i}`, (b64) => chunks.push(b64));
        if (chunks.length > 0) this.fillers[i] = chunks;
      } catch {
        // no filler for this phrase: answers simply start when ready
      }
    }
  }

  /** Ink's eager end-of-turn: start preparing the answer before the turn is final. */
  private onEager(alert: AlertRecord, text: string): void {
    if (this.ended || this.closing || classifyQa(text) !== "question") return;
    this.spec = { key: key(text), result: this.deps.alerts.answerQuestion(alert, text) };
  }

  /** Play a cached filler at once (alternating phrasings). Returns false when none is cached. */
  private playFiller(): boolean {
    const n = QA_FILLERS.length;
    for (let k = 0; k < n; k++) {
      const chunks = this.fillers[(this.fillerIdx + k) % n];
      if (!chunks) continue;
      this.fillerIdx = (this.fillerIdx + k + 1) % n;
      for (const b64 of chunks) this.send({ event: "media", streamSid: this.streamSid!, media: { payload: b64 } });
      return true;
    }
    return false;
  }

  private async onQuestion(alert: AlertRecord, question: string, eotMs: number | null = null, confidence?: number): Promise<void> {
    if (this.ended || this.streamSid === null || this.closing) return;
    // D-49: code sorts the utterance first; only real questions reach the Q&A model.
    const intent = classifyQa(question, confidence);
    this.deps.log.info({ event: "qa.intent", alertId: alert.id, intent }, "qa intent");
    if (intent === "ack") {
      if (this.phase === "qa") this.armIdle(); // say nothing, keep listening
      return;
    }
    if (this.phase === "answering") this.bargeIn();
    const turnEnd = Date.now();
    const seq = ++this.answerSeq;
    this.phase = "answering";
    if (this.idle) clearTimeout(this.idle);
    if (intent !== "question") {
      const line = intent === "closing" ? QA_CLOSING : intent === "system" ? QA_SYSTEM : QA_UNCLEAR;
      if (intent === "closing") this.closing = true;
      const spoken = await this.speak(alert, seq, line, turnEnd, null);
      if (intent === "closing") {
        if (spoken !== false) {
          // Hang up when Twilio echoes the closing mark; this timer covers a lost mark.
          setTimeout(() => void this.deps.alerts.hangupAlert(alert), 15_000).unref?.();
        } else {
          void this.deps.alerts.hangupAlert(alert);
        }
      }
      if (spoken !== false && seq === this.answerSeq && this.phase === "answering") {
        this.send({ event: "mark", streamSid: this.streamSid, mark: { name: `${intent === "closing" ? "closing" : "answer"}-${seq}` } });
      }
      return;
    }
    // Reuse the answer started on the eager end-of-turn when the final says the same thing.
    const spec = this.spec;
    this.spec = null;
    const speculative = spec !== null && spec.key === key(question);
    const prep = speculative ? spec.result : this.deps.alerts.answerQuestion(alert, question);
    // Not ready within ~700 ms (a model call): play a short filler so the line is not silent.
    let fillerMs: number | null = null;
    const ready = await Promise.race([prep.then(() => true), new Promise<false>((r) => setTimeout(() => r(false), this.deps.fillerAfterMs ?? 700).unref?.())]);
    if (!ready && seq === this.answerSeq && this.phase === "answering" && this.playFiller()) fillerMs = Date.now() - turnEnd;
    const raw = await prep;
    const prepMs = Date.now() - turnEnd;
    if (seq !== this.answerSeq || this.ended) return; // superseded by a newer question
    // "Not mentioned" rotates among fixed phrasings (D-49); it never adds a fact.
    const r = raw.answer === QA_FALLBACK ? { ...raw, answer: QA_NOT_MENTIONED[this.notMentioned++ % QA_NOT_MENTIONED.length]! } : raw;
    const speakAt = Date.now();
    const first = await this.speak(alert, seq, r.answer, turnEnd, r);
    if (first === false) return;
    // Per-turn breakdown (docs/01 §10): end-of-turn wait (Ink), prep (fast path or model), Sonic first audio.
    this.deps.log.info(
      {
        event: "qa.timing",
        alertId: alert.id,
        seq,
        path: r.path,
        speculative,
        eotMs: eotMs === null ? null : Math.round(eotMs),
        prepMs,
        modelMs: r.modelMs,
        ttsFirstMs: first === null ? null : turnEnd + first - speakAt,
        fillerMs,
        ms: first,
        heardMs: eotMs === null || first === null ? null : Math.round(eotMs) + (fillerMs ?? first),
      },
      "qa timing",
    );
    this.deps.alerts.recordQaTurn(alert, seq, question, r, first);
    if (seq === this.answerSeq && this.phase === "answering") this.send({ event: "mark", streamSid: this.streamSid, mark: { name: `answer-${seq}` } });
    else if (seq === this.answerSeq) this.armIdle();
  }

  /**
   * Speak one line on context a-{seq}. Returns the ms to the first audio (null if nothing was sent
   * because it was barged over), or false when Sonic failed (docs/05 §9: speak nothing, fresh socket).
   */
  private async speak(alert: AlertRecord, seq: number, text: string, turnEnd: number, r: { modelMs: number; known: boolean } | null): Promise<number | null | false> {
    const streamSid = this.streamSid!;
    const ctx = `a-${seq}`;
    this.currentContext = ctx;
    let first: number | null = null;
    try {
      // docs/05 §9: if the answer cannot start within 6 s, speak nothing.
      await Promise.race([
        this.tts!.speak(text, ctx, (b64) => {
          if (seq !== this.answerSeq || this.phase !== "answering") return;
          if (first === null) {
            first = Date.now() - turnEnd;
            this.deps.log.info({ event: "qa.answer", alertId: alert.id, seq, ms: first, ...(r ? { modelMs: r.modelMs, known: r.known } : { fixed: true }) }, "answer started");
          }
          this.send({ event: "media", streamSid, media: { payload: b64 } });
        }),
        new Promise((_, reject) => setTimeout(() => (first === null ? reject(new Error("answer did not start within 6 s")) : undefined), 6000).unref?.()),
      ]);
    } catch (err) {
      this.deps.log.warn({ event: "qa.tts_error", alertId: alert.id, seq, err: err instanceof Error ? err.message : String(err) }, "answer not spoken");
      this.tts?.cancel(ctx);
      this.tts?.close();
      this.tts = this.deps.ttsStream!(); // the next question gets a fresh socket
      if (seq === this.answerSeq) {
        this.phase = "qa";
        this.armIdle();
      }
      return false;
    }
    return first;
  }

  private playBriefing(alert: AlertRecord, streamSid: string): void {
    if (alert.audio !== null) {
      this.sendBriefing(alert, alert.audio, streamSid);
      return;
    }
    // Answered before Sonic finished (the call is dialled in parallel with synthesis): wait for it.
    void (alert.audioPending ?? Promise.resolve(null)).then((audio) => {
      if (this.ended) return;
      if (audio === null) {
        this.deps.log.error({ event: "alert_media.no_audio", alertId: alert.id }, "no briefing audio");
        this.deps.alerts.setStatus(alert, "failed", { lastError: "No briefing audio — call again", force: true });
        return;
      }
      this.sendBriefing(alert, audio, streamSid);
    });
  }

  private sendBriefing(alert: AlertRecord, audio: Buffer, streamSid: string): void {
    const msgs = briefingMessages(streamSid, audio);
    for (const m of msgs) this.send(m);
    this.deps.log.info(
      { event: "alert.briefing_sent", alertId: alert.id, messages: msgs.length, ms: alert.answeredAtMs === null ? null : Date.now() - alert.answeredAtMs },
      "briefing queued to Twilio",
    );
  }

  /** stop or socket close. */
  end(): void {
    if (this.ended) return;
    this.ended = true;
    if (this.idle) clearTimeout(this.idle);
    if (this.fragment) clearTimeout(this.fragment.timer);
    void this.ink?.close();
    this.tts?.close();
    if (this.alert) this.deps.alerts.onStreamEnded(this.alert);
  }

  get sid(): string | null {
    return this.streamSid;
  }
}
