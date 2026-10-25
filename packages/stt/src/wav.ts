// WAV parsing and real-time pacing (G-11: Ink accepts audio at real-time pace only).

export interface Wav {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  /** Raw sample bytes (the `data` chunk), no header. */
  data: Buffer;
}

/** Parse a PCM WAV (RIFF/WAVE, format 1). Throws with a readable message on anything else. */
export function parseWav(buf: Buffer): Wav {
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("not a RIFF/WAVE file");
  }
  let off = 12;
  let fmt: Omit<Wav, "data"> | null = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === "fmt ") {
      const format = buf.readUInt16LE(body);
      if (format !== 1 && format !== 0xfffe) throw new Error(`unsupported WAV format ${format} (need PCM)`);
      fmt = { channels: buf.readUInt16LE(body + 2), sampleRate: buf.readUInt32LE(body + 4), bitsPerSample: buf.readUInt16LE(body + 14) };
    } else if (id === "data") {
      if (fmt === null) throw new Error("WAV data chunk before fmt chunk");
      return { ...fmt, data: buf.subarray(body, Math.min(buf.length, body + size)) };
    }
    off = body + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
}

/** Build a 16-bit PCM mono WAV (tests, recordings). */
export function buildWav(data: Buffer, sampleRate: number): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "ascii");
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8, "ascii");
  h.write("fmt ", 12, "ascii");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36, "ascii");
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

export interface PaceOptions {
  /** Bytes per millisecond of audio (16 kHz s16le mono = 32). */
  bytesPerMs: number;
  chunkMs?: number;
  /** 1 = real time (the only speed Ink accepts live); tests use more. */
  speed?: number;
  signal?: AbortSignal;
}

/** Send `data` in `chunkMs` chunks at real-time pace, correcting for timer drift. */
export async function paceChunks(data: Buffer, send: (chunk: Buffer, tMs: number) => void, o: PaceOptions): Promise<void> {
  const chunkMs = o.chunkMs ?? 20;
  const speed = o.speed ?? 1;
  const chunkBytes = Math.max(1, Math.round(o.bytesPerMs * chunkMs));
  const t0 = performance.now();
  for (let off = 0, i = 0; off < data.length; off += chunkBytes, i++) {
    if (o.signal?.aborted) return;
    send(data.subarray(off, off + chunkBytes), i * chunkMs);
    const due = t0 + ((i + 1) * chunkMs) / speed;
    const wait = due - performance.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
}
