// REST (docs/03 §6) and UI WebSocket (docs/03 §5) client. Every server message is parsed with the
// shared contract, so a shape drift on the gateway fails the e2e run.
import WebSocket from "ws";
import { UiServerMessage } from "@lastwell/core";
import { E2E_KEY } from "./gateway.js";

export class Pending extends Error {}

export interface HttpResult {
  status: number;
  body: unknown;
}

export class Rest {
  constructor(private readonly baseUrl: string) {}

  async req(method: string, path: string, body?: unknown): Promise<HttpResult> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { "x-internal-key": E2E_KEY, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      // keep text
    }
    return { status: res.status, body: parsed };
  }

  /** A route that is not there yet means its task has not landed: PENDING, not FAIL. */
  async need(method: string, path: string, body: unknown, task: string): Promise<HttpResult> {
    const r = await this.req(method, path, body);
    if (r.status === 404 && isRouteMissing(r.body)) throw new Pending(`${method} ${path} → 404 (${task} not landed)`);
    return r;
  }
}

// Fastify's own 404 for an unknown route, as opposed to our {error:{code:"not_found"}} for an unknown id.
function isRouteMissing(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return true;
  const b = body as Record<string, unknown>;
  return typeof b.message === "string" && /^Route .* not found$/.test(b.message);
}

export type ServerMsg = UiServerMessage;

export class UiSocket {
  readonly messages: ServerMsg[] = [];
  readonly violations: string[] = [];
  private ws!: WebSocket;
  private waiters: Array<() => void> = [];
  lastMessageAt = Date.now();

  static async open(wsUrl: string, token: string): Promise<UiSocket> {
    const s = new UiSocket();
    s.ws = new WebSocket(wsUrl);
    s.ws.on("message", (data) => s.onMessage(data.toString()));
    await new Promise<void>((resolve, reject) => {
      s.ws.once("open", () => resolve());
      s.ws.once("error", reject);
    });
    s.send({ type: "auth", token });
    await s.waitFor((m) => m.type === "auth.ok" || m.type === "error", 5000, "auth.ok");
    const err = s.messages.find((m) => m.type === "error");
    if (err) throw new Error(`ws auth failed: ${JSON.stringify(err)}`);
    return s;
  }

  send(msg: unknown): void {
    this.ws.send(JSON.stringify(msg));
  }

  private onMessage(raw: string): void {
    this.lastMessageAt = Date.now();
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      this.violations.push(`non-JSON frame: ${raw.slice(0, 120)}`);
      return;
    }
    const parsed = UiServerMessage.safeParse(json);
    if (!parsed.success) {
      this.violations.push(`contract violation (${(json as { type?: string }).type ?? "?"}): ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
      return;
    }
    this.messages.push(parsed.data);
    const w = this.waiters;
    this.waiters = [];
    for (const f of w) f();
  }

  /** Resolve with the first message (already received or future) matching pred. */
  async waitFor<T extends ServerMsg>(pred: (m: ServerMsg) => m is T, timeoutMs: number, what: string): Promise<T>;
  async waitFor(pred: (m: ServerMsg) => boolean, timeoutMs: number, what: string): Promise<ServerMsg>;
  async waitFor(pred: (m: ServerMsg) => boolean, timeoutMs: number, what: string): Promise<ServerMsg> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const hit = this.messages.find(pred);
      if (hit) return hit;
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`);
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, left);
        this.waiters.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  }

  /** Wait until no message has arrived for quietMs (the pipeline settled), at most maxMs. */
  async settle(quietMs = 600, maxMs = 8000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      if (Date.now() - this.lastMessageAt >= quietMs) return;
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  close(): void {
    this.ws.close();
  }
}
