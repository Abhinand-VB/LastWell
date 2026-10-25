// X-03: browser smoke tests of the console and the board against `pnpm dev:fake` (docs/10 §5).
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { GATEWAY_PORT, WEB_PORT } from "./ui/ports.js";

export default defineConfig({
  testDir: "ui",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `node ${join("..", "..", "scripts", "dev-fake.mjs")}`,
    url: `http://localhost:${WEB_PORT}/`,
    timeout: 180_000,
    reuseExistingServer: false,
    // dev-fake.mjs runs gateway and web in their own process groups; SIGTERM lets it kill both trees.
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    stdout: "ignore",
    stderr: "pipe",
    env: {
      GATEWAY_PORT: String(GATEWAY_PORT),
      WEB_PORT: String(WEB_PORT),
      // The test drives its own replays; keep the background one out of the way.
      REPLAY_EVERY_MS: "3600000",
      INTERNAL_API_KEY: "dev-fake-internal-key",
    },
  },
});
