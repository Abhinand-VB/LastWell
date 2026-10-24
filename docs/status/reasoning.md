# Status: reasoning lane

Only the reasoning session edits this file.

## Current task
- R-03 Claude client + fast pass

## Last green commit on version1
- X-01a fake model (see below)

## Acceptance evidence (pasted command output per task)

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
-

## Blockers for humans
-

## Notes and small decisions
- `ModelResult.output` is null on refusal / max_tokens / unparseable output; transport errors (timeout after the one retry, 429, 5xx) are thrown (docs/04 §1).
- `ReasonerInput.callStartedAt` / `now` are `Date`s and `timezone` is IANA; the user-message builder formats them (docs/04 §3).
- The fake reasoner returns no signs/facts of its own (the fake fast pass already extracted them); it proposes level, look-alikes, next question (via the docs/03 §9 ladder) and summary.
- `runScript` lives in core (no I/O beyond the injected ModelClient) rather than `apps/eval/src/scriptedRunner.ts` (docs/07 §5), so the X-01a test can use it; apps/eval imports it.
