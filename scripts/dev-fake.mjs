#!/usr/bin/env node
// pnpm dev:fake — gateway with every external service faked + the web app, and an A01 replay
// every 90 s so the console always has a live call to render (docs/10 §4).
// Needs no keys. Overrides: GATEWAY_PORT (8787), WEB_PORT (3000), REPLAY_EVERY_MS (90000),
// REPLAY_SCRIPT (A01), REPLAY_SPEED (1), INTERNAL_API_KEY, ALERT_ALLOWED_NUMBERS.
import { killTree, spawnPnpm } from "./lib/spawnPnpm.mjs";

const gatewayPort = Number(process.env.GATEWAY_PORT ?? 8787);
const webPort = Number(process.env.WEB_PORT ?? 3000);
const replayEveryMs = Number(process.env.REPLAY_EVERY_MS ?? 90_000);
const replayScript = process.env.REPLAY_SCRIPT ?? "A01";
const replaySpeed = Number(process.env.REPLAY_SPEED ?? 1);
const internalKey = process.env.INTERNAL_API_KEY ?? "dev-fake-internal-key";
// 555-01xx numbers are reserved for fiction; the fake telephony never dials anything.
const fakePhone = "+14155550100";
const gatewayUrl = `http://localhost:${gatewayPort}`;

const shared = {
  ...process.env,
  LASTWELL_FAKES: "all",
  DEMO_MODE: "false",
  INTERNAL_API_KEY: internalKey,
  FEATURE_QA_ENABLED: process.env.FEATURE_QA_ENABLED ?? "false",
};

const gatewayEnv = {
  ...shared,
  PORT: String(gatewayPort),
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL ?? gatewayUrl,
  ALERT_ALLOWED_NUMBERS: process.env.ALERT_ALLOWED_NUMBERS ?? fakePhone,
  ALERT_DEFAULT_TARGET_PHONE: process.env.ALERT_DEFAULT_TARGET_PHONE ?? fakePhone,
  DEMO_ALERT_TO_CALLER: "false",
  DISPATCHER_PHONE: process.env.DISPATCHER_PHONE ?? fakePhone,
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER ?? "+14155550199",
};

const webEnv = {
  ...shared,
  PORT: String(webPort),
  GATEWAY_URL: gatewayUrl,
  NEXT_PUBLIC_GATEWAY_WS_URL: `ws://localhost:${gatewayPort}/ws/ui`,
};

const detached = process.platform !== "win32";
const children = [
  spawnPnpm(["--filter", "@lastwell/gateway", "dev"], { env: gatewayEnv, detached }),
  spawnPnpm(["--filter", "@lastwell/web", "dev"], { env: webEnv, detached }),
];

let stopping = false;
let timer;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  for (const c of children) killTree(c);
  setTimeout(() => process.exit(code), 500);
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
for (const c of children) c.on("exit", (code) => !stopping && (console.error(`[dev:fake] a child exited (${code}); stopping`), stop(code ?? 1)));

async function healthy() {
  try {
    const res = await fetch(`${gatewayUrl}/healthz`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

let warnedMissingReplay = false;
async function replay() {
  try {
    const res = await fetch(`${gatewayUrl}/api/calls/replay`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-key": internalKey },
      body: JSON.stringify({ scriptId: replayScript, speed: replaySpeed }),
    });
    if (res.status === 404) {
      if (!warnedMissingReplay) console.warn("[dev:fake] POST /api/calls/replay → 404 (V-11 not landed yet); will keep trying");
      warnedMissingReplay = true;
      return;
    }
    const body = await res.text();
    console.log(`[dev:fake] replay ${replayScript} → ${res.status} ${body.slice(0, 200)}`);
  } catch (err) {
    console.warn(`[dev:fake] replay failed: ${err.message}`);
  }
}

const started = Date.now();
(async () => {
  let health = null;
  while (!stopping && !(health = await healthy())) {
    if (Date.now() - started > 120_000) {
      console.error("[dev:fake] gateway /healthz not up after 120 s");
      return stop(1);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (stopping) return;
  console.log(`[dev:fake] gateway up: ${JSON.stringify(health)}`);
  console.log(`[dev:fake] web: http://localhost:${webPort} · replaying ${replayScript} every ${replayEveryMs / 1000} s`);
  await replay();
  timer = setInterval(replay, replayEveryMs);
})();
