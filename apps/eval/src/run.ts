// `pnpm --filter @lastwell/eval eval --mode text [--ids A01,B01] [--model live|fake] [--out results]`
// Text mode (docs/07 §5): every script through the core pipeline on a virtual clock, scored against
// its truth and against the keyword baseline. Audio mode is deferred (D-33).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createClaudeClient,
  createFakeModel,
  loadScripts,
  runScript,
  type EvalScript,
  type ModelClient,
  type ScriptedRunResult,
} from "@lastwell/core";
import { loadEnv, requireApiKey, type EvalEnv } from "./env.js";
import { perScriptTable, summaryTable } from "./report.js";
import { scoreScript, summarize, type ScriptRecord } from "./score.js";
import { USAGE } from "./usage.js";

export interface RunArgs {
  mode: "text" | "audio";
  ids: string[] | null;
  model: "live" | "fake";
  out: string;
  scriptsDir: string;
}

const EVAL_DIR = fileURLToPath(new URL("..", import.meta.url));

export function parseArgs(argv: readonly string[]): RunArgs {
  const args = argv.filter((a) => a !== "--"); // pnpm may forward a literal "--"
  const get = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
  };
  const mode = get("--mode");
  if (mode !== "text" && mode !== "audio") throw new Error(`--mode text|audio is required\n\n${USAGE}`);
  const model = get("--model") ?? "live";
  if (model !== "live" && model !== "fake") throw new Error(`--model must be live or fake`);
  const ids = get("--ids");
  return {
    mode,
    model,
    ids: ids === undefined ? null : ids.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
    out: resolve(get("--out") ?? join(EVAL_DIR, "results")),
    scriptsDir: resolve(get("--scripts") ?? join(EVAL_DIR, "scripts")),
  };
}

export function readScripts(dir: string): EvalScript[] {
  const raw = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ source: join(dir, f), data: JSON.parse(readFileSync(join(dir, f), "utf8")) as unknown }));
  const { scripts, errors } = loadScripts(raw);
  for (const e of errors) console.error(`skipping invalid script ${e.source}: ${e.errors.join("; ")}`);
  return scripts;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function isRateLimit(e: unknown): boolean {
  return typeof e === "object" && e !== null && "status" in e && (e as { status: unknown }).status === 429;
}

/** G-28: the SDK retries once; on a further 429 the runner backs off 10 s and tries once more. */
export function withBackoff(model: ModelClient, backoffMs = 10_000): ModelClient {
  async function call<T>(f: () => Promise<T>): Promise<T> {
    try {
      return await f();
    } catch (e) {
      if (!isRateLimit(e)) throw e;
      await sleep(backoffMs);
      return f();
    }
  }
  return {
    fastPass: (i) => call(() => model.fastPass(i)),
    reason: (i) => call(() => model.reason(i)),
    answer: (i) => call(() => model.answer(i)),
  };
}

export function makeModel(kind: RunArgs["model"], env: EvalEnv): ModelClient {
  if (kind === "fake") return createFakeModel();
  requireApiKey(env);
  return withBackoff(
    createClaudeClient({
      fastModel: env.CLAUDE_FAST_MODEL,
      reasonerModel: env.CLAUDE_REASONER_MODEL,
      qaModel: env.CLAUDE_QA_MODEL,
      fastEffort: env.CLAUDE_FAST_EFFORT,
      reasonerEffort: env.CLAUDE_REASONER_EFFORT,
    }),
  );
}

async function pool<T, R>(items: readonly T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      for (let i = next++; i < items.length; i = next++) out[i] = await f(items[i] as T);
    }),
  );
  return out;
}

export interface EvalRun {
  records: ScriptRecord[];
  results: ScriptedRunResult[];
  markdown: string;
  outFile: string | null;
}

export async function runEval(args: RunArgs, env: EvalEnv, model: ModelClient, write = true): Promise<EvalRun> {
  let scripts = readScripts(args.scriptsDir);
  if (args.ids !== null) {
    const want = new Set(args.ids);
    const missing = [...want].filter((id) => !scripts.some((s) => s.id === id));
    if (missing.length > 0) throw new Error(`unknown script id(s): ${missing.join(", ")}`);
    scripts = scripts.filter((s) => want.has(s.id));
  }
  for (const s of scripts.filter((x) => x.type === "hard_audio")) console.log(`skip ${s.id}: hard_audio scripts run in audio mode only`);
  scripts = scripts.filter((s) => s.type !== "hard_audio");

  const t0 = Date.now();
  const opts = { timezone: env.CALL_TIMEZONE, likelyMinDistinctSigns: env.LIKELY_MIN_DISTINCT_SIGNS };
  const results = await pool(scripts, args.model === "fake" ? 8 : env.EVAL_CONCURRENCY, async (s) => {
    const r = await runScript(s, model, opts);
    console.log(`  ${s.id}  ${r.state.level.padEnd(8)}  ${r.calls.length} model calls  ${r.errors} errors`);
    return r;
  });
  const records = scripts.map((s, i) => scoreScript(s, results[i] as ScriptedRunResult, env.CALL_TIMEZONE));
  const summary = summarize(records);

  // Quote-or-drop holds by construction; a violation is a bug, not a metric.
  const invented = records.flatMap((r) => r.invented.map((x) => `${r.id} ${x}`));
  if (invented.length > 0) throw new Error(`invented facts shown (quote not in the script):\n${invented.join("\n")}`);

  const modelName = args.model === "fake" ? "fake model" : `${env.CLAUDE_FAST_MODEL} + ${env.CLAUDE_REASONER_MODEL} @${env.CLAUDE_REASONER_EFFORT}`;
  const markdown = [summaryTable(summary, modelName), "", perScriptTable(records)].join("\n");

  let outFile: string | null = null;
  if (write) {
    mkdirSync(args.out, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    outFile = join(args.out, `${stamp}-${args.mode}-${args.model}.json`);
    const payload = {
      mode: args.mode,
      model: modelName,
      ranAt: new Date().toISOString(),
      wallMs: Date.now() - t0,
      summary,
      records,
      states: results.map((r) => ({ scriptId: r.scriptId, state: r.state, turns: r.turns, calls: r.calls, drops: r.drops })),
    };
    writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`);
  }
  return { records, results, markdown, outFile };
}

export async function main(argv: readonly string[]): Promise<number> {
  let args: RunArgs;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error((e as Error).message);
    return 2;
  }
  if (args.mode === "audio") {
    console.error("Audio mode is deferred (D-33): the eval runs in text mode only. Use --mode text.");
    return 2;
  }
  let model: ModelClient;
  let env: EvalEnv;
  try {
    env = loadEnv();
    model = makeModel(args.model, env);
  } catch (e) {
    console.error((e as Error).message);
    return 1;
  }
  const run = await runEval(args, env, model);
  console.log(`\n${run.markdown}\n`);
  if (run.outFile !== null) console.log(`results: ${run.outFile}`);
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e: unknown) => {
      console.error(e instanceof Error ? e.stack : e);
      process.exit(1);
    },
  );
}
