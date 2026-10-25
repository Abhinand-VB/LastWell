// `pnpm --filter @lastwell/eval audio:robustness [--ids A01,B01] [--variants calm,accent,panicked]
//   [--accent-voice <id>] [--model live|fake] [--max-audio-min 30] [--plan]`
// Audio robustness for the results slide: each script's caller lines are generated with Sonic in three
// deliveries (calm, non-native accent, rushed/panicked), the dispatcher in one standard voice; the call
// is streamed through Ink 2 (two tracks, profile `call`, as on a real phone call) and what Ink heard
// goes through the same core pipeline and scorer as text mode. Keys load like the gateway's (.env).
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runScript, type EvalScript, type ModelClient } from "@lastwell/core";
import { loadEnv, requireCartesiaKey, type EvalEnv } from "../env.js";
import { makeModel, readScripts } from "../run.js";
import { scoreScript, summarize, type ScriptRecord, type Summary } from "../score.js";
import { listVoices, pickAccentVoice, SonicCache, type SonicCfg, type VoiceInfo, type VoiceSpec } from "./sonic.js";
import { buildTracks, placeTurns } from "./timeline.js";
import { transcribe, type HeardTurn } from "./transcribe.js";

export const DEFAULT_IDS = ["A01", "A03", "B01", "B02", "C01", "C03"];
export const VARIANTS = ["calm", "accent", "panicked"] as const;
export type Variant = (typeof VARIANTS)[number];
export type Column = "text" | Variant;

const EVAL_DIR = fileURLToPath(new URL("../..", import.meta.url));

export interface AudioArgs {
  ids: string[];
  variants: Variant[];
  accentVoice: string | null;
  model: "live" | "fake";
  maxAudioMin: number;
  plan: boolean;
}

export function parseAudioArgs(argv: readonly string[]): AudioArgs {
  const args = argv.filter((a) => a !== "--");
  const get = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
  };
  const list = (s: string | undefined) => s?.split(",").map((x) => x.trim()).filter(Boolean);
  const variants = (list(get("--variants")) ?? [...VARIANTS]) as Variant[];
  const bad = variants.filter((v) => !VARIANTS.includes(v));
  if (bad.length > 0) throw new Error(`unknown variant(s): ${bad.join(", ")} (use ${VARIANTS.join(", ")})`);
  const model = get("--model") ?? "live";
  if (model !== "live" && model !== "fake") throw new Error("--model must be live or fake");
  const maxAudioMin = Number(get("--max-audio-min") ?? 30);
  if (!(maxAudioMin > 0 && maxAudioMin <= 30)) throw new Error("--max-audio-min must be in (0, 30]");
  return {
    ids: (list(get("--ids")) ?? DEFAULT_IDS).map((s) => s.toUpperCase()),
    variants,
    accentVoice: get("--accent-voice") ?? null,
    model,
    maxAudioMin,
    plan: args.includes("--plan"),
  };
}

/** How each delivery is voiced (Sonic 3 generation_config). */
export function voices(standardId: string, accentId: string): Record<Variant | "dispatcher", VoiceSpec> {
  return {
    dispatcher: { id: standardId, emotion: "calm" },
    calm: { id: standardId, emotion: "calm", speed: 1 },
    accent: { id: accentId },
    panicked: { id: standardId, emotion: "panicked", speed: 1.3 },
  };
}

/** What Ink heard, as a script: same id and truth, turns = Ink's finals at the time they arrived. */
export function heardScript(script: EvalScript, heard: readonly HeardTurn[]): EvalScript {
  const turns = [...heard].sort((a, b) => a.arrivedMs - b.arrivedMs).map((h) => ({ speaker: h.speaker, atMs: Math.round(h.arrivedMs), text: h.text }));
  return { ...script, turns };
}

const yes = (b: boolean | undefined) => (b === undefined ? "—" : b ? "✓" : "✗");

