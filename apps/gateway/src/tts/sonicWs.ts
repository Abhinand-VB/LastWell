// Q&A answers over the Sonic TTS WebSocket (docs/05 §8, G-18): one socket per briefing call, opened at
// stream start so the handshake is off the answer path; a fresh context_id per answer, continue:false,
// cancel on barge-in. Chunks are already base64 µ-law 8 kHz and go straight into Twilio media messages.
import WebSocket from "ws";
import { SonicWsEvent } from "@lastwell/core";
import { sonicRequestBody } from "./sonic.js";

export interface TtsStream {
  /** Resolves when the context is done (or cancelled); rejects on a vendor error. */
  speak(text: string, contextId: string, onChunk: (base64: string) => void): Promise<void>;
  cancel(contextId: string): void;
  close(): void;
}

export type TtsStreamFactory = () => TtsStream;

export interface SonicWsConfig {
  apiKey: string;
  cartesiaVersion: string;
  model: string;
  voiceId: string;
  baseUrl?: string;
}

interface Pending {
  onChunk: (b64: string) => void;
  resolve: () => void;
  reject: (e: Error) => void;
}

export class SonicWsStream implements TtsStream {
  private ws: WebSocket | null = null;
  private opening: Promise<WebSocket> | null = null;
  private contexts = new Map<string, Pending>();
  private closed = false;

  constructor(private readonly cfg: SonicWsConfig) {
    void this.socket().catch(() => {});
  }

  private socket(): Promise<WebSocket> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve(this.ws);
    if (this.opening) return this.opening;
    const url = `${this.cfg.baseUrl ?? "wss://api.cartesia.ai"}/tts/websocket?cartesia_version=${encodeURIComponent(this.cfg.cartesiaVersion)}`;
    this.opening = new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(url, { headers: { "X-API-Key": this.cfg.apiKey } });
      ws.on("open", () => {
        this.ws = ws;
        this.opening = null;
        resolve(ws);
      });
      ws.on("error", (err) => {
        this.opening = null;
        reject(err);
      });
      ws.on("message", (data) => this.onMessage(data.toString()));
      ws.on("close", () => {
        if (this.ws === ws) this.ws = null;
        for (const [id, p] of this.contexts) p.reject(new Error(`Sonic socket closed during ${id}`));
        this.contexts.clear();
      });
    });
    return this.opening;
  }

  private onMessage(raw: string): void {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return;
    }
    const parsed = SonicWsEvent.safeParse(json);
    if (!parsed.success) return;
    const ev = parsed.data;
    // docs/03 §13: a message without context_id belongs to the only open context.
    const id = ev.context_id ?? (this.contexts.size === 1 ? [...this.contexts.keys()][0] : undefined);
    const p = id === undefined ? undefined : this.contexts.get(id);
    if (!p || id === undefined) return;
    if (ev.type === "chunk") {
      p.onChunk(ev.data);
      if (ev.done) this.finish(id);
    } else if (ev.type === "done") {
      this.finish(id);
    } else if (ev.type === "error") {
      this.contexts.delete(id);
      p.reject(new Error(`Sonic error: ${ev.message ?? "unknown"}`));
    }
  }

  private finish(id: string): void {
    const p = this.contexts.get(id);
    this.contexts.delete(id);
    p?.resolve();
  }

  async speak(text: string, contextId: string, onChunk: (b64: string) => void): Promise<void> {
    if (this.closed) throw new Error("Sonic stream closed");
    let ws: WebSocket;
    try {
      ws = await this.socket();
    } catch {
      ws = await this.socket(); // reopen once (docs/05 §9)
    }
    return new Promise<void>((resolve, reject) => {
      this.contexts.set(contextId, { onChunk, resolve, reject });
      ws.send(JSON.stringify({ ...sonicRequestBody(this.cfg, text), context_id: contextId, continue: false }));
    });
  }

  cancel(contextId: string): void {
    const p = this.contexts.get(contextId);
    this.contexts.delete(contextId);
    p?.resolve();
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ context_id: contextId, cancel: true }));
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
    this.opening = null;
  }
}

/** Fake: 60 ms of µ-law silence per word, in 160 ms chunks, 20 ms apart. */
export class FakeTtsStream implements TtsStream {
  spoken: string[] = [];
  cancelled: string[] = [];
  private active = new Set<string>();

  async speak(text: string, contextId: string, onChunk: (b64: string) => void): Promise<void> {
    this.spoken.push(text);
    this.active.add(contextId);
    const words = text.split(/\s+/).filter(Boolean).length;
    const chunks = Math.max(1, Math.ceil((60 * words) / 160));
    for (let i = 0; i < chunks; i++) {
      if (!this.active.has(contextId)) return;
      onChunk(Buffer.alloc(1280, 0xff).toString("base64"));
      await new Promise((r) => setTimeout(r, 20));
    }
    this.active.delete(contextId);
  }

  cancel(contextId: string): void {
    if (this.active.delete(contextId)) this.cancelled.push(contextId);
  }

  close(): void {
    this.active.clear();
  }
}
