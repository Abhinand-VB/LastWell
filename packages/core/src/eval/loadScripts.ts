// Validate a set of eval scripts and expand hard_audio re-reads from their sourceId (docs/07 §3.5).
// Pure: the caller reads the files and passes their parsed JSON.
import type { EvalScript } from "../contracts/index.js";
import { checkTruth, validateScript } from "./validateScript.js";

export interface RawScript {
  /** File path (or any label) used in error messages; its basename must be `{id}.json`. */
  source: string;
  data: unknown;
}

export interface ScriptError {
  source: string;
  id: string | null;
  errors: string[];
}

export interface LoadedScripts {
  scripts: EvalScript[]; // valid scripts, hard_audio expanded, sorted by id
  errors: ScriptError[];
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function loadScripts(raw: readonly RawScript[]): LoadedScripts {
  const errors: ScriptError[] = [];
  const valid = new Map<string, { source: string; script: EvalScript }>();

  for (const r of raw) {
    const check = validateScript(r.data);
    if (!check.ok) {
      const id = typeof r.data === "object" && r.data !== null && "id" in r.data ? String(r.data.id) : null;
      errors.push({ source: r.source, id, errors: check.errors });
      continue;
    }
    const s = check.script;
    const fileErrors: string[] = [];
    if (basename(r.source).endsWith(".json") && basename(r.source) !== `${s.id}.json`) {
      fileErrors.push(`file name must be ${s.id}.json`);
    }
    const dup = valid.get(s.id);
    if (dup) fileErrors.push(`duplicate id ${s.id} (also in ${dup.source})`);
    if (fileErrors.length > 0) {
      errors.push({ source: r.source, id: s.id, errors: fileErrors });
      continue;
    }
    valid.set(s.id, { source: r.source, script: s });
  }

  const scripts: EvalScript[] = [];
  for (const { source, script } of valid.values()) {
    if (script.type !== "hard_audio") {
      scripts.push(script);
      continue;
    }
    const src = script.sourceId === null ? undefined : valid.get(script.sourceId)?.script;
    if (!src || src.type === "hard_audio") {
      errors.push({ source, id: script.id, errors: [`sourceId: ${script.sourceId} is not a valid A–D script in this set`] });
      continue;
    }
    const expanded: EvalScript = {
      ...script,
      callStartLocal: src.callStartLocal,
      turns: src.turns,
      truth: src.truth,
    };
    const truthErrors = checkTruth(expanded, src.type);
    if (truthErrors.length > 0) {
      errors.push({ source, id: script.id, errors: truthErrors });
      continue;
    }
    scripts.push(expanded);
  }

  scripts.sort((a, b) => a.id.localeCompare(b.id));
  return { scripts, errors };
}
