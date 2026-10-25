// The only place the gateway reads process.env (CLAUDE.md, docs/01 §8). The repo-root `.env` is loaded
// when present; variables already set in the environment win. Fakes (D-34, docs/10 §4) relax which
// secrets are required; DEMO_MODE=true refuses any fake.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { DEFAULT_KEYTERMS } from "@lastwell/stt";

const ROOT_ENV = fileURLToPath(new URL("../../../.env", import.meta.url));

export const FAKEABLE = ["claude", "stt", "tts", "twilio", "store"] as const;
export type Fakeable = (typeof FAKEABLE)[number];

const E164 = z.string().regex(/^\+[1-9]\d{6,14}$/, "must be E.164, e.g. +14155550100");
const bool = (d: boolean) =>
  z
    .enum(["true", "false", "1", "0"])
    .default(d ? "true" : "false")
    .transform((v) => v === "true" || v === "1");
const Effort = z.enum(["low", "medium", "high"]);

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  PUBLIC_BASE_URL: z
    .string()
    .url()
    .transform((s) => s.replace(/\/+$/, "")),
  INTERNAL_API_KEY: z.string().min(8, "set a long random string (openssl rand -hex 32)"),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: E164.optional(),
  DISPATCHER_PHONE: E164.optional(),
  TWILIO_VALIDATE_SIGNATURE: bool(true),

  CARTESIA_API_KEY: z.string().optional(),
  CARTESIA_VERSION: z.string().default("2026-08-14"),
  CARTESIA_STT_MODEL: z.string().default("ink-2"),
  CARTESIA_TTS_MODEL: z.string().default("sonic-3.6"),
  CARTESIA_VOICE_ID: z.string().default("db6b0ed5-d5d3-463d-ae85-518a07d3c2b4"),
  STT_DISPATCHER_TRACK: bool(true),
  STT_KEYTERMS: z
    .string()
    .default(DEFAULT_KEYTERMS)
    .transform((s) => s.split(",").map((x) => x.trim()).filter((x) => x !== "")),

  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_FAST_MODEL: z.string().default("claude-haiku-5-5"),
  CLAUDE_REASONER_MODEL: z.string().default("claude-sonnet-5-5"),
  CLAUDE_QA_MODEL: z.string().default("claude-haiku-5-5"),
  CLAUDE_FAST_EFFORT: Effort.default("low"),
  CLAUDE_REASONER_EFFORT: Effort.default("medium"),

  REASONER_INTERVAL_MS: z.coerce.number().int().positive().default(10_000),
  LIKELY_MIN_DISTINCT_SIGNS: z.coerce.number().int().min(1).default(2),
  CALL_TIMEZONE: z.string().default("America/Los_Angeles"),
  EVAL_SCRIPTS_DIR: z.string().default("../eval/scripts"),

  CONVEX_URL: z.string().url().optional(),

  ALERT_SMS_ENABLED: bool(false),
  DEMO_ALERT_TO_CALLER: bool(false),
  ALERT_DEFAULT_TARGET_PHONE: E164.optional(),
  ALERT_ALLOWED_NUMBERS: z
    .string()
    .default("")
    .transform((s) => s.split(",").map((x) => x.trim()).filter((x) => x !== ""))
    .pipe(z.array(E164)),
  /** D-43: `local` synthesizes the briefing but places no call; the browser plays it (fallback). */
  ALERT_DELIVERY: z.enum(["phone", "local"]).default("phone"),
  FEATURE_QA_ENABLED: bool(false),
  FEATURE_BROWSER_MIC: bool(true),

  LASTWELL_FAKES: z.string().default(""),
  DEMO_MODE: bool(false),
});

type Parsed = z.infer<typeof EnvSchema>;
export type Env = Omit<Parsed, "LASTWELL_FAKES"> & { fakes: ReadonlySet<Fakeable> };

export function parseFakes(raw: string): { fakes: Set<Fakeable>; unknown: string[] } {
  const fakes = new Set<Fakeable>();
  const unknown: string[] = [];
  for (const item of raw.split(",").map((s) => s.trim().toLowerCase()).filter((s) => s !== "")) {
    if (item === "all") FAKEABLE.forEach((f) => fakes.add(f));
    else if ((FAKEABLE as readonly string[]).includes(item)) fakes.add(item as Fakeable);
    else unknown.push(item);
  }
  return { fakes, unknown };
}

/** Returns the env or the list of problems (each names the variable). Pure: no process access. */
export function validateEnv(source: NodeJS.ProcessEnv): { env: Env; problems: [] } | { env: null; problems: string[] } {
  // Empty strings mean "unset" (the .env template leaves optional values blank).
  const clean = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ""));
  const r = EnvSchema.safeParse(clean);
  if (!r.success) return { env: null, problems: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const { LASTWELL_FAKES, ...rest } = r.data;
  const { fakes, unknown } = parseFakes(LASTWELL_FAKES);
  const problems: string[] = unknown.map((u) => `LASTWELL_FAKES: unknown item "${u}" (use ${FAKEABLE.join(", ")} or all)`);
  if (rest.DEMO_MODE && fakes.size > 0) {
    problems.push(`DEMO_MODE=true refuses fakes, but LASTWELL_FAKES=${[...fakes].join(",")} (empty it for the demo)`);
  }
  const need = (name: keyof Parsed, when: boolean, why: string) => {
    if (when && rest[name as keyof typeof rest] === undefined) problems.push(`${name}: required (${why})`);
  };
  const real = (f: Fakeable) => !fakes.has(f);
  need("TWILIO_ACCOUNT_SID", real("twilio"), "twilio is not faked");
  need("TWILIO_AUTH_TOKEN", real("twilio"), "twilio is not faked");
  need("TWILIO_PHONE_NUMBER", real("twilio"), "twilio is not faked");
  need("DISPATCHER_PHONE", real("twilio"), "twilio is not faked");
  if (real("twilio") && rest.ALERT_ALLOWED_NUMBERS.length === 0) {
    problems.push("ALERT_ALLOWED_NUMBERS: required when twilio is not faked (D-35)");
  }
  need("CARTESIA_API_KEY", real("stt") || real("tts"), "stt or tts is not faked");
  need("ANTHROPIC_API_KEY", real("claude"), "claude is not faked");
  need("CONVEX_URL", real("store"), "store is not faked");
  if (problems.length > 0) return { env: null, problems };
  return { env: { ...rest, fakes }, problems: [] };
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env, loadFile = true): Env {
  if (loadFile && existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV);
  const r = validateEnv(source);
  if (r.env === null) {
    console.error(`Invalid gateway environment (see .env.example, docs/01 §8):\n${r.problems.map((p) => `  ${p}`).join("\n")}`);
    process.exit(1);
  }
  return r.env;
}
