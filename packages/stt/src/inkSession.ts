// One Cartesia Ink 2 streaming STT socket (docs/05 §4, §9). Reads no environment: the gateway, the
// eval runner and the spike script pass every option in.
import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { InkEvent, type Speaker } from "@lastwell/core";

export type InkEncoding = "pcm_mulaw" | "pcm_s16le";
export type InkProfile = "call" | "qa";

export interface InkSessionOptions {
  apiKey: string;
  cartesiaVersion: string;
  model: string;
  keyterms: readonly string[];
  /** Default wss://api.cartesia.ai; tests point it at an in-process server. */
  baseUrl?: string;
  speaker: Speaker;
  encoding: InkEncoding;
  sampleRate: 8000 | 16000;
  profile: InkProfile;
  /** Current track position in ms (Twilio media.timestamp, or bytes ÷ 32 in browser mode). */
  getTs: () => number;
  /** Reconnect once after an unexpected close (docs/05 §9). Default true. */
  reconnect?: boolean;
  reconnectDelayMs?: number;
  /** Max time close() waits for the server to drain. Default 2000. */
  closeTimeoutMs?: number;
}

export interface InkPartial {
  text: string;
  tStartMs: number;
}
export interface InkFinal {
  text: string;
  tStartMs: number;
  tEndMs: number;
  sttMs: number;
}
export interface InkError {
  message: string;
  statusCode: number | null;
}

export interface InkSessionEvents {
  partial: [InkPartial];
  final: [InkFinal];
  "turn.start": [{ tStartMs: number }];
  error: [InkError];
  /** Reconnected after one failure. */
  reconnected: [];
  /** Gave up: second failure or 401/403. The call continues without this track. */
  degraded: [InkError];
  closed: [];
}

const PROFILES: Record<InkProfile, { start: number; eager: number; end: number; timeoutMs: number }> = {
  call: { start: 0.8, eager: 0.6, end: 0.3, timeoutMs: 2400 },
  qa: { start: 0.8, eager: 0.5, end: 0.2, timeoutMs: 1600 },
};

/** Bytes buffered in the socket above which audio frames are dropped (docs/05 §3). */
export const BACKPRESSURE_BYTES = 64 * 1024;
/** Audio queued while the first connection opens; beyond this the oldest frames are dropped. */
const PENDING_MAX_BYTES = 64 * 1024;

export function inkUrl(o: Pick<InkSessionOptions, "baseUrl" | "model" | "encoding" | "sampleRate" | "cartesiaVersion" | "profile" | "keyterms">): string {
  const p = PROFILES[o.profile];
  const q = new URLSearchParams({
    model: o.model,
    encoding: o.encoding,
    sample_rate: String(o.sampleRate),
    cartesia_version: o.cartesiaVersion,
    turn_start_threshold: String(p.start),
    turn_eager_end_threshold: String(p.eager),
    turn_end_threshold: String(p.end),
    turn_end_timeout_ms: String(p.timeoutMs),
  });
  for (const k of o.keyterms) if (k.trim() !== "") q.append("keyterm", k.trim());
  const base = (o.baseUrl ?? "wss://api.cartesia.ai").replace(/\/$/, "");
  return `${base}/stt/turns/websocket?${q.toString()}`;
}

/** Silence for `ms` milliseconds in the session's encoding (µ-law 0xFF, PCM zeros). */
export function silence(encoding: InkEncoding, sampleRate: number, ms: number): Buffer {
  const samples = Math.round((sampleRate * ms) / 1000);
  return encoding === "pcm_mulaw" ? Buffer.alloc(samples, 0xff) : Buffer.alloc(samples * 2, 0);
}

export class InkSession extends EventEmitter<InkSessionEvents> {
  readonly speaker: Speaker;
  private readonly opts: InkSessionOptions;
  private ws: WebSocket | null = null;
  private open = false;
  private closing = false;
  private closedEmitted = false;
  private failures = 0;
  private degradedFlag = false;
  private pending: Buffer[] = [];
  private pendingBytes = 0;
  private everOpened = false;
  private turnStartTs: number | null = null;
  private lastText = "";
  private lastChangeWall = 0;
  private lastDropLog = 0;
  /** Frames dropped for backpressure (exposed for logs/tests). */
  droppedFrames = 0;

  constructor(opts: InkSessionOptions) {
    super();
    this.opts = opts;
    this.speaker = opts.speaker;
    // An "error" without a listener would throw; consumers add their own listeners on top.
    this.on("error", () => {});
    this.connect();
  }

  get degraded(): boolean {
    return this.degradedFlag;
  }

  get isOpen(): boolean {
    return this.open;
  }

