import { warmup } from "@lastwell/core";
import { buildApp } from "./app.js";
import { loadEnv } from "./env.js";
import { createLogger } from "./log.js";
import { createServices } from "./services.js";

const env = loadEnv();
const log = createLogger(env.LOG_LEVEL);

// Last line of defense (docs/05 §9): log and keep the process alive.
process.on("uncaughtException", (err) => log.error({ event: "process.uncaught", err: err.stack }, "uncaught exception"));
process.on("unhandledRejection", (err) => log.error({ event: "process.unhandled", err: err instanceof Error ? err.stack : String(err) }, "unhandled rejection"));

const services = createServices(env, log);
const { app } = buildApp(env, services, log);

if (env.fakes.size > 0) {
  const line = `FAKES ACTIVE: ${[...env.fakes].join(", ")} — not for the demo (DEMO_MODE=true refuses this)`;
  console.error(`\x1b[41m\x1b[97m ${line} \x1b[0m`);
  log.warn({ event: "fakes.active", fakes: [...env.fakes] }, line);
}

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  log.info({ event: "server.listening", port: env.PORT, store: services.store.kind }, `listening on ${env.PORT}`);
} catch (err) {
  log.fatal({ event: "server.listen_failed", err }, "listen failed");
  process.exit(1);
}

if (!env.fakes.has("claude")) {
  const t = Date.now();
  void warmup(services.model).then((r) => log.info({ event: "claude.warmup", ms: Date.now() - t, passes: r }, "claude warmup"));
}

const shutdown = () => {
  void app.close().finally(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
