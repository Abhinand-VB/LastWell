// R-03 / R-06 offline: request shapes through a stubbed SDK transport (no network, no key needed).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CaseState, initialCaseState, type Utterance } from "../contracts/index.js";
import { FAST_PASS_SYSTEM } from "../prompts/fastPass.js";
import { QA_SYSTEM } from "../prompts/qa.js";
import { REASONER_SYSTEM, buildReasonerUser, lkwLine } from "../prompts/reasoner.js";
import { DEFAULT_CLAUDE_CONFIG, createAnthropic, createClaudeClient, warmup } from "./client.js";

const DOC = readFileSync(fileURLToPath(new URL("../../../../docs/04-PROMPTS.md", import.meta.url)), "utf8");
const FIXTURES = fileURLToPath(new URL("../fixtures/", import.meta.url));

interface Captured {
  url: string;
  body: Record<string, unknown>;
}

function stub(reply: { stop_reason?: string; text?: string; status?: number }): { fetch: typeof fetch; calls: Captured[] } {
  const calls: Captured[] = [];
  const f = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    if (reply.status !== undefined && reply.status !== 200) {
      return new Response(JSON.stringify({ type: "error", error: { type: "api_error", message: "boom" } }), {
        status: reply.status,
        headers: { "content-type": "application/json" },
      });
    }
    const message = {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "stub",
      content: [{ type: "text", text: reply.text ?? "" }],
      stop_reason: reply.stop_reason ?? "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 },
    };
    return new Response(JSON.stringify(message), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetch: f as typeof fetch, calls };
}

function client(reply: Parameters<typeof stub>[0]) {
  const s = stub(reply);
  const anthropic = createAnthropic({ fetch: s.fetch, apiKey: "test-key" });
  return { model: createClaudeClient({ ...DEFAULT_CLAUDE_CONFIG, anthropic }), calls: s.calls };
}

const NO_SAMPLING = ["temperature", "top_p", "top_k"];

const FAST_OK = JSON.stringify({ signs: [{ kind: "speech", quote: "his words come out all mixed up" }], facts: [] });

describe("system prompts are verbatim docs/04", () => {
  it.each([
    ["fastPass", FAST_PASS_SYSTEM],
    ["reasoner", REASONER_SYSTEM],
    ["qa", QA_SYSTEM],
  ])("%s", (_name, text) => {
    expect(DOC).toContain(`\`\`\`\n${text}\n\`\`\``);
  });
});

describe("fast pass request shape (R-03)", () => {
  it("haiku, effort low, thinking disabled, max_tokens 1024, cached system, structured output, no sampling params", async () => {
    const { model, calls } = client({ text: FAST_OK });
    const r = await model.fastPass({ utteranceText: "Since lunch his words come out all mixed up.", prevDispatcherText: "Tell me exactly what happened." });
    expect(r.output?.signs[0]?.kind).toBe("speech");
    expect(r.ms).toBeGreaterThanOrEqual(0);
    expect(calls).toHaveLength(1);
    const b = calls[0]?.body ?? {};
    expect(calls[0]?.url).toMatch(/\/v1\/messages$/);
    expect(b.model).toBe("claude-haiku-5-5");
    expect(b.max_tokens).toBe(1024);
    expect(b.thinking).toEqual({ type: "disabled" });
    expect(b.system).toEqual([{ type: "text", text: FAST_PASS_SYSTEM, cache_control: { type: "ephemeral" } }]);
    const oc = b.output_config as { effort: string; format: { type: string; schema: { additionalProperties: boolean } } };
    expect(oc.effort).toBe("low");
    expect(oc.format.type).toBe("json_schema");
    expect(oc.format.schema.additionalProperties).toBe(false);
    for (const k of NO_SAMPLING) expect(b).not.toHaveProperty(k);
    expect(b).not.toHaveProperty("output_format");
    expect(b.messages).toEqual([
      {
        role: "user",
        content:
          'Dispatcher\'s previous question (context only, never quote it): "Tell me exactly what happened."\nCaller utterance (quote ONLY from this text): "Since lunch his words come out all mixed up."',
      },
    ]);
  });

  it("onResponse reports pass, latency and token usage", async () => {
    const s = stub({ text: FAST_OK });
    const seen: unknown[] = [];
    const model = createClaudeClient({ ...DEFAULT_CLAUDE_CONFIG, anthropic: createAnthropic({ fetch: s.fetch, apiKey: "k" }), onResponse: (i) => seen.push(i) });
    await model.fastPass({ utteranceText: "x", prevDispatcherText: null });
    expect(seen).toEqual([
      expect.objectContaining({ pass: "fast", model: "claude-haiku-5-5", stopReason: "end_turn", inputTokens: 10, outputTokens: 10, cacheReadTokens: 0 }),
    ]);
  });

  it('prev dispatcher text defaults to "(none)"', async () => {
    const { model, calls } = client({ text: FAST_OK });
    await model.fastPass({ utteranceText: "Yes.", prevDispatcherText: null });
    const msgs = calls[0]?.body.messages as { content: string }[];
    expect(msgs[0]?.content).toContain('never quote it): "(none)"');
  });

  it("refusal, max_tokens and unparseable output → output null", async () => {
    expect((await client({ stop_reason: "refusal", text: "" }).model.fastPass({ utteranceText: "x", prevDispatcherText: null })).refused).toBe(true);
    const t = await client({ stop_reason: "max_tokens", text: '{"signs":[' }).model.fastPass({ utteranceText: "x", prevDispatcherText: null });
    expect(t.output).toBeNull();
    expect(t.truncated).toBe(true);
    const bad = await client({ text: '{"signs":[{"kind":"Possible"}]}' }).model.fastPass({ utteranceText: "x", prevDispatcherText: null });
    expect(bad.output).toBeNull();
  });

  it("transport errors throw (the caller logs claude.error and keeps state)", async () => {
    await expect(client({ status: 400 }).model.fastPass({ utteranceText: "x", prevDispatcherText: null })).rejects.toThrow();
  });
});

