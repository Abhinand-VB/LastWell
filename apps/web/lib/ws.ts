// Reconnecting client for the gateway's /ws/ui (docs/03 §5). Fetches a short-lived token before
// every connect, authenticates, re-subscribes, and backs off on failure. Framework-free so it is
// unit-testable with a fake WebSocket.
import { UiServerMessage, type UiClientMessage } from "@lastwell/core";

export type SocketStatus = "connecting" | "live" | "down";

export interface WebSocketLike {
  readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface UiSocketOptions {
  url: string;
  getToken: () => Promise<string>;
  subscriptions: UiClientMessage[];
  onMessage: (msg: UiServerMessage) => void;
  onStatus: (status: SocketStatus) => void;
  createSocket?: (url: string) => WebSocketLike;
  /** Backoff schedule in ms; the last value repeats. */
  backoffMs?: number[];
  pingEveryMs?: number;
}

const OPEN = 1;
export const DEFAULT_BACKOFF_MS = [500, 1000, 2000, 4000, 8000];

export class UiSocket {
  private ws: WebSocketLike | null = null;
  private attempt = 0;
  private stopped = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private status: SocketStatus | null = null;

  constructor(private readonly opts: UiSocketOptions) {}

  start(): void {
    this.stopped = false;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      ws.close(1000, "client stop");
    }
  }

  private setStatus(s: SocketStatus): void {
    if (s === this.status) return;
    this.status = s;
    this.opts.onStatus(s);
  }

  private clearTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.retryTimer = null;
    this.pingTimer = null;
  }

  private send(msg: UiClientMessage): void {
    if (this.ws && this.ws.readyState === OPEN) this.ws.send(JSON.stringify(msg));
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    if (this.status !== "down") this.setStatus("connecting");
    let token: string;
    try {
      token = await this.opts.getToken();
    } catch {
      this.scheduleReconnect();
      return;
    }
    if (this.stopped) return;

    let ws: WebSocketLike;
    try {
      ws = this.opts.createSocket
        ? this.opts.createSocket(this.opts.url)
        : (new WebSocket(this.opts.url) as unknown as WebSocketLike);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => this.send({ type: "auth", token });
    ws.onmessage = (ev) => {
      if (typeof ev.data !== "string") return;
      let raw: unknown;
      try {
        raw = JSON.parse(ev.data);
      } catch {
        return;
      }
      const parsed = UiServerMessage.safeParse(raw);
      if (!parsed.success) return;
      const msg = parsed.data;
      if (msg.type === "auth.ok") {
        this.attempt = 0;
        for (const sub of this.opts.subscriptions) this.send(sub);
        this.setStatus("live");
        this.startPing();
        return;
      }
      if (msg.type === "error" && msg.code === "unauthorized") {
        ws.close(4001, "unauthorized");
        return;
      }
      if (msg.type === "pong") return;
      this.opts.onMessage(msg);
    };
    ws.onerror = () => {
      // onclose follows and handles the reconnect.
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.scheduleReconnect();
    };
  }

  private startPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    const every = this.opts.pingEveryMs ?? 20_000;
    this.pingTimer = setInterval(() => this.send({ type: "ping" }), every);
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.clearTimers();
    this.setStatus("down");
    const schedule = this.opts.backoffMs ?? DEFAULT_BACKOFF_MS;
    const delay = schedule[Math.min(this.attempt, schedule.length - 1)] ?? 1000;
    this.attempt += 1;
    this.retryTimer = setTimeout(() => void this.connect(), delay);
  }
}
