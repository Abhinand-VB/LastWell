// µ-law framing for Twilio bidirectional streams (docs/05 §8): raw bytes, base64, no headers (G-06).

/** 1280 bytes = 160 ms of µ-law 8 kHz. */
export const CHUNK_BYTES = 1280;

/** µ-law silence (0xFF) for `ms` milliseconds. */
export function mulawSilence(ms: number): Buffer {
  return Buffer.alloc(Math.round(ms * 8), 0xff);
}

export function sliceAudio(audio: Buffer, size = CHUNK_BYTES): Buffer[] {
  const out: Buffer[] = [];
  for (let off = 0; off < audio.length; off += size) out.push(audio.subarray(off, off + size));
  return out;
}

/** Playback duration of µ-law 8 kHz bytes in ms. */
export function mulawMs(bytes: number): number {
  return Math.round(bytes / 8);
}

export interface TwilioOutMessage {
  event: "media" | "mark" | "clear";
  streamSid: string;
  media?: { payload: string };
  mark?: { name: string };
}

/** The briefing as Twilio messages: 300 ms silence in one media message, the audio in 1280-byte media messages, then the mark. */
export function briefingMessages(streamSid: string, audio: Buffer, markName = "briefing"): TwilioOutMessage[] {
  const msgs: TwilioOutMessage[] = [{ event: "media", streamSid, media: { payload: mulawSilence(300).toString("base64") } }];
  for (const chunk of sliceAudio(audio)) msgs.push({ event: "media", streamSid, media: { payload: chunk.toString("base64") } });
  msgs.push({ event: "mark", streamSid, mark: { name: markName } });
  return msgs;
}
