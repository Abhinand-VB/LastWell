// R-10 latency bench: `npx tsx src/latency.ts [--n 20] [--efforts medium,low]` (from apps/eval).
// Sequential live calls (no contention): the fast pass at its configured effort over caller utterances
// of A01/B01/C01, and the reasoner at each effort over growing transcripts of the same scripts.
// Prints p50/p95 latency and prompt-cache reads. Costs cents; not part of any test.
import { createClaudeClient, createFakeModel, runScript, type EvalScript, type ReasonerInput, type ResponseInfo } from "@lastwell/core";
import { loadEnv, requireApiKey } from "./env.js";
import { median } from "./score.js";
import { readScripts } from "./run.js";
import { fileURLToPath } from "node:url";

function pct(xs: readonly number[], p: number): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] ?? null;
}

function arg(argv: readonly string[], name: string, fallback: string): string {
  const i = argv.indexOf(name);
  return i >= 0 ? (argv[i + 1] ?? fallback) : fallback;
}

async function main(argv: readonly string[]): Promise<void> {
  const env = loadEnv();
  requireApiKey(env);
  const n = Number(arg(argv, "--n", "20"));
  const efforts = arg(argv, "--efforts", "medium,low").split(",") as ("low" | "medium" | "high")[];
  const scripts = readScripts(fileURLToPath(new URL("../scripts", import.meta.url))).filter((s) => ["A01", "B01", "C01"].includes(s.id));

  const fastInputs = scripts.flatMap((s) =>
    s.turns.flatMap((t, i) => (t.speaker === "dispatcher" ? [] : [{ utteranceText: t.text, prevDispatcherText: s.turns[i - 1]?.speaker === "dispatcher" ? (s.turns[i - 1]?.text ?? null) : null }])),
  );
  // Reasoner inputs: each script cut after 4, 6, 8 … turns, with the state the fake pipeline reaches there.
  const reasonerInputs: ReasonerInput[] = [];
  for (const s of scripts) {
    for (let k = 4; k <= s.turns.length; k += 2) {
      const cut: EvalScript = { ...s, turns: s.turns.slice(0, k) };
      const r = await runScript(cut, createFakeModel(), { timezone: env.CALL_TIMEZONE });
      const last = cut.turns[cut.turns.length - 1]?.atMs ?? 0;
      const start = new Date(new Date(r.state.updatedAt).getTime() - last);
      reasonerInputs.push({ utterances: r.utterances, state: r.state, callStartedAt: start, now: new Date(start.getTime() + last), timezone: env.CALL_TIMEZONE });
    }
  }

  const rows: { label: string; infos: ResponseInfo[]; errors: number }[] = [];
  const bench = async (label: string, effort: "low" | "medium" | "high", pass: "fast" | "reasoner") => {
    const infos: ResponseInfo[] = [];
    let errors = 0;
    const model = createClaudeClient({
      fastModel: env.CLAUDE_FAST_MODEL,
      reasonerModel: env.CLAUDE_REASONER_MODEL,
      qaModel: env.CLAUDE_QA_MODEL,
      fastEffort: pass === "fast" ? effort : env.CLAUDE_FAST_EFFORT,
      reasonerEffort: pass === "reasoner" ? effort : env.CLAUDE_REASONER_EFFORT,
      onResponse: (i) => infos.push(i),
    });
    for (let i = 0; i < n; i++) {
      try {
        if (pass === "fast") await model.fastPass(fastInputs[i % fastInputs.length]!);
        else await model.reason(reasonerInputs[i % reasonerInputs.length]!);
      } catch (e) {
        errors++;
        console.error(`  ${label} #${i}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    rows.push({ label, infos, errors });
    console.log(`  done ${label}`);
  };

  await bench(`fast pass ${env.CLAUDE_FAST_MODEL} @${env.CLAUDE_FAST_EFFORT}`, env.CLAUDE_FAST_EFFORT, "fast");
  for (const e of efforts) await bench(`reasoner ${env.CLAUDE_REASONER_MODEL} @${e}`, e, "reasoner");

  console.log("\n| Pass | n | p50 | p95 | max | errors | stop≠end_turn | input tok p50 | cache read tok (total) |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const r of rows) {
    const ms = r.infos.map((i) => i.ms);
    const odd = r.infos.filter((i) => i.stopReason !== "end_turn").length;
    const cache = r.infos.reduce((a, i) => a + i.cacheReadTokens, 0);
    console.log(
      `| ${r.label} | ${r.infos.length} | ${pct(ms, 50)} ms | ${pct(ms, 95)} ms | ${Math.max(...ms)} ms | ${r.errors} | ${odd} | ${median(r.infos.map((i) => i.inputTokens))} | ${cache} |`,
    );
  }
}

main(process.argv.slice(2)).catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
