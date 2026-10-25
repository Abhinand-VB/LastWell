// SttSessionFactory (docs/10 §4): real = @lastwell/stt InkSession; fake = FakeSttSession, which accepts
// audio and discards it (text arrives through the dev injection route or a replay).
import { EventEmitter } from "node:events";
import type { Speaker } from "@lastwell/core";
import { InkSession, type InkEncoding, type InkProfile, type InkSessionEvents } from "@lastwell/stt";

export interface SttSession {
  readonly speaker: Speaker;
  readonly degraded: boolean;
  on<K extends keyof InkSessionEvents>(event: K, fn: (...args: InkSessionEvents[K]) => void): unknown;
  sendAudio(buf: Buffer): void;
  sendSilence(ms: number): void;
  close(): Promise<void>;
}

export interface SttSessionOptions {
  speaker: Speaker;
  encoding: InkEncoding;
  sampleRate: 8000 | 16000;
  profile: InkProfile;
  getTs: () => number;
}

export type SttSessionFactory = (o: SttSessionOptions) => SttSession;

export function inkFactory(cfg: { apiKey: string; cartesiaVersion: string; model: string; keyterms: readonly string[] }): SttSessionFactory {
  return (o) => new InkSession({ ...cfg, ...o });
}

export class FakeSttSession extends EventEmitter<InkSessionEvents> implements SttSession {
  readonly speaker: Speaker;
  readonly degraded = false;
  bytes = 0;
  closed = false;
  constructor(o: SttSessionOptions) {
    super();
    this.speaker = o.speaker;
    this.on("error", () => {});
  }
  sendAudio(buf: Buffer): void {
    if (!this.closed) this.bytes += buf.length;
  }
  sendSilence(): void {}
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.emit("closed");
  }
}

export const fakeSttFactory: SttSessionFactory = (o) => new FakeSttSession(o);
