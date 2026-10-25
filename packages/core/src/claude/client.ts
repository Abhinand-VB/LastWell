// Shared Claude client (docs/04 §1) and the real ModelClient (docs/10 §4.1). core reads exactly two
// env vars here: ANTHROPIC_API_KEY and CLAUDE_TIMEOUT_MS; models and effort arrive as ClaudeConfig.
// Never pass temperature / top_p / top_k (API 2026-10-21 rejects them).
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod/v4";
import { FastPassOutput, QaOutput, ReasonerOutput } from "../contracts/index.js";
import { FAST_PASS_SYSTEM, buildFastPassUser } from "../prompts/fastPass.js";
import { QA_SYSTEM, buildQaUser } from "../prompts/qa.js";
import { REASONER_SYSTEM, buildReasonerUser } from "../prompts/reasoner.js";
import type { ModelClient, ModelResult } from "./types.js";

export type Effort = "low" | "medium" | "high";

export interface ClaudeConfig {
  fastModel: string; // CLAUDE_FAST_MODEL, claude-haiku-5-5
  reasonerModel: string; // CLAUDE_REASONER_MODEL, claude-sonnet-5-5
  qaModel: string; // CLAUDE_QA_MODEL, claude-haiku-5-5
  fastEffort: Effort; // CLAUDE_FAST_EFFORT, low
  reasonerEffort: Effort; // CLAUDE_REASONER_EFFORT, medium
  /** Injected for tests (stubbed transport); defaults to createAnthropic(). */
  anthropic?: Anthropic;
  /** Called after every response (logging, R-10 latency and cache measurements). */
  onResponse?: (info: ResponseInfo) => void;
}

export interface ResponseInfo {
  pass: "fast" | "reasoner" | "qa";
  model: string;
  ms: number;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export const DEFAULT_CLAUDE_CONFIG: Omit<ClaudeConfig, "anthropic"> = {
  fastModel: "claude-haiku-5-5",
  reasonerModel: "claude-sonnet-5-5",
  qaModel: "claude-haiku-5-5",
  fastEffort: "low",
  reasonerEffort: "medium",
};

export const MAX_TOKENS = { fast: 1024, reasoner: 8192, qa: 512 } as const;

/** The SDK client: 8 s timeout (CLAUDE_TIMEOUT_MS) and one retry. `fetch` is for tests only. */
export function createAnthropic(opts: { fetch?: typeof fetch; apiKey?: string } = {}): Anthropic {
  return new Anthropic({
    apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY,
    timeout: Number(process.env.CLAUDE_TIMEOUT_MS ?? 8000),
    maxRetries: 1,
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
  });
}

export interface ParseArgs<T extends z.ZodType> {
  pass: ResponseInfo["pass"];
  model: string;
  system: string;
  user: string;
  schema: T;
  maxTokens: number;
  effort: Effort;
  /** Only honoured for Haiku models (G-25: Sonnet 5.5 rejects `disabled`; it keeps adaptive thinking). */
  disableThinking: boolean;
  onResponse?: ClaudeConfig["onResponse"];
}

/** Haiku 5.5 allows thinking disabled at effort ≤ high; every other model omits `thinking` (adaptive). */
export function thinkingParam(model: string, disable: boolean): { thinking?: { type: "disabled" } } {
  return disable && /haiku/i.test(model) ? { thinking: { type: "disabled" } } : {};
}

/**
 * One structured-output call. Transport errors (timeout after the retry, 429, 5xx) throw; a refusal,
 * max_tokens stop (G-23) or unparseable output returns `output: null` with the matching flag.
 */
export async function parseJson<T extends z.ZodType>(anthropic: Anthropic, args: ParseArgs<T>): Promise<ModelResult<z.infer<T>>> {
  const format = zodOutputFormat(args.schema);
  const t0 = performance.now();
  const res = await anthropic.messages.create({
    model: args.model,
    max_tokens: args.maxTokens,
    system: [{ type: "text", text: args.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: args.user }],
    output_config: { format, effort: args.effort },
    ...thinkingParam(args.model, args.disableThinking),
  });
  const ms = Math.round(performance.now() - t0);
  args.onResponse?.({
    pass: args.pass,
    model: args.model,
    ms,
    stopReason: res.stop_reason,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
    cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
  });
  if (res.stop_reason === "refusal") return { output: null, ms, refused: true };
  if (res.stop_reason === "max_tokens") return { output: null, ms, truncated: true };
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    return { output: format.parse(text), ms };
  } catch {
    return { output: null, ms };
  }
}

