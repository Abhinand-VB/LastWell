import Fastify, { type FastifyInstance } from "fastify";
import { VERSION } from "@lastwell/core";

export interface AppOptions {
  logLevel: string;
}

export function buildApp(opts: AppOptions): FastifyInstance {
  const app = Fastify({ logger: { level: opts.logLevel } });
  const bootedAt = Date.now();

  app.get("/healthz", async () => ({
    ok: true,
    uptimeS: Math.round((Date.now() - bootedAt) / 1000),
    liveCalls: 0,
    cartesia: "ok" as const,
    version: VERSION,
  }));

  return app;
}
