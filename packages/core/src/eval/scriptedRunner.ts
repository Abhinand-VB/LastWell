// Scripted runner (docs/07 §5, text mode): feeds an eval script's turns through the same pipeline as a
// live call (fast pass → validator → reducer → reasoner → validator → guard + ladder) on a virtual
// clock. No I/O except through the injected ModelClient, so the eval runner and the X-01a test share it.
import { DateTime } from "luxon";
import {
  initialCaseState,
  type CaseState,
  type EvalScript,
  type Level,
  type NextQuestion,
  type Utterance,
} from "../contracts/index.js";
import type { ModelClient } from "../claude/types.js";
import { parseLkw } from "../lkw/parser.js";
import { applyFastPass, applyReasoner, publish, type ReducerConfig } from "../state/reducer.js";
import { DEFAULT_LIKELY_MIN_DISTINCT_SIGNS } from "../validate/levelGuard.js";
import { validateFastPass, validateReasoner, type Drop } from "../validate/outputs.js";

export interface ScriptedRunOptions {
  /** CALL_TIMEZONE (IANA); the script's callStartLocal is a wall clock in this zone. */
  timezone: string;
  likelyMinDistinctSigns?: number;
  /** Reasoner cadence instead of the live 10 s timer (docs/07 §5: every third utterance). */
  reasonEveryUtterances?: number;
}

export interface TurnRecord {
  seq: number;
  atMs: number;
  speaker: Utterance["speaker"];
  level: Level;
  nextQuestion: NextQuestion | null;
}

export interface ModelCallRecord {
  pass: "fast" | "reasoner";
  seq: number;
  ms: number;
  /** null output (refusal / max_tokens / unparseable). */
  empty: boolean;
  error: string | null;
}

export interface ScriptedRunResult {
  scriptId: string;
  state: CaseState;
  utterances: Utterance[];
  turns: TurnRecord[];
  /** atMs of the turn after which the level first reached possible / likely. */
  firstAtMs: { possible: number | null; likely: number | null };
  calls: ModelCallRecord[];
  drops: Drop[];
  errors: number;
}

const LEVEL_RANK: Record<Level, number> = { none: 0, possible: 1, likely: 2 };

function uuid(prefix: number, n: number): string {
  return `${String(prefix).padStart(8, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

/** Stable per-script number for deterministic ids: "A01" → 101, "B12" → 212. */
function scriptNumber(id: string): number {
  return (id.charCodeAt(0) - 64) * 100 + Number(id.slice(1));
}

export async function runScript(script: EvalScript, model: ModelClient, opts: ScriptedRunOptions): Promise<ScriptedRunResult> {
  const tz = opts.timezone;
  const start = DateTime.fromISO(script.callStartLocal, { zone: tz });
  if (!start.isValid) throw new Error(`${script.id}: invalid callStartLocal ${script.callStartLocal}`);
  const streamStartedAt = start.toISO() ?? "";
  const cfg: ReducerConfig = {
    likelyMinDistinctSigns: opts.likelyMinDistinctSigns ?? DEFAULT_LIKELY_MIN_DISTINCT_SIGNS,
    timezone: tz,
    streamStartedAt,
    parseLkw,
  };
  const every = Math.max(1, opts.reasonEveryUtterances ?? 3);
  const n = scriptNumber(script.id);
  const callId = uuid(n, 0);

  let state = initialCaseState(callId, streamStartedAt);
  const utterances: Utterance[] = [];
  const turns: TurnRecord[] = [];
  const calls: ModelCallRecord[] = [];
  const drops: Drop[] = [];
  const firstAtMs: ScriptedRunResult["firstAtMs"] = { possible: null, likely: null };
  let errors = 0;

  const at = (atMs: number): Date => start.plus({ milliseconds: atMs }).toJSDate();

  async function reason(seq: number, atMs: number): Promise<void> {
    try {
      const r = await model.reason({ utterances, state, callStartedAt: at(0), now: at(atMs), timezone: tz });
      calls.push({ pass: "reasoner", seq, ms: r.ms, empty: r.output === null, error: null });
      if (r.output === null) return;
      const v = validateReasoner(r.output, utterances);
      drops.push(...v.drops);
      state = publish(applyReasoner(state, v, utterances, cfg, r.ms).state, at(atMs));
    } catch (e) {
      errors++;
      calls.push({ pass: "reasoner", seq, ms: 0, empty: true, error: e instanceof Error ? e.message : String(e) });
    }
  }

  for (const [i, turn] of script.turns.entries()) {
    const seq = i + 1;
    const next = script.turns[i + 1];
    const u: Utterance = {
      id: uuid(n, seq),
      callId,
      seq,
      speaker: turn.speaker,
      text: turn.text,
      tStartMs: turn.atMs,
      tEndMs: Math.max(turn.atMs, next === undefined ? turn.atMs + 2000 : next.atMs - 1),
    };
    utterances.push(u);

    let trigger = false;
    if (u.speaker !== "dispatcher") {
      const prev = utterances[utterances.length - 2];
      const prevDispatcherText = prev?.speaker === "dispatcher" ? prev.text : null;
      try {
        const r = await model.fastPass({ utteranceText: u.text, prevDispatcherText });
        calls.push({ pass: "fast", seq, ms: r.ms, empty: r.output === null, error: null });
        if (r.output !== null) {
          const v = validateFastPass(r.output, u);
          drops.push(...v.drops);
          const res = applyFastPass(state, v, utterances, cfg, r.ms);
          state = publish(res.state, at(turn.atMs));
          trigger = res.newSign || res.newKeyFact;
        }
      } catch (e) {
        errors++;
        calls.push({ pass: "fast", seq, ms: 0, empty: true, error: e instanceof Error ? e.message : String(e) });
      }
    }
    if (trigger || seq % every === 0) await reason(seq, turn.atMs);

    turns.push({ seq, atMs: turn.atMs, speaker: u.speaker, level: state.level, nextQuestion: state.nextQuestion });
    for (const lvl of ["possible", "likely"] as const) {
      if (firstAtMs[lvl] === null && LEVEL_RANK[state.level] >= LEVEL_RANK[lvl]) firstAtMs[lvl] = turn.atMs;
    }
  }

  // Once more when the call ends (docs/04 §3).
  const last = script.turns[script.turns.length - 1];
  if (last !== undefined) {
    await reason(script.turns.length, last.atMs);
    for (const lvl of ["possible", "likely"] as const) {
      if (firstAtMs[lvl] === null && LEVEL_RANK[state.level] >= LEVEL_RANK[lvl]) firstAtMs[lvl] = last.atMs;
    }
  }

  return { scriptId: script.id, state, utterances, turns, firstAtMs, calls, drops, errors };
}