/** docs/10 §4.1: the real ModelClient. */
export function createClaudeClient(config: ClaudeConfig): ModelClient {
  const anthropic = config.anthropic ?? createAnthropic();
  const onResponse = config.onResponse;
  return {
    fastPass: (input) =>
      parseJson(anthropic, {
        pass: "fast",
        onResponse,
        model: config.fastModel,
        system: FAST_PASS_SYSTEM,
        user: buildFastPassUser(input.utteranceText, input.prevDispatcherText),
        schema: FastPassOutput,
        maxTokens: MAX_TOKENS.fast,
        effort: config.fastEffort,
        disableThinking: true,
      }),
    reason: (input) =>
      parseJson(anthropic, {
        pass: "reasoner",
        onResponse,
        model: config.reasonerModel,
        system: REASONER_SYSTEM,
        user: buildReasonerUser(input),
        schema: ReasonerOutput,
        maxTokens: MAX_TOKENS.reasoner,
        effort: config.reasonerEffort,
        disableThinking: false,
      }),
    answer: (input) =>
      parseJson(anthropic, {
        pass: "qa",
        onResponse,
        model: config.qaModel,
        system: QA_SYSTEM,
        user: buildQaUser(input),
        schema: QaOutput,
        maxTokens: MAX_TOKENS.qa,
        effort: "low",
        disableThinking: true,
      }),
  };
}

/**
 * G-21: the first use of each output schema compiles a grammar (cached 24 h). The gateway calls this
 * once at boot so the first live utterance does not pay for it. Errors are returned, never thrown.
 */
export async function warmup(model: ModelClient, opts: { qa?: boolean } = {}): Promise<{ pass: string; ms: number; error: string | null }[]> {
  const now = new Date();
  const state = {
    callId: "00000000-0000-4000-8000-000000000000",
    version: 0,
    level: "none" as const,
    modelLevel: "none" as const,
    signs: [],
    facts: [],
    lkw: null,
    lookalikes: [],
    nextQuestion: null,
    summary: null,
    reasonerQuestion: null,
    droppedCount: 0,
    warnings: [],
    latency: { fastPassMs: null, reasonerMs: null, sttMs: null },
    updatedAt: now.toISOString(),
  };
  const u = { id: "00000000-0000-4000-8000-000000000001", callId: state.callId, seq: 1, speaker: "caller" as const, text: "Hello?", tStartMs: 0, tEndMs: 500 };
  const calls: [string, () => Promise<ModelResult<unknown>>][] = [
    ["fast", () => model.fastPass({ utteranceText: "Hello?", prevDispatcherText: null })],
    ["reasoner", () => model.reason({ utterances: [u], state, callStartedAt: now, now, timezone: "America/Los_Angeles" })],
  ];
  // R-08: the Q&A schema compiles on first use too (first live answer 2374 ms vs ≈1.4 s warm).
  if (opts.qa) calls.push(["qa", () => model.answer({ questionText: "Hello?", utterances: [u], state, now, timezone: "America/Los_Angeles" })]);
  return Promise.all(
    calls.map(async ([pass, f]) => {
      try {
        const r = await f();
        return { pass, ms: r.ms, error: null };
      } catch (e) {
        return { pass, ms: 0, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
}
