// Lay a script's lines on one call timeline: each turn starts at its scripted atMs, or 250 ms after the
// previous line ends if the generated audio ran longer. Two tracks (caller, dispatcher) like Twilio's.
import type { EvalTurn } from "@lastwell/core";

export interface PlacedTurn {
  turn: EvalTurn;
  startMs: number;
  endMs: number;
}

export const GAP_MS = 250;

export function placeTurns(turns: readonly EvalTurn[], durationsMs: readonly number[]): PlacedTurn[] {
  const out: PlacedTurn[] = [];
  let prevEnd = 0;
  turns.forEach((turn, i) => {
    const startMs = Math.max(turn.atMs, i === 0 ? 0 : prevEnd + GAP_MS);
    const endMs = startMs + (durationsMs[i] ?? 0);
    out.push({ turn, startMs, endMs });
    prevEnd = endMs;
  });
  return out;
}

/** µ-law tracks (0xFF = silence), 8 bytes per ms, plus `tailMs` of silence so the last turn can close. */
export function buildTracks(placed: readonly PlacedTurn[], audio: readonly Buffer[], tailMs = 3000): { caller: Buffer; dispatcher: Buffer; lengthMs: number } {
  const lengthMs = (placed.at(-1)?.endMs ?? 0) + tailMs;
  const caller = Buffer.alloc(lengthMs * 8, 0xff);
  const dispatcher = Buffer.alloc(lengthMs * 8, 0xff);
  placed.forEach((p, i) => {
    const track = p.turn.speaker === "dispatcher" ? dispatcher : caller;
    audio[i]!.copy(track, p.startMs * 8);
  });
  return { caller, dispatcher, lengthMs };
}
