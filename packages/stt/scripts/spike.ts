// V-02 spike: stream a 16 kHz mono WAV to Ink 2 at real-time pace and print every turn event.
//   pnpm --filter @lastwell/stt spike path/to.wav
// Reads CARTESIA_API_KEY, CARTESIA_VERSION, CARTESIA_STT_MODEL and STT_KEYTERMS from the repo-root .env
// (or the environment). Real-time pace is mandatory (G-11); a 20 s file takes 20 s.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { InkSession, paceChunks, parseWav } from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.join(here, "..", "..", "..", ".env"));
} catch {
  // no .env: rely on the environment
}

const file = process.argv[2];
if (file === undefined) {
  console.error("usage: pnpm --filter @lastwell/stt spike <file.wav>");
  process.exit(1);
}
const apiKey = process.env.CARTESIA_API_KEY ?? "";
if (apiKey === "" || apiKey.startsWith("sk_car_...")) {
  console.error("CARTESIA_API_KEY is not set: put it in the repo-root .env");
  process.exit(1);
}

const wav = parseWav(readFileSync(path.resolve(process.env.INIT_CWD ?? process.cwd(), file)));
if (wav.sampleRate !== 16000 || wav.channels !== 1 || wav.bitsPerSample !== 16) {
  console.error(`need 16 kHz mono 16-bit PCM; got ${wav.sampleRate} Hz, ${wav.channels} ch, ${wav.bitsPerSample} bit`);
  process.exit(1);
}

let sentBytes = 0;
const t0 = Date.now();
const stamp = (): string => `${((Date.now() - t0) / 1000).toFixed(2)}s`;
const session = new InkSession({
  apiKey,
  cartesiaVersion: process.env.CARTESIA_VERSION ?? "2026-08-14",
  model: process.env.CARTESIA_STT_MODEL ?? "ink-2",
  keyterms: (process.env.STT_KEYTERMS ?? "").split(","),
  speaker: "mixed",
  encoding: "pcm_s16le",
  sampleRate: 16000,
  profile: "call",
  getTs: () => sentBytes / 32,
  reconnect: false,
});
const finals: string[] = [];
session.on("turn.start", (e) => console.log(stamp(), "turn.start", JSON.stringify(e)));
session.on("partial", (e) => console.log(stamp(), "turn.update", JSON.stringify(e)));
session.on("final", (e) => {
  finals.push(e.text);
  console.log(stamp(), "turn.end", JSON.stringify(e));
});
session.on("error", (e) => console.log(stamp(), "error", JSON.stringify(e)));
session.on("degraded", (e) => console.log(stamp(), "degraded", JSON.stringify(e)));

console.log(`streaming ${file}: ${(wav.data.length / 32000).toFixed(1)} s of audio at real-time pace`);
await paceChunks(
  wav.data,
  (chunk) => {
    session.sendAudio(chunk);
    sentBytes += chunk.length;
  },
  { bytesPerMs: 32, chunkMs: 20 },
);
// One second of trailing silence lets the last turn end naturally, then close drains it.
await paceChunks(Buffer.alloc(32000), (chunk) => session.sendAudio(chunk), { bytesPerMs: 32, chunkMs: 20 });
await session.close();
console.log(stamp(), "closed");
console.log("FINAL TRANSCRIPT:", finals.join(" "));
