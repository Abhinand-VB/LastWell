// pino JSON logs (docs/01 §10). Every per-call line carries callId (and alertId when relevant);
// timings are integer ms under `ms`.
import pino, { type Logger } from "pino";

export function createLogger(level: string): Logger {
  return pino({ level, base: { svc: "gateway" } });
}

export type { Logger };
