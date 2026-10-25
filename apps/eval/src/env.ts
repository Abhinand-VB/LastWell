// The eval runner's environment, read once and validated (docs/01 §8). The repo-root `.env` is loaded
// when present; variables already set in the shell win.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const ROOT_ENV = fileURLToPath(new URL("../../../.env", import.meta.url));

const Effort = z.enum(["low", "medium", "high"]);

export const EvalEnv = z.object({
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_FAST_MODEL: z.string().default("claude-haiku-5-5"),
  CLAUDE_REASONER_MODEL: z.string().default("claude-sonnet-5-5"),
  CLAUDE_QA_MODEL: z.string().default("claude-haiku-5-5"),
  CLAUDE_FAST_EFFORT: Effort.default("low"),
  CLAUDE_REASONER_EFFORT: Effort.default("medium"),
  CALL_TIMEZONE: z.string().default("America/Los_Angeles"),
  LIKELY_MIN_DISTINCT_SIGNS: z.coerce.number().int().min(1).default(2),
  EVAL_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
});
export type EvalEnv = z.infer<typeof EvalEnv>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env, loadFile = true): EvalEnv {
  if (loadFile && existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV);
  // Empty strings mean "unset" (the .env template leaves optional values blank).
  const clean = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ""));
  const r = EvalEnv.safeParse(clean);
  if (!r.success) {
    const lines = r.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid eval environment:\n${lines.join("\n")}`);
  }
  return r.data;
}

/** docs/07 §6 item 5: a live run refuses to start without a key. */
export function requireApiKey(env: EvalEnv): string {
  if (env.ANTHROPIC_API_KEY === undefined || env.ANTHROPIC_API_KEY.trim() === "") {
    throw new Error(
      "ANTHROPIC_API_KEY is not set: put it in the repo-root .env (see .env.example), or run offline with --model fake.",
    );
  }
  return env.ANTHROPIC_API_KEY;
}