export function cell(r: ScriptRecord): string {
  const flag = r.firstPossibleS === null ? "" : ` @${Math.round(r.firstPossibleS)}s`;
  return `${r.maxLevel}${flag} · LKW ${r.lkw === null ? "—" : yes(r.lkw.correct)} · BT ${r.bloodThinner === null ? "—" : yes(r.bloodThinner.correct)}${r.invented.length > 0 ? ` · invented ${r.invented.length}` : ""}`;
}

const ratio = (x: { n: number; d: number }) => `${x.n}/${x.d}`;

export function summaryLine(col: Column, s: Summary): string {
  const l = s.lastwell;
  const first = l.medianFirstFlagS === null ? "—" : `${Math.round(l.medianFirstFlagS)} s`;
  return `- **${col}**: strokes flagged ${ratio(l.sensPossible)} (likely ${ratio(l.sensLikely)}), median first flag ${first}, LKW ${ratio(l.lkw)}, blood thinner ${ratio(l.bloodThinner)}, invented facts ${l.invented}, level agreement ${ratio(l.levelAgreement)}.`;
}

export function markdown(
  ids: readonly string[],
  cols: readonly Column[],
  records: Record<Column, ScriptRecord[]>,
  meta: { model: string; voices: string; generatedMin: number; ranAt: string },
): string {
  const head = `| Script | ${cols.join(" | ")} |`;
  const sep = `| --- | ${cols.map(() => "---").join(" | ")} |`;
  const rows = ids.map((id) => `| ${id} | ${cols.map((c) => { const r = records[c].find((x) => x.id === id); return r ? cell(r) : "n/a"; }).join(" | ")} |`);
  return [
    "# Audio robustness",
    "",
    `Ran ${meta.ranAt}. Pipeline: ${meta.model}. Caller lines generated with Sonic (phone audio, µ-law 8 kHz) and transcribed by Ink 2 on two tracks, profile \`call\`, as on a live call; \`text\` is the same scripts in text mode (no speech step). Scored exactly like text mode. ${meta.voices}. Generated audio this run: ${meta.generatedMin.toFixed(1)} min (cached lines are reused).`,
    "",
    "Cell: highest level reached @ seconds to first flag · LKW correct · blood thinner correct (— = not in the script) · invented facts (shown only when > 0).",
    "",
    "Seconds to first flag are on each call's own clock: audio calls run longer than the script's spacing (real speech durations, lines never overlap) and include Ink's end-of-turn delay, so compare them across the three voices, not against `text`.",
    "",
    head,
    sep,
    ...rows,
    "",
    ...cols.map((c) => summaryLine(c, summarize(records[c]))),
    "",
  ].join("\n");
}

