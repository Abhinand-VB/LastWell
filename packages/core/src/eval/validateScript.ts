// Schema + cross-field rules for eval scripts (docs/03 §14, docs/07 §3). Pure: callers read files.
import { DateTime } from "luxon";
import { EvalScript, type EvalScriptType, type SignKind } from "../contracts/index.js";

export type ScriptCheck = { ok: true; script: EvalScript } | { ok: false; errors: string[] };

const TYPE_BY_PREFIX: Record<string, EvalScriptType> = {
  A: "classic",
  B: "chameleon",
  C: "lookalike",
  D: "other",
  E: "hard_audio",
};

const FOCAL_SIGNS: readonly SignKind[] = ["face", "arms", "speech"];

const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

function isLocalDateTime(s: string): boolean {
  return LOCAL_DATETIME.test(s) && DateTime.fromISO(s, { zone: "UTC" }).isValid;
}

/**
 * Validate one script as stored on disk. A `hard_audio` script's turns and truth come from its
 * `sourceId` at load time (see loadScripts), so only its own fields are checked here.
 */
export function validateScript(data: unknown): ScriptCheck {
  const parsed = EvalScript.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  const s = parsed.data;
  const errors: string[] = [];

  const expectedType = TYPE_BY_PREFIX[s.id.charAt(0)];
  if (expectedType !== s.type) {
    errors.push(`type: id ${s.id} must have type "${expectedType}", got "${s.type}"`);
  }
  if (!isLocalDateTime(s.callStartLocal)) {
    errors.push(`callStartLocal: "${s.callStartLocal}" must be a local wall-clock time like 2026-10-25T14:47:00 (no offset)`);
  }

  if (s.type === "hard_audio") {
    if (s.sourceId === null) errors.push("sourceId: hard_audio scripts must name the script they re-read");
    if (s.audio === null) errors.push("audio: hard_audio scripts must have an audio file");
    if (s.turns.length > 0) errors.push("turns: hard_audio scripts keep turns empty (copied from sourceId at load)");
  } else {
    if (s.sourceId !== null) errors.push(`sourceId: only hard_audio scripts set sourceId (got "${s.sourceId}")`);
    errors.push(...checkTurns(s), ...checkTruth(s, s.type));
  }

  return errors.length === 0 ? { ok: true, script: s } : { ok: false, errors };
}

function checkTurns(s: EvalScript): string[] {
  const errors: string[] = [];
  if (s.turns.length === 0) errors.push("turns: at least one turn is required");
  let prev = -1;
  s.turns.forEach((t, i) => {
    if (t.atMs < 0) errors.push(`turns.${i}.atMs: must be ≥ 0`);
    if (t.atMs < prev) errors.push(`turns.${i}.atMs: ${t.atMs} is earlier than the previous turn (${prev})`);
    if (t.text.trim().length === 0) errors.push(`turns.${i}.text: must not be empty`);
    prev = t.atMs;
  });
  return errors;
}

/** Truth rules, checked against the type whose truth applies (the source's type for hard_audio). */
export function checkTruth(s: EvalScript, type: EvalScriptType): string[] {
  const errors: string[] = [];
  const t = s.truth;
  const kinds = new Set(t.signs);

  if (kinds.size !== t.signs.length) errors.push("truth.signs: duplicate sign kinds");

  const strokeType = type === "classic" || type === "chameleon";
  if (strokeType && !t.isStroke) errors.push(`truth.isStroke: ${type} scripts are strokes (true)`);
  if (!strokeType && t.isStroke) errors.push(`truth.isStroke: ${type} scripts are not strokes (false)`);

  // Consistency with the level guard (docs/03 §8) and D-21.
  if (t.expectedLevel === "likely") {
    if (kinds.size < 2) {
      errors.push(`truth.expectedLevel: "likely" needs ≥ 2 distinct sign kinds, got ${kinds.size} (${t.signs.join(", ") || "none"})`);
    }
    if (!t.signs.some((k) => FOCAL_SIGNS.includes(k))) {
      errors.push('truth.expectedLevel: "likely" needs one of face/arms/speech among the signs (D-21)');
    }
  } else if (t.expectedLevel === "possible") {
    if (kinds.size < 1) errors.push('truth.expectedLevel: "possible" needs ≥ 1 sign kind');
  } else if (kinds.size > 0) {
    errors.push(`truth.expectedLevel: "none" cannot have signs (the guard raises any quoted sign to possible)`);
  }

  if (type === "lookalike") {
    if (t.lookalike === null) errors.push("truth.lookalike: lookalike scripts must name the look-alike");
    if (t.expectedLevel === "likely") errors.push('truth.expectedLevel: lookalike scripts are at most "possible"');
  }
  if (type === "other" && t.expectedLevel !== "none") {
    errors.push('truth.expectedLevel: "other" scripts expect "none"');
  }

  if (t.lkw !== null && !isLocalDateTime(t.lkw.localTime)) {
    errors.push(`truth.lkw.localTime: "${t.lkw.localTime}" must be a local wall-clock time (no offset)`);
  }

  const thinnerFact = t.facts.find((f) => f.kind === "blood_thinner");
  if (thinnerFact && t.bloodThinner !== null && thinnerFact.value.toLowerCase() !== t.bloodThinner.toLowerCase()) {
    errors.push(`truth.facts: blood_thinner fact "${thinnerFact.value}" disagrees with truth.bloodThinner "${t.bloodThinner}"`);
  }
  if (thinnerFact && t.bloodThinner === null) {
    errors.push("truth.bloodThinner: set it when a blood_thinner fact is listed");
  }

  return errors;
}
