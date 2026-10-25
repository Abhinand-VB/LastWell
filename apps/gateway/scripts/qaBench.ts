// `pnpm --filter @lastwell/gateway qa:bench` — Q&A latency, measured with the real vendors (no phone
// call): each question is spoken by Sonic (phone audio), streamed at real time into Ink 2 with the old
// and the candidate `qa` turn settings, answered by the old path (always the model) and the new one
// (case-state fast path, else the model started on Ink's eager end-of-turn), and voiced by the Sonic
// WebSocket. Prints a before/after table per question. Keys load through src/env.ts like the gateway.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { InkSession, PROFILES, type TurnSettings } from "@lastwell/stt";
import type { CaseState, Utterance } from "@lastwell/core";
import { loadEnv } from "../src/env.js";
import { createLogger } from "../src/log.js";
import { createServices } from "../src/services.js";
import { answerFromState } from "../src/alerts/qaFast.js";
import { finalizeQa } from "../src/alerts/qaAnswer.js";
import { mulawSilence } from "../src/tts/audioChunks.js";

const FIXTURE = fileURLToPath(new URL("../../../packages/core/src/fixtures/caseState.A01.json", import.meta.url));

/** Questions as a neurologist asks them; `pause` splits the audio with silence to test cut-offs. */
const QUESTIONS: Array<{ q: string; pause?: [string, number, string] }> = [
  { q: "When was he last normal?" },
  { q: "Is he on any blood thinners?" },
  { q: "How old is he?" },
  { q: "What's the address?" },
  { q: "What did the caller say about his speech?" },
  { q: "Any history of seizures?" },
  { q: "Did he hit his head when this started?" },
  { q: "Is he diabetic, does he take insulin?" },
  { q: "Is he on any blood thinners?", pause: ["Is he on", 600, "any blood thinners?"] },
  { q: "When was he last normal?", pause: ["When was he", 450, "last normal?"] },
];

const OLD: TurnSettings = { start: 0.8, eager: 0.5, end: 0.2, timeoutMs: 1600 };
/** `--try '{"a":{"eager":0.4,"end":0.15,"timeoutMs":1100}}'` adds candidate settings (partial, over `current`). */
function candidates(argv: readonly string[]): Record<string, TurnSettings> {
  const i = argv.indexOf("--try");
  const extra = i >= 0 ? (JSON.parse(argv[i + 1] ?? "{}") as Record<string, Partial<TurnSettings>>) : {};
  return { old: OLD, current: PROFILES.qa, ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, { ...PROFILES.qa, ...v }])) };
}
const CANDIDATES = candidates(process.argv.slice(2));

const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function transcriptFor(state: CaseState): Utterance[] {
  const seen = new Map<string, Utterance>();
  [...state.signs.map((s) => s.ref), ...state.facts.map((f) => f.ref), ...(state.lkw ? [state.lkw.ref] : [])].forEach((r, i) => {
    const u = seen.get(r.utteranceId);
    if (!u) seen.set(r.utteranceId, { id: r.utteranceId, callId: state.callId, seq: i + 1, speaker: r.speaker, text: r.quote, tStartMs: r.tMs, tEndMs: r.tMs + 1000 });
    else if (!u.text.includes(r.quote)) u.text = `${u.text}, ${r.quote}`;
  });
  return [...seen.values()];
}

interface InkRun {
  finals: string[];
  eotMs: number | null;
  eagerLeadMs: number | null;
}

/** Stream one question at real time (20 ms frames) and time the end-of-turn after the audio ends. */
async function inkRun(audio: Buffer, turn: TurnSettings, ink: { apiKey: string; cartesiaVersion: string; model: string; keyterms: string[] }): Promise<InkRun> {
  let pos = 0;
  const s = new InkSession({ ...ink, speaker: "caller", encoding: "pcm_mulaw", sampleRate: 8000, profile: "qa", turn, getTs: () => pos });
  const finals: Array<{ text: string; at: number }> = [];
  let eager: { text: string; at: number } | null = null;
  s.on("final", (f) => finals.push({ text: f.text, at: Date.now() }));
  s.on("eager", (e) => {
    eager = { text: e.text, at: Date.now() };
  });
  s.on("resume", () => {
    eager = null;
  });
  const lead = mulawSilence(500);
  const tail = mulawSilence(4000);
  const all = Buffer.concat([lead, audio, tail]);
  const t0 = Date.now();
  let audioEnd = 0;
  for (let off = 0, i = 0; off < all.length; off += 160, i++) {
    s.sendAudio(all.subarray(off, off + 160));
    pos = (i + 1) * 20;
    if (off + 160 >= lead.length + audio.length && audioEnd === 0) audioEnd = Date.now();
    const wait = t0 + pos - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (finals.length > 0 && Date.now() - finals.at(-1)!.at > 1500) break;
  }
  await s.close();
  const last = finals.at(-1);
  const e = eager as { text: string; at: number } | null;
  return {
    finals: finals.map((f) => f.text),
    eotMs: last ? last.at - audioEnd : null,
    eagerLeadMs: last && e && key(e.text) === key(last.text) ? last.at - e.at : null,
  };
}

