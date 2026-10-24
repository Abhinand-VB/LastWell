import { buildApp } from "./app.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const app = buildApp({ logLevel: env.LOG_LEVEL });

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info({ event: "server.listening", port: env.PORT }, `listening on ${env.PORT}`);
} catch (err) {
  app.log.fatal({ event: "server.listen_failed", err }, "listen failed");
  process.exit(1);
}