describe("reasoner request shape (R-06)", () => {
  const A01 = CaseState.parse(JSON.parse(readFileSync(`${FIXTURES}caseState.A01.json`, "utf8")));
  const callId = A01.callId;
  const utts: Utterance[] = [
    { id: "a0100000-0000-4000-8000-000000000001", callId, seq: 1, speaker: "dispatcher", text: "911, what is the address of your emergency?", tStartMs: 0, tEndMs: 2000 },
    { id: "a0100000-0000-4000-8000-000000000002", callId, seq: 2, speaker: "caller", text: "It's 1842 Clement Street, apartment 3. It's my father, he's 78.", tStartMs: 3000, tEndMs: 8000 },
  ];
  const input = {
    utterances: utts,
    state: A01,
    callStartedAt: new Date("2026-10-25T21:47:00Z"),
    now: new Date("2026-10-25T21:47:41Z"),
    timezone: "America/Los_Angeles",
  };
  const REASONER_OK = JSON.stringify({
    level: "likely",
    signs: [],
    last_known_well: null,
    blood_thinner: null,
    other_facts: [],
    lookalikes: [],
    next_question: { kind: "face", text: "Ask the caller to look at his face" },
    summary: "Speech trouble and arm weakness.",
  });

  it("sonnet, effort medium, adaptive thinking (no thinking param), max_tokens 8192, no sampling params", async () => {
    const { model, calls } = client({ text: REASONER_OK });
    const r = await model.reason(input);
    expect(r.output?.level).toBe("likely");
    const b = calls[0]?.body ?? {};
    expect(b.model).toBe("claude-sonnet-5-5");
    expect(b.max_tokens).toBe(8192);
    expect(b).not.toHaveProperty("thinking");
    expect((b.output_config as { effort: string }).effort).toBe("medium");
    expect(b.system).toEqual([{ type: "text", text: REASONER_SYSTEM, cache_control: { type: "ephemeral" } }]);
    for (const k of NO_SAMPLING) expect(b).not.toHaveProperty(k);
  });

  it("user message follows the docs/04 §3 builder", () => {
    expect(buildReasonerUser(input)).toBe(
      [
        "Call started at 2026-10-25 2:47 PM (America/Los_Angeles). Current local time 2026-10-25 2:47 PM.",
        "Current state: level=likely; signs=speech, arms; lkw=2:00 PM (1:45–2:15 PM); blood_thinner=Eliquis; facts=address=1842 Clement Street, apartment 3, sex=male, age=78",
        "",
        "TRANSCRIPT (utterance number, mm:ss, speaker: text)",
        "[1] 00:00 dispatcher: 911, what is the address of your emergency?",
        "[2] 00:03 caller: It's 1842 Clement Street, apartment 3. It's my father, he's 78.",
        "",
        "Return the JSON.",
      ].join("\n"),
    );
  });

  it("lkwLine: unknown / approximate / display", () => {
    expect(lkwLine(null)).toBe("unknown");
    const lkw = A01.lkw;
    if (lkw === null) throw new Error("fixture");
    expect(lkwLine({ ...lkw, confidence: "vague", phrase: "Since lunch" })).toBe('approximate only ("Since lunch") — needs a clock time');
    expect(lkwLine({ ...lkw, note: "ampm_assumed" })).toContain("needs a clock time");
    expect(lkwLine(lkw)).toBe("2:00 PM (1:45–2:15 PM)");
  });

  it("Q&A: haiku, thinking disabled, max_tokens 512; empty state still builds", async () => {
    const { model, calls } = client({ text: JSON.stringify({ known: false, answer: "", evidence: [] }) });
    const r = await model.answer({ questionText: "Any seizure?", utterances: utts, state: initialCaseState(callId, "2026-10-25T14:47:00-07:00"), now: input.now, timezone: input.timezone });
    expect(r.output?.known).toBe(false);
    const b = calls[0]?.body ?? {};
    expect(b.model).toBe("claude-haiku-5-5");
    expect(b.max_tokens).toBe(512);
    expect(b.thinking).toEqual({ type: "disabled" });
    const content = (b.messages as { content: string }[])[0]?.content ?? "";
    expect(content).toContain("- Last known well: not established on the call");
    expect(content).toContain("- Blood thinner: not mentioned");
    expect(content).toContain('NEUROLOGIST\'S QUESTION: "Any seizure?"');
  });

  it("warmup sends one call per pass and never throws", async () => {
    const { model, calls } = client({ status: 500 });
    const r = await warmup(model);
    expect(r.map((x) => x.pass)).toEqual(["fast", "reasoner"]);
    expect(r.every((x) => x.error !== null)).toBe(true);
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });
});
