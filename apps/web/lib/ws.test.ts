import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UiSocket, type SocketStatus, type WebSocketLike } from "./ws";
import { A01_STATE, CALL_ID } from "./testFixtures";

class FakeSocket implements WebSocketLike {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: unknown[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
    this.onclose?.({});
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  server(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe("UiSocket", () => {
  beforeEach(() => {
    FakeSocket.all = [];
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  });
  afterEach(() => vi.useRealTimers());

  function make() {
    const statuses: SocketStatus[] = [];
    const messages: unknown[] = [];
    let tokens = 0;
    const s = new UiSocket({
      url: "ws://gw/ws/ui",
      getToken: async () => `tok-${++tokens}`,
      subscriptions: [{ type: "subscribe", scope: "call", callId: CALL_ID }],
      onMessage: (m) => messages.push(m),
      onStatus: (st) => statuses.push(st),
      createSocket: (url) => new FakeSocket(url),
      backoffMs: [100, 200],
    });
    return { s, statuses, messages, tokens: () => tokens };
  }

  async function settle() {
    await vi.advanceTimersByTimeAsync(0);
    await flush();
  }

  it("authenticates with a token first, then subscribes, then goes live", async () => {
    const { s, statuses } = make();
    s.start();
    await settle();
    const ws = FakeSocket.all[0]!;
    ws.open();
    expect(ws.sent).toEqual([{ type: "auth", token: "tok-1" }]);
    ws.server({ type: "auth.ok" });
    expect(ws.sent[1]).toEqual({ type: "subscribe", scope: "call", callId: CALL_ID });
    expect(statuses).toEqual(["connecting", "live"]);
    s.stop();
  });

  it("forwards valid messages and ignores invalid ones", async () => {
    const { s, messages } = make();
    s.start();
    await settle();
    const ws = FakeSocket.all[0]!;
    ws.open();
    ws.server({ type: "auth.ok" });
    ws.server({ type: "state.updated", callId: CALL_ID, state: A01_STATE });
    ws.server({ type: "state.updated", callId: "nope" });
    ws.onmessage?.({ data: "not json" });
    expect(messages).toHaveLength(1);
    s.stop();
  });

  it("goes down on close, fetches a new token and reconnects with backoff", async () => {
    const { s, statuses, tokens } = make();
    s.start();
    await settle();
    FakeSocket.all[0]!.open();
    FakeSocket.all[0]!.server({ type: "auth.ok" });
    FakeSocket.all[0]!.close();
    expect(statuses.at(-1)).toBe("down");
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    expect(tokens()).toBe(2);
    const ws2 = FakeSocket.all[1]!;
    ws2.open();
    expect(ws2.sent[0]).toEqual({ type: "auth", token: "tok-2" });
    ws2.server({ type: "auth.ok" });
    expect(statuses.at(-1)).toBe("live");
    s.stop();
  });

  it("retries when the token request fails (gateway down)", async () => {
    let calls = 0;
    const statuses: SocketStatus[] = [];
    const s = new UiSocket({
      url: "ws://gw/ws/ui",
      getToken: async () => {
        calls += 1;
        throw new Error("502");
      },
      subscriptions: [],
      onMessage: () => {},
      onStatus: (st) => statuses.push(st),
      createSocket: (url) => new FakeSocket(url),
      backoffMs: [100],
    });
    s.start();
    await settle();
    expect(statuses).toEqual(["connecting", "down"]);
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    expect(calls).toBe(2);
    expect(FakeSocket.all).toHaveLength(0);
    s.stop();
  });

  it("stop() closes without reconnecting", async () => {
    const { s } = make();
    s.start();
    await settle();
    FakeSocket.all[0]!.open();
    s.stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeSocket.all).toHaveLength(1);
  });
});
