// /ws/ui (docs/03 §5): auth with a token first, then subscribe to a call and/or the board.
// The hub is transport-agnostic: it takes anything with send/close so tests need no server.
import type { Logger } from "pino";
import { UiClientMessage, type AlertSummary, type CallSnapshot, type UiServerMessage } from "@lastwell/core";
import type { TokenStore } from "./tokens.js";

export interface HubSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readonly readyState: number;
}

interface Client {
  socket: HubSocket;
  authed: boolean;
  calls: Set<string>;
  board: boolean;
}

export interface HubDeps {
  tokens: TokenStore;
  log: Logger;
  snapshot: (callId: string) => Promise<CallSnapshot | null>;
  boardAlerts: () => Promise<AlertSummary[]>;
}

const OPEN = 1;

export class UiHub {
  private clients = new Set<Client>();
  constructor(private readonly deps: HubDeps) {}

  get size(): number {
    return this.clients.size;
  }

  /** Register a socket; returns the handlers the transport calls. */
  attach(socket: HubSocket): { onMessage: (raw: string) => void; onClose: () => void } {
    const client: Client = { socket, authed: false, calls: new Set(), board: false };
    this.clients.add(client);
    return {
      onMessage: (raw) => {
        this.handle(client, raw).catch((err: unknown) =>
          this.deps.log.error({ event: "ui.handler_error", err: err instanceof Error ? err.stack : String(err) }, "ui handler error"),
        );
      },
      onClose: () => {
        this.clients.delete(client);
      },
    };
  }

  private send(c: Client, msg: UiServerMessage): void {
    if (c.socket.readyState !== OPEN) return;
    try {
      c.socket.send(JSON.stringify(msg));
    } catch {
      // a dead socket is removed on close
    }
  }

  private async handle(c: Client, raw: string): Promise<void> {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      this.send(c, { type: "error", code: "bad_message", message: "not JSON" });
      return;
    }
    const parsed = UiClientMessage.safeParse(json);
    if (!parsed.success) {
      this.send(c, { type: "error", code: "bad_message", message: "unknown message shape" });
      return;
    }
    const msg = parsed.data;
    if (msg.type === "auth") {
      if (this.deps.tokens.valid(msg.token)) {
        c.authed = true;
        this.send(c, { type: "auth.ok" });
      } else {
        this.send(c, { type: "error", code: "unauthorized", message: "invalid or expired token" });
        c.socket.close(4401, "unauthorized");
      }
      return;
    }
    if (!c.authed) {
      this.send(c, { type: "error", code: "unauthorized", message: "send {type:\"auth\", token} first" });
      return;
    }
    switch (msg.type) {
      case "ping":
        this.send(c, { type: "pong" });
        return;
      case "subscribe":
        if (msg.scope === "board") {
          c.board = true;
          this.send(c, { type: "board.snapshot", alerts: await this.deps.boardAlerts() });
          return;
        }
        if ("callId" in msg) {
          const snap = await this.deps.snapshot(msg.callId);
          if (snap === null) {
            this.send(c, { type: "error", code: "unknown_call", message: `unknown call ${msg.callId}` });
            return;
          }
          c.calls.add(msg.callId);
          this.send(c, { type: "snapshot", ...snap });
        }
        return;
      case "unsubscribe":
        if (msg.scope === "board") c.board = false;
        else if (msg.callId !== undefined) c.calls.delete(msg.callId);
        else c.calls.clear();
        return;
    }
  }

  /** To every socket subscribed to the call. */
  toCall(callId: string, msg: UiServerMessage): void {
    for (const c of this.clients) if (c.authed && c.calls.has(callId)) this.send(c, msg);
  }

  /** To every socket subscribed to the call or to the board (once per socket): alert.updated. */
  toCallAndBoard(callId: string, msg: UiServerMessage): void {
    for (const c of this.clients) if (c.authed && (c.board || c.calls.has(callId))) this.send(c, msg);
  }

  /** To every authenticated socket: alert.removed. */
  toAll(msg: UiServerMessage): void {
    for (const c of this.clients) if (c.authed) this.send(c, msg);
  }
}
