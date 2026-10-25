// Stream two µ-law tracks to two Ink 2 sessions at real time (20 ms frames), exactly as the gateway does
// for a phone call (profile `call`, keyterms), and collect the finals on the call timeline.
import { InkSession, type InkSessionOptions } from "@lastwell/stt";
import type { Speaker } from "@lastwell/core";

export interface HeardTurn {
  speaker: Speaker;
  text: string;
  tStartMs: number;
  /** When the final arrived, ms after the stream started (what the live pipeline would see). */
  arrivedMs: number;
}

const FRAME_MS = 20;
const FRAME_BYTES = 160;

export async function transcribe(
  tracks: { caller: Buffer; dispatcher: Buffer; lengthMs: number },
  ink: Pick<InkSessionOptions, "apiKey" | "cartesiaVersion" | "model" | "keyterms">,
): Promise<{ heard: HeardTurn[]; degraded: string[] }> {
  const heard: HeardTurn[] = [];
  const degraded: string[] = [];
  let posMs = 0;
  const t0 = Date.now();
  const open = (speaker: Speaker): InkSession => {
    const s = new InkSession({ ...ink, speaker, encoding: "pcm_mulaw", sampleRate: 8000, profile: "call", getTs: () => posMs });
    s.on("final", (f) => heard.push({ speaker, text: f.text, tStartMs: f.tStartMs, arrivedMs: Date.now() - t0 }));
    s.on("degraded", (e) => degraded.push(`${speaker}: ${e.message}`));
    return s;
  };
  const sessions = { caller: open("caller"), dispatcher: open("dispatcher") };
  const frames = Math.ceil(tracks.lengthMs / FRAME_MS);
  for (let i = 0; i < frames; i++) {
    const off = i * FRAME_BYTES;
    sessions.caller.sendAudio(tracks.caller.subarray(off, off + FRAME_BYTES));
    sessions.dispatcher.sendAudio(tracks.dispatcher.subarray(off, off + FRAME_BYTES));
    posMs = (i + 1) * FRAME_MS;
    const wait = t0 + posMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  await Promise.all([sessions.caller.close(), sessions.dispatcher.close()]);
  heard.sort((a, b) => a.tStartMs - b.tStartMs);
  return { heard, degraded };
}
