# Status: reasoning lane

Only the reasoning session edits this file.

## Current task
- E-03 Full text run → slide

## Last green commit on version1
- R-10 latency bench (see below)

## Acceptance evidence (pasted command output per task)

### R-10 Prompt caching + latency tuning — done 2026-10-25
- `ClaudeConfig.onResponse` reports pass, ms, stop reason, input/output and cache read/write tokens (the gateway can log it per call). Bench: `apps/eval/src/latency.ts` (sequential live calls, A01/B01/C01 inputs; reasoner inputs are the transcripts cut after 4, 6, 8 … turns with the fake pipeline's state).
- `cd apps/eval && npx tsx src/latency.ts --n 20` → 2 m 32 s, 60 calls, 0 errors:
  ```
  | Pass | n | p50 | p95 | max | errors | stop≠end_turn | input tok p50 | cache read tok (total) |
  | fast pass claude-haiku-5-5 @low | 20 | 1335 ms | 2480 ms | 4460 ms | 0 | 0 | 85.5 | 38340 |
  | reasoner claude-sonnet-5-5 @medium | 20 | 2798 ms | 3242 ms | 3261 ms | 0 | 0 | 397 | 57540 |
  | reasoner claude-sonnet-5-5 @low | 20 | 2914 ms | 3754 ms | 6495 ms | 0 | 0 | 397 | 57540 |
  ```
- Caching works as shipped (`cache_control` on the system block): every call reads the system prompt from cache (≈1.9k tokens fast pass, ≈2.9k reasoner); only the user message is uncached.
- Chosen defaults: unchanged — `CLAUDE_FAST_EFFORT=low`, `CLAUDE_REASONER_EFFORT=medium` (already in `.env.example`); `low` is not faster for the reasoner here, so medium keeps the better reasoning. `CLAUDE_TIMEOUT_MS=8000` covers the reasoner's p95 (3.2 s) with margin; the one 12.4 s reasoner call seen in E-01 ran under eval concurrency 2.

### E-01 Runner: text mode + scoring + table — done 2026-10-25
- Files: `apps/eval/src/{run,score,report,env}.ts`; the scripted runner is `runScript` in `@lastwell/core` (X-01a). `--model live|fake` (default live), `--ids`, `--out`; `--mode audio` refused (D-33); hard_audio scripts skipped with a log line; 429 → 10 s back-off once (G-28); `EVAL_CONCURRENCY` bounds parallel scripts; results JSON in `apps/eval/results/` (gitignored); the runner throws if any shown quote is not in the script (invented must be 0).
- Item 5: `requireApiKey` refuses with "ANTHROPIC_API_KEY is not set: put it in the repo-root .env …, or run offline with --model fake." (unit test).
- Item 4: baseline records identical across two runs over all 20 scripts (unit test).
- Item 1, live: `pnpm --filter @lastwell/eval eval --mode text --ids A01,B01,C01` → **1 m 12 s**, no NaN, 0 model errors:
  ```
  | Sensitivity @possible (n=2) | 2/2 (100%) | 0/2 (0%) |
  | Sensitivity @likely | 1/2 (50%) | — |
  | Precision @possible (flags=3) | 2/3 (67%) | 0/0 (—) |
  | Precision @likely | 1/1 (100%) | — |
  | Median seconds to first flag | 7 s | — |
  | LKW correct (n=3 with truth) | 3/3 | — |
  | Blood thinner correct (n=2) | 2/2 | — |
  | Invented facts shown | 0 | — |
  | Dropped by validator | 2 items | — |
  | Wrong facts | 0 | — |
  | Level agreement (n=3) | 3/3 (100%) | — |
  Median latency: fast pass 1937 ms, reasoner 3708 ms.
  A01 likely (speech, arms; first flag 11 s; LKW 2:00 PM; Eliquis) · B01 possible (balance, eyes; 3 s; 6:50 PM; none) · C01 possible (speech; low blood sugar)
  ```
  The 2 drops are B01 reasoner LKW items whose phrase was not inside its quote (the fast pass had already set the LKW). One A01 reasoner call took 12.4 s (likely an 8 s timeout + retry) → R-10.
- Item 2 (all 20, live) is E-03.
- Fake model over all 20 (offline): sens@possible 11/12, precision@possible 11/15, level agreement 16/20, invented 0.

### R-03 Claude client + fast pass / R-06 Reasoner wrapper — code landed; live mostly green, one prompt blocker
- `createClaudeClient(config)` in `packages/core/src/claude/client.ts` implements `ModelClient` (fast pass, reasoner, Q&A call). Prompts verbatim in `src/prompts/{fastPass,reasoner,qa}.ts` with the docs/04 user-message builders; `warmup(model)` for G-21.
- Offline (`client.test.ts`, stubbed `fetch` transport, 12 tests): system prompts equal docs/04 byte for byte; fast pass = `claude-haiku-5-5`, `max_tokens` 1024, `thinking {type:"disabled"}`, `output_config {effort:"low", format: json_schema, additionalProperties:false}`, system block with `cache_control: ephemeral`; reasoner = `claude-sonnet-5-5`, 8192, no `thinking` (adaptive), effort `medium`; Q&A = haiku, 512, disabled; no `temperature`/`top_p`/`top_k`/`output_format` in any body; refusal / max_tokens / unparseable → `output: null`; HTTP errors throw; reasoner user message equals the docs/04 §3 template.
- Live run 1 (2026-10-25 ~01:00 PT, `pnpm --filter @lastwell/core test:live`): 31 passed, 3 failed.
  - Fast pass rows 2, 3, 4, 6 pass; latencies 921, 1020, 1119, 1446, 1487, 3078 ms → **median 1283 ms < 1500** (the 3078 ms is the first call: grammar compile, G-21).
  - Row 1: signs speech + arms ✓, LKW "Since lunch" ✓, but sex quoted as `"he"` → validator drop (too_short). Row 5: model returned no sex fact. → blocker below (prompt wording).
  - Reasoner A01: `likely`, speech + arms validated, LKW phrase "fine at about 2 PM", blood thinner "Eliquis", next `face`, **6134 ms < 7000**. ✓
  - Reasoner C01: `possible`, lookalikes[0] "low blood sugar". ✓ (3823 ms)
  - Reasoner B01 on all 12 turns: `possible`, balance + eyes ✓, but next `speech` (the dispatcher had already checked face and arms). Reading taken: TASKS says "all turns" only for A01, so the B01 live test now runs the first 6 turns (through the LKW answer, before the face/arm checks). Re-run pending within budget.

### X-01a ModelClient interface + fake model — done 2026-10-25
- Interface landed first at 92a9b96: `packages/core/src/claude/types.ts` (`ModelClient`, `ModelResult`, `FastPassInput`, `ReasonerInput`, `QaInput`), exported from `@lastwell/core`.
- `createFakeModel(opts?)` in `packages/core/src/claude/fake.ts` (phrase table per BE-FAST kind, regex facts, cue-word look-alikes, ladder-based next question, Q&A from validated facts). Every quote is a regex match on the original utterance, so it is an exact substring.
- `runScript(script, model, {timezone})` in `packages/core/src/eval/scriptedRunner.ts` (docs/07 §5 text mode: virtual clock, reasoner on new sign/key fact, every 3rd utterance and at the end). Shared by the X-01a test and E-01.
- `npx vitest run src/claude/fake.test.ts` → 12 passed:
  - docs/04 §2 fast-pass fixture table: all 6 rows.
  - A01 → `likely`, chips speech + arms with verbatim quotes, first likely at 11 s (the "coffee cup" turn), LKW `2:00 PM (1:45–2:15 PM)` beside "He was fine at about 2 PM", blood thinner `Eliquis` / "he takes Eliquis" (rows 2–3).
  - A01 banner: "Ask: what time exactly was he last seen completely normal?" at 11 s, then the blood-thinner question at 30 s (row 4).
  - B01 → `possible`, balance + eyes, banner kind `face` (row 9). C01 → `possible`, look-alike `low blood sugar` resolved by diabetes = "diabetic" (row 9).
  - A01/B01/C01 final states equal the docs/03 `caseState.*.json` fixtures on level, signs (kind + quote), LKW display/confidence, look-alikes, nextQuestion, reasonerQuestion, droppedCount 0 and fact kind=value (C01 diabetes value is "diabetic" vs the fixture's "diabetic, skipped dinner").
- Fake over all 20 scripts (informational): level matches truth on 15/20; misses are paraphrases outside the phrase table (A04, A06, B04, C02 speech). It is a fake: good enough for demo/dev, not a measure.
- `pnpm verify` → green (core 203 tests, eval 43, gateway 5; 20 scripts valid).

## blocked-keys (exact command to run once keys exist)
-

## wired-to-fake (replace when the named task lands)
-

## Requests to other lanes
- [ ] to voice: `GET /api/config` must return `alertDefaultTargetPhone` (`ALERT_DEFAULT_TARGET_PHONE` or null); the field is now required in `ConfigResponse` (D-39, screens request).
- [ ] to screens: `ConfigResponse` now has `alertDefaultTargetPhone: E164 | null` (D-39); `WebConfig`'s `.extend` in `apps/web/lib/config.ts` can be dropped.

## Handled requests from other lanes
- [x] from screens: `alertDefaultTargetPhone` in `ConfigResponse` (D-39) — see commit "reasoning: D-39 …".

## Blockers for humans
- [ ] R-03 · Fast-pass prompt (docs/04 §2) lists "he"/"she" as sex evidence and asks for "the shortest verbatim span", so the model quotes `"he"` (2 characters), which the quote validator always drops (needs ≥ 3). Proposed wording change (docs/04 §6 protocol, bump to `fast-2`): in the `sex:` line, replace "(father, husband, he, mom, wife, she)" with "(father, husband, mom, wife, or a pronoun quoted with its next word, e.g. "his chest", "she says"; a quote must be at least 3 characters)". Not on the demo path (A01's sex comes from "my father"). Meanwhile: test left strict, rows 1 and 5 fail live on the sex item only.

## Notes and small decisions
- `ModelResult.output` is null on refusal / max_tokens / unparseable output; transport errors (timeout after the one retry, 429, 5xx) are thrown (docs/04 §1).
- `ReasonerInput.callStartedAt` / `now` are `Date`s and `timezone` is IANA; the user-message builder formats them (docs/04 §3).
- The fake reasoner returns no signs/facts of its own (the fake fast pass already extracted them); it proposes level, look-alikes, next question (via the docs/03 §9 ladder) and summary.
- `runScript` lives in core (no I/O beyond the injected ModelClient) rather than `apps/eval/src/scriptedRunner.ts` (docs/07 §5), so the X-01a test can use it; apps/eval imports it.