export async function main(argv: readonly string[]): Promise<number> {
  let args: AudioArgs;
  let env: EvalEnv;
  let model: ModelClient;
  let sonic: SonicCfg;
  try {
    args = parseAudioArgs(argv);
    env = loadEnv();
    sonic = { apiKey: requireCartesiaKey(env), version: env.CARTESIA_VERSION, model: env.CARTESIA_TTS_MODEL };
    model = makeModel(args.model, env);
  } catch (e) {
    console.error((e as Error).message);
    return 2;
  }
  const scripts = readScripts(join(EVAL_DIR, "scripts")).filter((s) => args.ids.includes(s.id));
  const missing = args.ids.filter((id) => !scripts.some((s) => s.id === id));
  if (missing.length > 0) {
    console.error(`unknown script id(s): ${missing.join(", ")}`);
    return 2;
  }

  let accent: VoiceInfo | null = args.accentVoice === null ? null : { id: args.accentVoice, name: args.accentVoice, description: "", locales: [] };
  if (accent === null && args.variants.includes("accent")) {
    accent = pickAccentVoice(await listVoices(sonic, { q: "accent", language: "en" }));
    if (accent === null) {
      console.error("no accented English voice found in GET /voices?q=accent&language=en; pass --accent-voice <id>");
      return 2;
    }
  }
  const v = voices(env.CARTESIA_VOICE_ID, accent?.id ?? env.CARTESIA_VOICE_ID);
  const voiceNote = `Voices: dispatcher, calm and panicked use ${env.CARTESIA_VOICE_ID} (calm: emotion calm, speed 1; panicked: emotion panicked, speed 1.3); accent uses ${accent ? `"${accent.name}" ${accent.id}${accent.description ? ` (${accent.description.replace(/\s+/g, " ").slice(0, 120)})` : ""}` : "—"}`;
  console.log(voiceNote);
  const words = scripts.reduce((a, s) => a + s.turns.reduce((b, t) => b + t.text.split(/\s+/).length, 0), 0);
  console.log(`plan: ${scripts.length} scripts × ${args.variants.length} variants; ~${words} words per variant set; cap ${args.maxAudioMin} min of generated audio`);
  if (args.plan) return 0;

  const cache = new SonicCache(sonic, join(EVAL_DIR, "results", "audio-cache"), args.maxAudioMin * 60);
  const opts = { timezone: env.CALL_TIMEZONE, likelyMinDistinctSigns: env.LIKELY_MIN_DISTINCT_SIGNS };
  const ink = { apiKey: sonic.apiKey, cartesiaVersion: env.CARTESIA_VERSION, model: env.CARTESIA_STT_MODEL, keyterms: env.STT_KEYTERMS };
  const cols: Column[] = ["text", ...args.variants];
  const records = Object.fromEntries(cols.map((c) => [c, [] as ScriptRecord[]])) as unknown as Record<Column, ScriptRecord[]>;
  const raw: unknown[] = [];

  for (const script of scripts) {
    const text = await runScript(script, model, opts);
    records.text.push(scoreScript(script, text, env.CALL_TIMEZONE));
    // The three deliveries of one script run concurrently (2 Ink sockets each).
    await Promise.all(
      args.variants.map(async (variant) => {
        const audio: Buffer[] = [];
        for (const t of script.turns) audio.push(await cache.line(t.text, t.speaker === "dispatcher" ? v.dispatcher : v[variant]));
        const placed = placeTurns(script.turns, audio.map((b) => b.length / 8));
        const { heard, degraded } = await transcribe(buildTracks(placed, audio), ink);
        const hs = heardScript(script, heard);
        const r = await runScript(hs, model, opts);
        const rec = scoreScript(hs, r, env.CALL_TIMEZONE);
        records[variant].push(rec);
        raw.push({ id: script.id, variant, degraded, heard, record: rec, state: r.state });
        console.log(`  ${script.id} ${variant.padEnd(8)} ${cell(rec)}${degraded.length ? `  (Ink degraded: ${degraded.join("; ")})` : ""}`);
      }),
    );
    console.log(`  ${script.id} text     ${cell(records.text.at(-1)!)}   [generated so far ${(cache.generatedS / 60).toFixed(1)} min]`);
  }

  const ranAt = new Date().toISOString();
  const modelName = args.model === "fake" ? "fake model" : `${env.CLAUDE_FAST_MODEL} + ${env.CLAUDE_REASONER_MODEL} @${env.CLAUDE_REASONER_EFFORT}`;
  const md = markdown(args.ids, cols, records, { model: modelName, voices: voiceNote, generatedMin: cache.generatedS / 60, ranAt });
  const outDir = join(EVAL_DIR, "results");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "audio-robustness.md"), md);
  writeFileSync(join(outDir, `${ranAt.replace(/[:.]/g, "-")}-audio-robustness.json`), `${JSON.stringify({ ranAt, model: modelName, voices: voiceNote, runs: raw }, null, 2)}\n`);
  console.log(`\n${md}\nwrote ${join(outDir, "audio-robustness.md")}`);
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
