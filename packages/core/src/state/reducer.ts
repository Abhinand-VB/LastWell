// CaseState transitions (docs/03 §3, docs/05 §6, docs/06 §8). Pure: every function returns a new
// state. `publish` is the only place `version` and `updatedAt` change.
import { DateTime } from "luxon";
import type {
  CaseState,
  Confidence,
  Fact,
  ItemSource,
  LkwParseInput,
  LkwParseOutput,
  LkwResult,
  Sign,
  Utterance,
  Warning,
} from "../contracts/index.js";
import { guardLevel } from "../validate/levelGuard.js";
import type { ValidatedFact, ValidatedFastPass, ValidatedReasoner, ValidatedSign } from "../validate/outputs.js";
import { nextQuestion } from "./nextQuestion.js";

export interface ReducerConfig {
  /** LIKELY_MIN_DISTINCT_SIGNS (level guard). */
  likelyMinDistinctSigns: number;
  /** CALL_TIMEZONE (IANA). */
  timezone: string;
  /** ISO with offset: the zero point of every utterance's tStartMs (docs/05 §5). */
  streamStartedAt: string;
  /** The LKW parser (docs/06), injected so the reducer stays testable. */
  parseLkw: (input: LkwParseInput) => LkwParseOutput;
}

export interface ReduceResult {
  state: CaseState;
  /** A sign not seen before was added. */
  newSign: boolean;
  /** A last_known_well or blood_thinner fact was added or replaced. */
  newKeyFact: boolean;
}

const CONFIDENCE_RANK: Record<Confidence, number> = { unknown: 0, vague: 1, approx: 2, exact: 3 };

type SeqOf = (utteranceId: string) => number;

function seqLookup(utterances: readonly Utterance[]): SeqOf {
  const bySeq = new Map(utterances.map((u) => [u.id, u.seq]));
  return (id) => bySeq.get(id) ?? 0;
}

function addSigns(signs: readonly Sign[], incoming: readonly ValidatedSign[], source: ItemSource): { signs: Sign[]; added: boolean } {
  const out = [...signs];
  let added = false;
  for (const s of incoming) {
    if (out.some((x) => x.kind === s.kind && x.ref.utteranceId === s.ref.utteranceId)) continue;
    out.push({ kind: s.kind, ref: s.ref, source });
    added = true;
  }
  return { signs: out, added };
}

/** Replacement rule (docs/03 §3): later `seq` wins; equal seq → longer value; still tied → keep. */
function factWins(incoming: Fact, existing: Fact, seqOf: SeqOf): boolean {
  const a = seqOf(incoming.ref.utteranceId);
  const b = seqOf(existing.ref.utteranceId);
  if (a !== b) return a > b;
  return incoming.value.length > existing.value.length;
}

function sameSlot(a: Fact, b: Fact): boolean {
  if (a.kind !== b.kind) return false;
  // One fact per kind, except medication: one per distinct value.
  return a.kind !== "medication" || a.value.trim().toLowerCase() === b.value.trim().toLowerCase();
}

function mergeFacts(
  facts: readonly Fact[],
  incoming: readonly ValidatedFact[],
  source: ItemSource,
  seqOf: SeqOf,
): { facts: Fact[]; accepted: Fact[] } {
  const out = [...facts];
  const accepted: Fact[] = [];
  for (const v of incoming) {
    const f: Fact = { kind: v.kind, value: v.value, ref: v.ref, source };
    const i = out.findIndex((x) => sameSlot(x, f));
    if (i < 0) {
      out.push(f);
      accepted.push(f);
      continue;
    }
    const existing = out[i];
    if (existing !== undefined && factWins(f, existing, seqOf)) {
      out[i] = f;
      accepted.push(f);
    }
  }
  return { facts: out, accepted };
}

function parseFact(f: Fact, utterances: readonly Utterance[], cfg: ReducerConfig): LkwResult | null {
  const u = utterances.find((x) => x.id === f.ref.utteranceId);
  if (u === undefined) return null;
  const start = DateTime.fromISO(cfg.streamStartedAt, { setZone: true });
  if (!start.isValid) return null;
  const saidAt = start.plus({ milliseconds: u.tStartMs }).toISO();
  if (saidAt === null) return null;
  const parsed = cfg.parseLkw({ phrase: f.value, saidAt, timezone: cfg.timezone });
  return { ...parsed, ref: f.ref, minutesAgo: null };
}

/**
 * docs/06 §8 (D-17, D-23): a parsed result replaces the current one when it was said at the same
 * time or later; on equal seq the higher confidence wins. An `unknown` result never erases a
 * parsed one, and any parsed result replaces an `unknown` one.
 */
