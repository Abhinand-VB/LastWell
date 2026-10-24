// POST /api/calls/replay (docs/05 §13): an eval script fed through the live pipeline as a `replay`
// call. Turns arrive at atMs / speed with tStartMs = atMs / speed, tEndMs = tStartMs + 1500; the call
// ends 3 s after the last turn.
import { readFileSync } from "node:fs";
import path from "node:path";
import { EvalScript } from "@lastwell/core";
import type { CallService } from "./calls.js";
import type { LiveCall } from "./callRegistry.js";

export const REPLAY_END_AFTER_MS = 3000;

export class ReplayError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function loadReplayScript(dir: string, scriptId: string): EvalScript {
  if (!/^[A-E]\d{2}$/.test(scriptId)) throw new ReplayError(400, `bad script id ${scriptId}`);
  let raw: string;
  try {
    raw = readFileSync(path.join(dir, `${scriptId}.json`), "utf8");
  } catch {
    throw new ReplayError(404, `no script ${scriptId} in ${dir}`);
  }
  const parsed = EvalScript.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new ReplayError(400, `script ${scriptId} is invalid`);
  if (parsed.data.turns.length === 0) throw new ReplayError(400, `script ${scriptId} has no turns`);
  return parsed.data;
}

export function startReplay(calls: CallService, script: EvalScript, speed: number): LiveCall {
  const call = calls.create({ mode: "replay", label: script.id, streamStartedNow: true });
  const timers: NodeJS.Timeout[] = [];
  const stop = () => timers.forEach(clearTimeout);
  call.onEnd.push(stop);
  let lastAt = 0;
  for (const turn of script.turns) {
    const at = Math.round(turn.atMs / speed);
    lastAt = Math.max(lastAt, at);
    timers.push(
      setTimeout(() => {
        if (call.status !== "live") return;
        try {
          calls.addFinal(call, { speaker: turn.speaker, text: turn.text, tStartMs: at, tEndMs: at + 1500 });
        } catch (err) {
          calls.recordError(call, err);
        }
      }, at),
    );
  }
  timers.push(setTimeout(() => void calls.end(call), lastAt + REPLAY_END_AFTER_MS));
  return call;
}
