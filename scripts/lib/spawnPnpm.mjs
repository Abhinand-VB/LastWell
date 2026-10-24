// Spawn pnpm without a shell string, on macOS and Windows alike (docs/10 §10).
// Inside a pnpm script, npm_execpath points at pnpm itself: a JS entry (run it with node)
// or a native executable (run it directly). Outside pnpm we fall back to the PATH binary.
import { spawn } from "node:child_process";

export function pnpmCommand() {
  const execPath = process.env.npm_execpath;
  if (execPath && /\.(c|m)?js$/.test(execPath)) return { cmd: process.execPath, pre: [execPath], shell: false };
  if (execPath && /pnpm(\.exe)?$/i.test(execPath)) return { cmd: execPath, pre: [], shell: false };
  // Last resort: Windows needs a shell to run pnpm.cmd.
  return { cmd: process.platform === "win32" ? "pnpm.cmd" : "pnpm", pre: [], shell: process.platform === "win32" };
}

export function spawnPnpm(args, options = {}) {
  const { cmd, pre, shell } = pnpmCommand();
  return spawn(cmd, [...pre, ...args], { stdio: "inherit", shell, ...options });
}

// Kill a child and everything it started (tsx watch, next dev).
export function killTree(child) {
  if (!child || child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
}
