// Spawn the real gateway as a black box (no imports from apps/gateway) on a free port, all fakes on.
import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const E2E_KEY = "e2e-internal-key";
// 555-01xx numbers are reserved for fiction; the fake telephony never dials anything.
export const ALLOWED_PHONE = "+14155550100";
export const NOT_ALLOWED_PHONE = "+14155550123";
export const TIMEZONE = "America/Los_Angeles";

export interface Gateway {
  baseUrl: string;
  wsUrl: string;
  logFile: string;
  stop(): Promise<void>;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr !== null ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

// pnpm without a shell string (docs/10 §10): npm_execpath is pnpm's JS entry or its native binary.
function pnpm(): { cmd: string; pre: string[]; shell: boolean } {
  const p = process.env.npm_execpath;
  if (p && /\.(c|m)?js$/.test(p)) return { cmd: process.execPath, pre: [p], shell: false };
  if (p && /pnpm(\.exe)?$/i.test(p)) return { cmd: p, pre: [], shell: false };
  return { cmd: process.platform === "win32" ? "pnpm.cmd" : "pnpm", pre: [], shell: process.platform === "win32" };
}

function killTree(child: ChildProcess): void {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

export async function startGateway(): Promise<Gateway> {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const logFile = join(tmpdir(), `lastwell-e2e-gateway-${port}.log`);
  const log = createWriteStream(logFile);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    LASTWELL_FAKES: "all",
    DEMO_MODE: "false",
    INTERNAL_API_KEY: E2E_KEY,
    PUBLIC_BASE_URL: baseUrl,
    ALERT_ALLOWED_NUMBERS: ALLOWED_PHONE,
    ALERT_DEFAULT_TARGET_PHONE: ALLOWED_PHONE,
    DEMO_ALERT_TO_CALLER: "false",
    FEATURE_QA_ENABLED: "false",
    CALL_TIMEZONE: TIMEZONE,
    DISPATCHER_PHONE: ALLOWED_PHONE,
    TWILIO_PHONE_NUMBER: "+14155550199",
    LOG_LEVEL: "info",
  };
  const { cmd, pre, shell } = pnpm();
  const child = spawn(cmd, [...pre, "--filter", "@lastwell/gateway", "dev"], {
    env,
    shell,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  child.stdout?.pipe(log);
  child.stderr?.pipe(log);

  const stop = async () => {
    killTree(child);
    await new Promise((r) => setTimeout(r, 300));
    log.end();
  };

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      const res = await fetch(`${baseUrl}/healthz`);
      if (res.ok) return { baseUrl, wsUrl: `ws://127.0.0.1:${port}/ws/ui`, logFile, stop };
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  await stop();
  throw new Error(`gateway did not answer /healthz within 90 s (exit ${child.exitCode}); log tail:\n${tail(logFile)}`);
}

export function tail(file: string, lines = 40): string {
  try {
    return readFileSync(file, "utf8").split("\n").slice(-lines).join("\n");
  } catch {
    return "(no log)";
  }
}
