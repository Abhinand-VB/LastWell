import { describe, expect, it } from "vitest";
import { Downsampler, FRAME_BYTES, rms } from "./pcm";

function sine(rate: number, seconds: number, hz = 440, amp = 0.5): Float32Array {
  const n = Math.round(rate * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * hz * i) / rate);
  return out;
}

describe("Downsampler", () => {
  it("48 kHz → 50 frames of 640 bytes per second, regardless of block size", () => {
    const d = new Downsampler(48_000);
    const audio = sine(48_000, 1);
    const frames: ArrayBuffer[] = [];
    for (let i = 0; i < audio.length; i += 128) frames.push(...d.push(audio.subarray(i, i + 128)));
    expect(frames).toHaveLength(50);
    expect(frames.every((f) => f.byteLength === FRAME_BYTES)).toBe(true);
  });

  it("44.1 kHz (non-integer ratio) keeps real time within one frame", () => {
    const d = new Downsampler(44_100);
    const audio = sine(44_100, 2);
    let n = 0;
    for (let i = 0; i < audio.length; i += 128) n += d.push(audio.subarray(i, i + 128)).length;
    expect(Math.abs(n - 100)).toBeLessThanOrEqual(1);
  });

  it("preserves amplitude and clamps", () => {
    const d = new Downsampler(16_000);
    const frames = d.push(new Float32Array(320).fill(2));
    const pcm = new Int16Array(frames[0]!);
    expect(pcm[0]).toBe(32767);
    const d2 = new Downsampler(32_000);
    const pcm2 = new Int16Array(d2.push(new Float32Array(640).fill(-0.5))[0]!);
    expect(pcm2[10]).toBe(-16384);
  });

  it("rejects input rates below 16 kHz", () => {
    expect(() => new Downsampler(8000)).toThrow();
  });

  it("rms", () => {
    expect(rms(new Float32Array([0.5, -0.5]))).toBeCloseTo(0.5);
    expect(rms(new Float32Array())).toBe(0);
  });
});