  private connect(): void {
    const ws = new WebSocket(inkUrl(this.opts), { headers: { "X-API-Key": this.opts.apiKey } });
    this.ws = ws;
    ws.on("open", () => {
      if (this.ws !== ws) return;
      this.open = true;
      if (this.everOpened) this.emit("reconnected");
      this.everOpened = true;
      for (const b of this.pending) ws.send(b);
      this.pending = [];
      this.pendingBytes = 0;
    });
    ws.on("message", (data, isBinary) => {
      if (this.ws !== ws || isBinary) return;
      this.onMessage(data.toString());
    });
    ws.on("error", (err) => {
      if (this.ws !== ws) return;
      // A refused handshake surfaces as "Unexpected server response: 401".
      const m = /Unexpected server response: (\d{3})/.exec(err.message);
      const statusCode = m ? Number(m[1]) : null;
      this.emit("error", { message: err.message, statusCode });
      if (statusCode === 401 || statusCode === 403) this.markDegraded({ message: err.message, statusCode });
    });
    ws.on("close", () => {
      if (this.ws !== ws) return;
      this.open = false;
      this.ws = null;
      this.resetTurn();
      if (this.closing || this.degradedFlag) {
        this.emitClosed();
        return;
      }
      this.failures++;
      if (this.opts.reconnect !== false && this.failures === 1) {
        setTimeout(() => {
          if (!this.closing && !this.degradedFlag) this.connect();
          else this.emitClosed();
        }, this.opts.reconnectDelayMs ?? 500);
      } else {
        this.markDegraded({ message: "Ink socket closed again", statusCode: null });
        this.emitClosed();
      }
    });
  }

  private emitClosed(): void {
    if (this.closedEmitted) return;
    this.closedEmitted = true;
    this.emit("closed");
  }

  private markDegraded(e: InkError): void {
    if (this.degradedFlag) return;
    this.degradedFlag = true;
    this.pending = [];
    this.emit("degraded", e);
  }

  private resetTurn(): void {
    this.turnStartTs = null;
    this.lastText = "";
  }

  private onMessage(raw: string): void {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return;
    }
    const parsed = InkEvent.safeParse(json);
    if (!parsed.success) return; // unknown event types are ignored (docs/03 §13)
    const ev = parsed.data;
    switch (ev.type) {
      case "turn.start":
        this.turnStartTs = this.opts.getTs();
        this.lastText = "";
        this.lastChangeWall = Date.now();
        this.emit("turn.start", { tStartMs: this.turnStartTs });
        break;
      case "turn.update":
      case "turn.eager_end": {
        const text = ev.transcript.trim();
        if (this.turnStartTs === null) this.turnStartTs = this.opts.getTs();
        if (text !== this.lastText) {
          this.lastText = text;
          this.lastChangeWall = Date.now();
        }
        if (text !== "") this.emit("partial", { text, tStartMs: Math.round(this.turnStartTs) });
        break;
      }
      case "turn.end": {
        const text = ev.transcript.trim();
        const tStartMs = Math.round(this.turnStartTs ?? this.opts.getTs());
        if (text !== this.lastText) this.lastChangeWall = Date.now();
        const sttMs = Math.max(0, Date.now() - this.lastChangeWall);
        this.resetTurn();
        if (text === "") break;
        this.emit("final", { text, tStartMs, tEndMs: Math.max(tStartMs, Math.round(this.opts.getTs())), sttMs });
        break;
      }
      case "error": {
        const statusCode = ev.status_code ?? null;
        this.emit("error", { message: ev.message, statusCode });
        if (statusCode === 401 || statusCode === 403) {
          this.markDegraded({ message: ev.message, statusCode });
          this.ws?.terminate();
        }
        break;
      }
      default:
        break;
    }
  }

  /** Forward one binary audio frame. No-op when closed or degraded; drops under backpressure. */
  sendAudio(buf: Buffer): void {
    if (this.closing || this.degradedFlag) return;
    const ws = this.ws;
    if (ws === null || !this.open) {
      // Before the first open: queue so the opening words are not lost. During a reconnect gap: drop.
      if (this.everOpened) return;
      this.pending.push(buf);
      this.pendingBytes += buf.length;
      while (this.pendingBytes > PENDING_MAX_BYTES && this.pending.length > 0) {
        this.pendingBytes -= this.pending.shift()?.length ?? 0;
      }
      return;
    }
    if (ws.bufferedAmount > BACKPRESSURE_BYTES) {
      this.droppedFrames++;
      return;
    }
    ws.send(buf);
  }

  /** Synthetic silence (tests, and the Q&A loop while our own audio plays). */
  sendSilence(ms: number): void {
    this.sendAudio(silence(this.opts.encoding, this.opts.sampleRate, ms));
  }

  /** Sends {"type":"close"} and resolves when the server closes or after the timeout; remaining turn.end events are still emitted. */
  close(): Promise<void> {
    if (this.closing) return new Promise((r) => (this.closedEmitted ? r() : this.once("closed", () => r())));
    this.closing = true;
    const ws = this.ws;
    if (ws === null || !this.open) {
      ws?.terminate();
      this.emitClosed();
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        ws.terminate();
        this.emitClosed();
        resolve();
      }, this.opts.closeTimeoutMs ?? 2000);
      this.once("closed", () => {
        clearTimeout(timer);
        resolve();
      });
      try {
        ws.send(JSON.stringify({ type: "close" }));
      } catch {
        ws.terminate();
      }
    });
  }
}