async function main(): Promise<void> {
  const env = loadEnv();
  if (!env.CARTESIA_API_KEY || !env.ANTHROPIC_API_KEY) throw new Error("qa:bench needs CARTESIA_API_KEY and ANTHROPIC_API_KEY in .env");
  if (env.fakes.size > 0) throw new Error("qa:bench measures the real vendors: empty LASTWELL_FAKES");
  const services = createServices(env, createLogger("silent"));
  const state = JSON.parse(readFileSync(FIXTURE, "utf8")) as CaseState;
  const transcript = transcriptFor(state);
  const now = new Date(Date.parse(state.updatedAt) + 5 * 60_000);
  const ink = { apiKey: env.CARTESIA_API_KEY, cartesiaVersion: env.CARTESIA_VERSION, model: env.CARTESIA_STT_MODEL, keyterms: env.STT_KEYTERMS };
  const tts = services.ttsStream();
  await new Promise((r) => setTimeout(r, 800)); // let the Sonic socket open, as it does at stream start
  await services.model.answer({ questionText: "warmup", utterances: transcript, state, now, timezone: env.CALL_TIMEZONE }).catch(() => null);

  const rows: string[] = [];
  const header = "| Question | path | EOT old → new | model ms | eager lead | Sonic first | before total | after total | finals (new) |";
  console.log(`profiles: old ${JSON.stringify(OLD)} → current ${JSON.stringify(PROFILES.qa)}`);
  const oi = process.argv.indexOf("--only");
  const only = oi >= 0 ? new Set((process.argv[oi + 1] ?? "").split(",").map((x) => Number(x) - 1)) : null;
  for (const [n, item] of QUESTIONS.entries()) {
    if (only && !only.has(n)) continue;
    const audio = item.pause
      ? Buffer.concat([await services.tts.synthesize(item.pause[0]), mulawSilence(item.pause[1]), await services.tts.synthesize(item.pause[2])])
      : await services.tts.synthesize(item.q);
    const runs = Object.fromEntries(await Promise.all(Object.entries(CANDIDATES).map(async ([name, t]) => [name, await inkRun(audio, t, ink)] as const))) as Record<string, InkRun>;
    const heard = runs.current?.finals.at(-1) ?? item.q;
    const tm = Date.now();
    const out = await services.model.answer({ questionText: heard, utterances: transcript, state, now, timezone: env.CALL_TIMEZONE }).catch(() => null);
    const modelMs = Date.now() - tm;
    const modelAnswer = finalizeQa(heard, out?.output ?? null, { state, transcript }, now, env.CALL_TIMEZONE).answer;
    const fast = answerFromState(heard, state, transcript, now, env.CALL_TIMEZONE);
    const answer = fast?.answer ?? modelAnswer;
    let first: number | null = null;
    const ts = Date.now();
    await tts.speak(answer, `bench-${n}`, () => {
      if (first === null) first = Date.now() - ts;
    });
    const sonic = first ?? 0;
    const eotOld = runs.old?.eotMs ?? 0;
    const eotNew = runs.current?.eotMs ?? 0;
    const lead = runs.current?.eagerLeadMs ?? 0;
    const before = eotOld + modelMs + sonic;
    // After: fast path costs ~0; a model answer starts at the eager end (lead) and a filler covers > 700 ms.
    const prep = fast ? 0 : Math.max(0, modelMs - lead);
    const afterAnswer = eotNew + prep + sonic;
    const afterHeard = fast ? afterAnswer : Math.min(afterAnswer, eotNew + 700);
    for (const [name, r] of Object.entries(runs)) if (name !== "old" && name !== "current") console.log(`   try ${name}: EOT ${r.eotMs} eager lead ${r.eagerLeadMs} finals ${JSON.stringify(r.finals)}`);
    const cut = (runs.current?.finals.length ?? 0) > 1 ? ` ⚠ split: ${runs.current!.finals.map((f) => `"${f}"`).join(" + ")}` : "";
    rows.push(
      `| ${item.pause ? `${item.q} (pause ${item.pause[1]} ms)` : item.q} | ${fast ? "fast" : "model"} | ${eotOld} → ${eotNew} | ${modelMs} | ${lead} | ${sonic} | ${before} | ${afterAnswer}${afterHeard < afterAnswer ? ` (filler at ${afterHeard})` : ""} | "${heard}"${cut} |`,
    );
    console.log(rows.at(-1));
  }
  tts.close();
  console.log(`\n${header}\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n${rows.join("\n")}`);
}

main().then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
