import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import type { AddressInfo } from "node:net";
import type { IncomingMessage } from "node:http";
import { InkSession, inkUrl, silence, type InkFinal, type InkSessionOptions } from "./inkSession.js";
import { buildWav, paceChunks, parseWav } from "./wav.js";

interface Conn {
  ws: WebSocket;
  req: IncomingMessage;
  audio: Buffer[];
  text: string[];
}

let wss: WebSocketServer;
let conns: Conn[];
let baseUrl: string;
let onConn: (c: Conn) => void;

beforeEach(async () => {
  conns = [];
  onConn = () => {};
  wss = new WebSocketServer({ port: 0 });
  wss.on("connection", (ws, req) => {
    const c: Conn = { ws, req, audio: [], text: [] };
    conns.push(c);
    ws.on("message", (data, isBinary) => {
      if (isBinary) c.audio.push(data as Buffer);
      else c.text.push(data.toString());
    });
    onConn(c);
  });
  await new Promise<void>((r) => wss.once("listening", () => r()));
  baseUrl = `ws://127.0.0.1:${(wss.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const c of conns) c.ws.terminate();
  await new Promise<void>((r) => wss.close(() => r()));
});

function opts(over: Partial<InkSessionOptions> = {}): InkSessionOptions {
  return {
    apiKey: "test-key",
    cartesiaVersion: "2026-08-14",
    model: "ink-2",
    keyterms: ["Eliquis", "warfarin"],
    baseUrl,
    speaker: "caller",
    encoding: "pcm_mulaw",
    sampleRate: 8000,
    profile: "call",
    getTs: () => 0,
    reconnectDelayMs: 20,
    closeTimeoutMs: 300,
    ...over,
  };
}

const until = async (cond: () => boolean, ms = 2000): Promise<void> => {
  const t = Date.now();
  while (!cond()) {
    if (Date.now() - t > ms) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
};

const send = (c: Conn, ev: object): void => c.ws.send(JSON.stringify(ev));

describe("inkUrl", () => {
  it("builds the docs/05 §4 URL with the call profile and one keyterm param per term", () => {
    const u = new URL(inkUrl({ ...opts(), baseUrl: undefined, keyterms: ["Eliquis", " tPA ", ""] }));
    expect(u.origin + u.pathname).toBe("wss://api.cartesia.ai/stt/turns/websocket");
    expect(u.searchParams.get("model")).toBe("ink-2");
    expect(u.searchParams.get("encoding")).toBe("pcm_mulaw");
    expect(u.searchParams.get("sample_rate")).toBe("8000");
    expect(u.searchParams.get("cartesia_version")).toBe("2026-08-14");
    expect(u.searchParams.get("turn_start_threshold")).toBe("0.8");
    expect(u.searchParams.get("turn_eager_end_threshold")).toBe("0.6");
    expect(u.searchParams.get("turn_end_threshold")).toBe("0.3");
    expect(u.searchParams.get("turn_end_timeout_ms")).toBe("2400");
    expect(u.searchParams.getAll("keyterm")).toEqual(["Eliquis", "tPA"]);
  });

  it("uses the qa profile thresholds", () => {
    const u = new URL(inkUrl({ ...opts(), profile: "qa" }));
    expect(u.searchParams.get("turn_eager_end_threshold")).toBe("0.5");
    expect(u.searchParams.get("turn_end_threshold")).toBe("0.2");
    expect(u.searchParams.get("turn_end_timeout_ms")).toBe("1600");
  });
});

describe("InkSession against a mock Ink server", () => {
  it("sends the API key header, forwards audio (queued before open) as binary frames", async () => {
    const s = new InkSession(opts());
    s.sendAudio(Buffer.from([1, 2, 3]));
    await until(() => conns.length === 1 && conns[0]!.audio.length === 1);
    s.sendAudio(Buffer.from([4, 5]));
    await until(() => conns[0]!.audio.length === 2);
    expect(conns[0]!.req.headers["x-api-key"]).toBe("test-key");
    expect(conns[0]!.audio.map((b) => [...b])).toEqual([[1, 2, 3], [4, 5]]);
    await s.close();
  });

  it("maps turn.start/update/eager_end/end to partial and final with track timestamps", async () => {
    let ts = 1000;
    const s = new InkSession(opts({ getTs: () => ts }));
    const partials: { text: string; tStartMs: number }[] = [];
    const finals: InkFinal[] = [];
    s.on("partial", (p) => partials.push(p));
    s.on("final", (f) => finals.push(f));
    await until(() => conns.length === 1 && s.isOpen);
    const c = conns[0]!;
    send(c, { type: "connected", request_id: "r1" });
    send(c, { type: "turn.start" });
    await new Promise((r) => setTimeout(r, 20));
    ts = 1800;
    send(c, { type: "turn.update", transcript: "He can't" });
    send(c, { type: "turn.update", transcript: "He can't lift his coffee cup" });
    send(c, { type: "turn.eager_end", transcript: "He can't lift his coffee cup" });
    send(c, { type: "turn.resume" });
    send(c, { type: "some.future.event" });
    await until(() => partials.length === 3);
    ts = 3200;
    send(c, { type: "turn.end", transcript: " He can't lift his coffee cup. " });
    await until(() => finals.length === 1);
    expect(partials.map((p) => p.text)).toEqual(["He can't", "He can't lift his coffee cup", "He can't lift his coffee cup"]);
    expect(partials.every((p) => p.tStartMs === 1000)).toBe(true);
    expect(finals[0]).toMatchObject({ text: "He can't lift his coffee cup.", tStartMs: 1000, tEndMs: 3200 });
    expect(finals[0]!.sttMs).toBeGreaterThanOrEqual(0);
    await s.close();
  });

  it("ignores empty turn.end transcripts and keeps finals separate (never concatenates)", async () => {
    const s = new InkSession(opts());
    const finals: string[] = [];
    s.on("final", (f) => finals.push(f.text));
    await until(() => s.isOpen);
    const c = conns[0]!;
    send(c, { type: "turn.start" });
    send(c, { type: "turn.end", transcript: "   " });
    send(c, { type: "turn.start" });
    send(c, { type: "turn.update", transcript: "My father" });
    send(c, { type: "turn.end", transcript: "My father" });
    send(c, { type: "turn.start" });
    send(c, { type: "turn.end", transcript: "he takes Eliquis" });
    await until(() => finals.length === 2);
    expect(finals).toEqual(["My father", "he takes Eliquis"]);
    await s.close();
  });

  it('close() sends {"type":"close"} and still emits the drained last turn', async () => {
    onConn = (c) =>
      c.ws.on("message", (d, bin) => {
        if (!bin && d.toString().includes('"close"')) {
          send(c, { type: "turn.end", transcript: "last words" });
          setTimeout(() => c.ws.close(1000), 10);
        }
      });
    const s = new InkSession(opts());
    const finals: string[] = [];
    let closed = 0;
    s.on("final", (f) => finals.push(f.text));
    s.on("closed", () => closed++);
    await until(() => s.isOpen);
    await s.close();
    expect(conns[0]!.text).toContain(JSON.stringify({ type: "close" }));
    expect(finals).toEqual(["last words"]);
    expect(closed).toBe(1);
    s.sendAudio(Buffer.from([1])); // no-op after close
  });

  it("close() resolves after the timeout when the server never closes", async () => {
    const s = new InkSession(opts({ closeTimeoutMs: 100 }));
    await until(() => s.isOpen);
    const t = Date.now();
    await s.close();
    expect(Date.now() - t).toBeGreaterThanOrEqual(90);
  });

  it("reconnects once after an unexpected close, then degrades on the second", async () => {
    const s = new InkSession(opts());
    let reconnected = 0;
    const degraded: unknown[] = [];
    s.on("reconnected", () => reconnected++);
    s.on("degraded", (e) => degraded.push(e));
    await until(() => s.isOpen);
    conns[0]!.ws.terminate();
    await until(() => conns.length === 2 && s.isOpen);
    expect(reconnected).toBe(1);
    s.sendAudio(Buffer.from([9]));
    await until(() => conns[1]!.audio.length === 1);
    conns[1]!.ws.terminate();
    await until(() => degraded.length === 1);
    expect(s.degraded).toBe(true);
    await new Promise((r) => setTimeout(r, 60));
    expect(conns.length).toBe(2);
  });

  it("degrades immediately on an Ink error with status 401", async () => {
    const s = new InkSession(opts());
    const errors: unknown[] = [];
    const degraded: unknown[] = [];
    s.on("error", (e) => errors.push(e));
    s.on("degraded", (e) => degraded.push(e));
    await until(() => s.isOpen);
    send(conns[0]!, { type: "error", status_code: 401, message: "invalid api key" });
    await until(() => degraded.length === 1);
    expect(errors[0]).toEqual({ message: "invalid api key", statusCode: 401 });
    await new Promise((r) => setTimeout(r, 60));
    expect(conns.length).toBe(1);
  });

  it("does not throw when nobody listens for errors (unreachable host)", async () => {
    const s = new InkSession(opts({ baseUrl: "ws://127.0.0.1:1", reconnect: false }));
    await until(() => s.degraded);
  });
});

describe("silence and wav", () => {
  it("µ-law silence is 0xFF, PCM silence is zeros", () => {
    expect([...silence("pcm_mulaw", 8000, 1)]).toEqual(Array(8).fill(0xff));
    expect(silence("pcm_s16le", 16000, 20).length).toBe(640);
    expect(silence("pcm_s16le", 16000, 20).every((b) => b === 0)).toBe(true);
  });

  it("parses a WAV it built and paces chunks", async () => {
    const data = Buffer.alloc(32 * 100, 7); // 100 ms at 16 kHz s16le
    const wav = parseWav(buildWav(data, 16000));
    expect(wav).toMatchObject({ sampleRate: 16000, channels: 1, bitsPerSample: 16 });
    expect(wav.data.equals(data)).toBe(true);
    const sizes: number[] = [];
    const t = Date.now();
    await paceChunks(wav.data, (c) => sizes.push(c.length), { bytesPerMs: 32, chunkMs: 20 });
    expect(sizes).toEqual([640, 640, 640, 640, 640]);
    expect(Date.now() - t).toBeGreaterThanOrEqual(90);
    expect(() => parseWav(Buffer.from("nope"))).toThrow(/RIFF/);
  });
});