function lkwWins(incoming: LkwResult, existing: LkwResult | null, seqOf: SeqOf): boolean {
  if (existing === null) return true;
  const inUnknown = incoming.confidence === "unknown";
  const exUnknown = existing.confidence === "unknown";
  if (inUnknown && !exUnknown) return false;
  if (!inUnknown && exUnknown) return true;
  const a = seqOf(incoming.ref.utteranceId);
  const b = seqOf(existing.ref.utteranceId);
  if (a !== b) return a > b;
  return CONFIDENCE_RANK[incoming.confidence] > CONFIDENCE_RANK[existing.confidence];
}

/** Every validated LKW fact is parsed, whether or not it won the fact slot: `lkw` has its own rule. */
function mergeLkw(
  lkw: LkwResult | null,
  incoming: readonly ValidatedFact[],
  source: ItemSource,
  utterances: readonly Utterance[],
  cfg: ReducerConfig,
  seqOf: SeqOf,
): LkwResult | null {
  let current = lkw;
  for (const v of incoming) {
    if (v.kind !== "last_known_well") continue;
    const parsed = parseFact({ kind: v.kind, value: v.value, ref: v.ref, source }, utterances, cfg);
    if (parsed !== null && lkwWins(parsed, current, seqOf)) current = parsed;
  }
  return current;
}

/** Level guard + ladder; run after every transition. */
function finish(state: CaseState, cfg: ReducerConfig): CaseState {
  const level = guardLevel(state.signs, state.modelLevel, cfg.likelyMinDistinctSigns).level;
  const withLevel = { ...state, level };
  return { ...withLevel, nextQuestion: nextQuestion(withLevel) };
}

function merge(
  state: CaseState,
  signsIn: readonly ValidatedSign[],
  factsIn: readonly ValidatedFact[],
  source: ItemSource,
  utterances: readonly Utterance[],
  cfg: ReducerConfig,
): { state: CaseState; newSign: boolean; newKeyFact: boolean } {
  const seqOf = seqLookup(utterances);
  const { signs, added } = addSigns(state.signs, signsIn, source);
  const { facts, accepted } = mergeFacts(state.facts, factsIn, source, seqOf);
  const lkw = mergeLkw(state.lkw, factsIn, source, utterances, cfg, seqOf);
  return {
    state: { ...state, signs, facts, lkw },
    newSign: added,
    newKeyFact: lkw !== state.lkw || accepted.some((f) => f.kind === "last_known_well" || f.kind === "blood_thinner"),
  };
}

/** After a validated fast pass on one caller utterance. `ms` = the model call's latency. */
export function applyFastPass(
  state: CaseState,
  v: ValidatedFastPass,
  utterances: readonly Utterance[],
  cfg: ReducerConfig,
  ms: number | null = null,
): ReduceResult {
  const m = merge(state, v.signs, v.facts, "fast", utterances, cfg);
  const next: CaseState = {
    ...m.state,
    droppedCount: state.droppedCount + v.drops.length,
    latency: ms === null ? state.latency : { ...state.latency, fastPassMs: Math.round(ms) },
  };
  return { state: finish(next, cfg), newSign: m.newSign, newKeyFact: m.newKeyFact };
}

/** After a validated reasoner run over the whole transcript. */
export function applyReasoner(
  state: CaseState,
  v: ValidatedReasoner,
  utterances: readonly Utterance[],
  cfg: ReducerConfig,
  ms: number | null = null,
): ReduceResult {
  const m = merge(state, v.signs, v.facts, "reasoner", utterances, cfg);
  const next: CaseState = {
    ...m.state,
    modelLevel: v.modelLevel,
    lookalikes: v.lookalikes,
    summary: v.summary,
    reasonerQuestion: v.nextQuestion,
    droppedCount: state.droppedCount + v.drops.length,
    latency: ms === null ? state.latency : { ...state.latency, reasonerMs: Math.round(ms) },
  };
  return { state: finish(next, cfg), newSign: m.newSign, newKeyFact: m.newKeyFact };
}

export function addWarning(state: CaseState, w: Warning): CaseState {
  return state.warnings.includes(w) ? state : { ...state, warnings: [...state.warnings, w] };
}

export function removeWarning(state: CaseState, w: Warning): CaseState {
  return state.warnings.includes(w) ? { ...state, warnings: state.warnings.filter((x) => x !== w) } : state;
}

export function setSttLatency(state: CaseState, ms: number): CaseState {
  return { ...state, latency: { ...state.latency, sttMs: Math.round(ms) } };
}

/** docs/05 §6 publish(): version++ and updatedAt; the caller stores and broadcasts the result. */
export function publish(state: CaseState, now: Date | string): CaseState {
  const updatedAt = typeof now === "string" ? now : DateTime.fromJSDate(now).toISO();
  return { ...state, version: state.version + 1, updatedAt: updatedAt ?? state.updatedAt };
}
