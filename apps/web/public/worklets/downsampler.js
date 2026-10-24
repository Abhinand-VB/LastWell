// AudioWorklet for the browser-mic fallback (W-08, docs/05 §10): mono Float32 at `sampleRate` →
// 16 kHz pcm_s16le in 20 ms frames (320 samples = 640 bytes), posted to the main thread together
// with an RMS level. Same algorithm as apps/web/lib/pcm.ts (unit-tested there).
const TARGET_RATE = 16000;
const FRAME_SAMPLES = 320;

class Downsampler extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE;
    this.pos = 0;
    this.carry = new Float32Array(0);
    this.frame = new Int16Array(FRAME_SAMPLES);
    this.filled = 0;
    this.levelSum = 0;
    this.levelN = 0;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.levelSum += ch[i] * ch[i];
    }
    this.levelN += ch.length;

    let buf = ch;
    if (this.carry.length) {
      buf = new Float32Array(this.carry.length + ch.length);
      buf.set(this.carry, 0);
      buf.set(ch, this.carry.length);
    }
    let pos = this.pos;
    while (pos + this.ratio <= buf.length) {
      const start = Math.floor(pos);
      const end = Math.floor(pos + this.ratio);
      let sum = 0;
      for (let i = start; i < end; i++) sum += buf[i];
      let v = end > start ? sum / (end - start) : buf[start];
      v = Math.max(-1, Math.min(1, v));
      this.frame[this.filled++] = v < 0 ? Math.round(v * 0x8000) : Math.round(v * 0x7fff);
      if (this.filled === FRAME_SAMPLES) {
        const out = this.frame.buffer.slice(0);
        this.port.postMessage({ type: "frame", buffer: out }, [out]);
        this.filled = 0;
      }
      pos += this.ratio;
    }
    const keepFrom = Math.floor(pos);
    this.carry = buf.slice(keepFrom);
    this.pos = pos - keepFrom;

    // ~10 level updates per second
    if (this.levelN >= sampleRate / 10) {
      this.port.postMessage({ type: "level", rms: Math.sqrt(this.levelSum / this.levelN) });
      this.levelSum = 0;
      this.levelN = 0;
    }
    return true;
  }
}

registerProcessor("lw-downsampler", Downsampler);
