// Test helpers: a gateway with every service faked (no keys, no network).
import pino, { type Logger } from "pino";
import { createFakeModel, type ModelClient } from "@lastwell/core";
import { buildApp, type Gateway } from "./app.js";
import { validateEnv, type Env } from "./env.js";
import { createLogger } from "./log.js";
import type { Services } from "./services.js";
import { MemoryStore } from "./store/memory.js";
import type { Store } from "./store/types.js";
import { fakeSttFactory } from "./stt/sessions.js";
import { FakeTts } from "./tts/sonic.js";
import { FakeTtsStream } from "./tts/sonicWs.js";
import { FAKE_ACCOUNT_SID, FakeTelephony } from "./twilio/fake.js";

export const KEY = "test-internal-key";
export const ALLOWED = "+14155550100";
export const NOT_ALLOWED = "+14155550123";

export function testEnv(over: Record<string, string> = {}): Env {
  const r = validateEnv({
    PUBLIC_BASE_URL: "https://gw.example.test",
    INTERNAL_API_KEY: KEY,
    LASTWELL_FAKES: "all",
    ALERT_ALLOWED_NUMBERS: ALLOWED,
    ALERT_DEFAULT_TARGET_PHONE: ALLOWED,
    TWILIO_PHONE_NUMBER: "+14155550199",
    DISPATCHER_PHONE: "+14155550101",
    LOG_LEVEL: "silent",
    ...over,
  });
  if (r.env === null) throw new Error(r.problems.join("; "));
  return r.env;
}

export interface TestGateway extends Gateway {
  telephony: FakeTelephony;
  tts: FakeTts;
  store: Store;
}

/** A logger whose JSON lines are kept in `events` (for asserting `event`/`ms` log fields). */
export function captureLog(): { log: Logger; events: Array<Record<string, unknown>> } {
  const events: Array<Record<string, unknown>> = [];
  const log = pino({ level: "info" }, { write: (line: string) => void events.push(JSON.parse(line) as Record<string, unknown>) });
  return { log, events };
}

export function testGateway(
  opts: { env?: Record<string, string>; model?: ModelClient; telephonySpeed?: number; store?: Store; stt?: Services["stt"]; log?: Logger } = {},
): TestGateway {
  const env = testEnv(opts.env);
  const telephony = new FakeTelephony(env.ALERT_ALLOWED_NUMBERS, opts.telephonySpeed ?? 50);
  const tts = new FakeTts();
  const store = opts.store ?? new MemoryStore();
  const services: Services = {
    model: opts.model ?? createFakeModel(),
    stt: opts.stt ?? fakeSttFactory,
    tts,
    ttsStream: () => new FakeTtsStream(),
    telephony,
    store,
    expectedAccountSid: FAKE_ACCOUNT_SID,
  };
  const gw = buildApp(env, services, opts.log ?? createLogger("silent"));
  return { ...gw, telephony, tts, store };
}

export const auth = { "x-internal-key": KEY };

export async function until(cond: () => boolean, ms = 3000): Promise<void> {
  const t = Date.now();
  while (!cond()) {
    if (Date.now() - t > ms) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 5));
  }
}
