// Browser-mic fallback audio (docs/05 §10, W-08): Float32 at the AudioContext rate →
// 16 kHz mono pcm_s16le, cut into 20 ms frames of 320 samples (640 bytes).
// public/worklets/downsampler.js runs the same algorithm inside the AudioWorklet (a worklet cannot
// import modules from the app bundle); this copy is what the unit tests exercise.

export const TARGET_RATE = 16_000;
export const FRAME_SAMPLES = 320; // 20 ms at 16 kHz
export const FRAME_BYTES = FRAME_SAMPLES * 2;

export class Downsampler {
  private readonly ratio: number;
  private pos = 0; // fractional read position into the incoming stream
  private carry: number[] = [];
  private frame = new Int16Array(FRAME_SAMPLES);
  private filled = 0;

  constructor(inputRate: number) {
    if (inputRate < TARGET_RATE) throw new Error(`input rate ${inputRate} is below ${TARGET_RATE}`);
    this.ratio = inputRate / TARGET_RATE;
  }

  /** Feeds input samples; returns zero or more complete 640-byte frames. */
  push(input: Float32Array): ArrayBuffer[] {
    const out: ArrayBuffer[] = [];
    const buf = this.carry.length ? Float32Array.from([...this.carry, ...input]) : input;
    let pos = this.pos;
    // Average the input samples that fall into each output sample (box filter, good enough for speech).
    while (pos + this.ratio <= buf.length) {
      const start = Math.floor(pos);
      const end = Math.floor(pos + this.ratio);
      let sum = 0;
      for (let i = start; i < end; i++) sum += buf[i] ?? 0;
      const v = end > start ? sum / (end - start) : (buf[start] ?? 0);
      const clamped = Math.max(-1, Math.min(1, v));
      this.frame[this.filled++] = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
      if (this.filled === FRAME_SAMPLES) {
        out.push(this.frame.buffer.slice(0));
        this.filled = 0;
      }
      pos += this.ratio;
    }
    const keepFrom = Math.floor(pos);
    this.carry = Array.from(buf.subarray(keepFrom));
    this.pos = pos - keepFrom;
    return out;
  }
}

/** RMS of a block, 0..1, for the level meter. */
export function rms(input: Float32Array): number {
  if (input.length === 0) return 0;
  let s = 0;
  for (const v of input) s += v * v;
  return Math.sqrt(s / input.length);
}
