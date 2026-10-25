# Status: reasoning lane

Only the reasoning session edits this file.

## Current task
- Lane build work done (R-03, R-06, R-08, R-10, E-01, E-03 ×2, X-01a, C-04 fake, D-39/D-45 contracts, D-41c, D-42/D-44/D-46 prompts). Waiting on human answers to the blockers below; both E-03 runs used.

## Last green commit on version1
- 43930b2 (D-46 + R-08)

## Acceptance evidence (pasted command output per task)

### D-46 compact guardrails in the prompts + R-08 Q&A wrapper — 2026-10-25
- `docs/guardrails/call-evidence-rules.model.md`: 911 words (original 2667), one-line rules A–F tagged [Rn], all 30 covered (test checks every rule line ends in [Rn] and R1–R30 all appear), examples mapped to our schema. Prompts: fast pass `fast-4` and reasoner `reasoner-4` = docs/04 base + the whole compact file (generated `prompts/guardrails.ts`, byte-match test), cached system block.
- Latency (R-10 bench, 20 sequential calls each): before (D-44 prompts) fast p50 1147 / p95 1987 ms, reasoner 2852 / 4948; after fast p50 1406 then 1253 (avg +0.18 s ≤ 0.3 s gate → full file for both), p95 2703 / 2339; reasoner 2638 / 3326.
- Live run (with D-40's exact sex line): rows 1, 3, 5 lost the sex fact — row 3 "My wife" had passed in every earlier run.
- Live run (old sex line, 03:10 UTC): fast rows 2, 3, 4, 6 ✓, rows 1 and 5 miss pronoun-only sex (as with fast-1/fast-3); median 1000 ms; reasoner A01 likely 3453 ms, B01 possible/face, C01 low blood sugar ✓.
- Eval `--ids A01,B01,C01,C02,D01` (docs/04 §6): identical to E-03 run 2 for these scripts — level 5/5, LKW 4/4, blood thinner 2/2, 0 drops, 0 wrong, 0 invented; fast p50 1202, reasoner 2936 ms.
- R-08: `qa.live.test.ts` (A01): blood thinners → known, "Yes, he takes Eliquis for his heart.", evidence validates (2374 ms, first call: grammar compile — over the 2 s target); seizure → known false (1222 ms); last normal → "Last seen normal at 2:00 PM, 48 minutes ago…" no parentheses/dashes (1418 ms); address → known, evidence validates (1385 ms). `warmup(model, {qa: true})` now also compiles the Q&A schema. The spoken post-processing (fallback phrase, quote-or-drop, LKW rule) is the gateway's `finalizeQa` (voice). D-41(c) for Q&A: the facts line names an antiplatelet as "none mentioned; takes {value}, an antiplatelet, not a blood thinner" (`qa-2`, offline test); the fake answers likewise. `FEATURE_QA_ENABLED` stays false.

### D-44 Call-evidence hard rules in the prompts (human request) — done 2026-10-25
- Doc copied unchanged: `docs/guardrails/call-evidence-hard-rules.md` (`cmp` identical to the provided file). `packages/core/scripts/gen-guardrails.mjs` generates `src/prompts/guardrails.ts`; `guardrails.test.ts` checks the constants against the doc byte for byte, the docs/04 §1.1 preamble verbatim, and that no "Minimal output" / intro / evidence-notes text reaches a prompt. `cache_control` on the system block unchanged.
- Reasoner `reasoner-3`: base + preamble + sections A–F + worked examples. Fast pass `fast-3`: base + preamble + sections A, C, E (full set measured slower). Q&A unchanged.
- Fast-pass latency bench (`npx tsx src/latency.ts --n 20 --fast-only`, sequential): no rules (R-10) p50 1335 / p95 2480 ms; full A–F + examples p50 1536 / p95 3265 ms; **A, C, E subset p50 1332 / p95 1749 ms**.
- `test:live` (02:47): 34/35; fast median 952 ms; reasoner A01 likely/face 3014 ms, B01 possible/face, C01 possible/low blood sugar. Only failure: row 5 sex fact (the open R-03 item, also failing before).
- **E-03 run 2** (last allowed full run), 20 scripts, 4 m 37 s, 0 model errors — results `apps/eval/results/2026-10-25T01-52-37-926Z-text-live.json`, table `apps/eval/results/E-03-run2-table.md` (rescored after adding "denied" to the scorer's negation words; run 1's table is unchanged by that fix):
  ```
  | Metric | run 1 (fast-1/reasoner-1) | run 2 (fast-3/reasoner-3, guardrails) | baseline |
  | Sensitivity @possible (n=12) | 12/12 | 12/12 | 3/12 |
  | Sensitivity @likely | 6/12 (50%) | 7/12 (58%) | — |
  | Precision @possible (flags=17) | 12/17 (71%) | 12/17 (71%) | 3/6 |
  | Precision @likely | 6/7 (86%) | 7/7 (100%) | — |
  | Median seconds to first flag | 12 s | 12 s | 12 s |
  | LKW correct (n=16) | 16/16 | 16/16 | — |
  | Blood thinner correct (n=8) | 8/8 | 8/8 | — |
  | Invented facts shown | 0 | 0 | — |
  | Dropped by validator | 1 | 0 | — |
  | Wrong facts | 0 | 0 | — |
  | Level agreement (n=20) | 19/20 | 20/20 | — |
  | Median latency fast / reasoner | 1207 / 2861 ms | 1270 / 2916 ms | — |
  ```
  Gate (no regression on sens@possible, LKW, blood thinner, invented; fast p50 ≤ +0.5 s) passed → prompts landed. **Slide numbers: use run 2.** A03 now reaches `likely`; C03 no longer touches `likely`.

### D-41(c) briefing: antiplatelets are named, never "Blood thinner" — done 2026-10-25
- `composeBriefing`: a blood-thinner fact whose value names aspirin, clopidogrel/Plavix, ticagrelor/Brilinta or prasugrel/Effient is spoken as "Takes {value}, per the caller." (docs/05 §7 rule 5); anticoagulants unchanged ("Blood thinner: Eliquis, per the caller."). `isAntiplatelet(value)` is exported from `@lastwell/core`.
- Test "D-41: an antiplatelet is named…": "baby aspirin every day" (A05's live value) → "Takes baby aspirin every day, per the caller.", Plavix, Brilinta likewise, no "blood thinner" anywhere in the text; warfarin still "Blood thinner: warfarin". Briefing tests 13 passed.
- E-03 run 1 rescored with the D-41(a) B08 truth (`--rescore`, no model calls): only level agreement changes, 18/20 → 19/20. Table updated in `apps/eval/results/E-03-run1-table.md`.

### E-03 Full text run → slide — run 1 of 2 done 2026-10-25
- `pnpm --filter @lastwell/eval eval --mode text` → 20 scripts, **4 m 16 s, 0 model errors** (≤ 2 allowed). Results committed: `apps/eval/results/2026-10-24T23-03-14-943Z-text-live.json` and the table `apps/eval/results/E-03-run1-table.md` (rescored after a scorer fix: "does not drink at all" vs truth "doesn't drink" was counted as a wrong fact; `--rescore` re-scores a saved file with no model calls).
- **Slide table** (for Integration / Devpost; footnote "20 scripted calls (text mode), written by the team"):
  ```
  | Metric | LastWell (claude-haiku-5-5 + claude-sonnet-5-5 @medium) | Keyword baseline |
  | Sensitivity @possible (n=12) | 12/12 (100%) | 3/12 (25%) |
  | Sensitivity @likely | 6/12 (50%) | — |
  | Precision @possible (flags=17) | 12/17 (71%) | 3/6 (50%) |
  | Precision @likely | 6/7 (86%) | — |
  | Median seconds to first flag | 12 s | 12 s |
  | LKW correct (n=16 with truth) | 16/16 | — |
  | Blood thinner correct (n=8) | 8/8 | — |
  | Invented facts shown | 0 | — |
  | Dropped by validator | 1 items | — |
  | Wrong facts | 0 | — |
  | Level agreement (n=20) | 19/20 (95%) | — |
  Median latency: fast pass 1207 ms, reasoner 2861 ms.
  ```
- Honest notes for the slide: the 5 non-stroke flags at `possible` are the 5 look-alike scripts C01–C05 (by design: each shows its look-alike panel, e.g. C01 "low blood sugar"); D01, D02, D04 stay `none`. The one non-stroke `likely` is C03 (intoxication, reached likely mid-call, ended `possible`). Level disagreement: A03 ended `possible` (expected likely; the reasoner listed low blood sugar + head injury). Rescored after D-41(a) (B08 truth now `likely`): level agreement 18/20 → 19/20; nothing else changed. Seconds to first flag tie the baseline (12 s) because the baseline only fires on 3 of 12 strokes.

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
  - Reasoner B01 on all 12 turns: `possible`, balance + eyes ✓, but next `speech` (the dispatcher had already checked face and arms). Reading taken: TASKS says "all turns" only for A01, so the B01 live test now runs the first 6 turns (through the LKW answer, before the face/arm checks).
- Live run 2: 32 passed, 3 failed. Fast pass median **1133 ms**; rows 1 and 5 again miss only the sex fact (blocker below). Reasoner B01 (6 turns): `possible`, balance + eyes ✓, next `lkw` ("ask … the exact time they finished dinner") although the state line already showed `lkw=6:50 PM (6:40–7:00 PM)` → blocker below. A01 and C01 ✓ again.
- Demo impact: none. The ladder only takes a reasoner proposal while it is still open; an `lkw` proposal with LKW established falls through to the face check, so the B01 banner is the face question (fake-pipeline test and E-03 run).
- R-03/R-06 status: code done; live acceptance green except the two prompt-wording items below (not re-run further, §7.4 budget).
- Prompt fix attempt (approved by BM via the coordinating session, docs/04 §6), tried as `fast-2` / `reasoner-2`, live run 3 → **not landed, reverted** (prompts stay `fast-1` / `reasoner-1`):
  - fast-2 sex line: "…or a pronoun for the sick person: he, his, him, she, her … quote a pronoun together with the word after it ("he can't", "his chest", "she says"), never "he" or "she" alone". Row 5 fixed (sex male, quote "his chest"); row 1 now returned **no** sex fact; row 3 quoted "My wife is" (valid). Row 2 returned LKW value "about 2 PM" instead of "fine at about 2 PM" (fixture fail; likely run-to-run variance, not caused by the sex line, but it is a failing row). Median latency 1410 ms.
  - reasoner-2: rule 5(a) "when the state line shows a clock time for lkw, last-known-well is settled: do not choose lkw", a new step (c) "if the only signs are balance and/or eyes → face, or arms when face was answered", chameleon line "…the face or arm check the caller has not yet answered". B01 (6 turns) still proposed `lkw` (`possible`, balance + eyes ✓). A01 (`likely`, 3382 ms) and C01 (`possible`, low blood sugar) did not regress.
  - Reading: the reasoner treats "about half an hour ago" (display 6:50 PM, confidence approx) as still needing a clock time despite the wording. A next attempt would have to put the decision in the state line itself (e.g. `lkw=6:50 PM (settled)`), which is a builder change, not just wording. Live budget for this hour is used (3 runs).
- Attempt 2 (approved by BM), live run at 01:46 after the budget reset: `lkwLine` now appends ` (settled)` when LKW is established (docs/04 §3 builder text updated), plus the reasoner-2 wording above with "(settled)" named in rule 5(a), plus a stronger fast-2 sex line ("Output it whenever such a word appears, even in an utterance about symptoms … quote a pronoun together with the word after it ("his words", "his chest")").
  - Reasoner: B01 (6 turns) → `possible`, balance + eyes, **next `face`** ✓; A01 `likely`, 3405 ms, next `face` ✓; C01 `possible`, low blood sugar first ✓ (next `lookalike`). → **`reasoner-2` landed (D-42).**
  - Fast pass: row 1 sex "his words" ✓, row 5 "his chest" ✓, rows 3, 4, 6 ✓, median 1386 ms; but **row 2 returned Eliquis as `medication`, not `blood_thinner`** (a demo fact). → `fast-2` **not adopted**; the fast-pass prompt stays `fast-1`.
  - docs/04 §6 step 3 with reasoner-2 + fast-1: `eval --mode text --ids A01,B01,C01,C02,D01` → level agreement 5/5, LKW 4/4, blood thinner 2/2, 0 drops, 0 errors, invented 0 (same levels as E-03 run 1 on these scripts; reasoner p50 2926 ms). The E-03 slide numbers stand; the second E-03 run stays in reserve.

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
- [ ] to voice: R-08 — call `warmup(model, { qa: true })` at boot when `FEATURE_QA_ENABLED=true` (the first Q&A answer took 2374 ms cold vs ≈1.4 s warm).
- [ ] to screens: D-45 — `ConfigResponse.alertDelivery: "phone" | "local"` is in core; W-12 can read it from `loadConfig()` (I added it to `WebConfig` with default "phone" and to `FALLBACK_CONFIG` and the mock gateway, the minimal consumer edit the contract rule requires).
- [ ] to voice: D-45 — `alertDelivery` is now in `ConfigResponse`; `apps/gateway/src/app.ts` can drop its local `ConfigResponse & { alertDelivery }` type. docs/03 §6 now lists `GET /api/alerts/:alertId/audio` and `POST /api/alerts/:alertId/played` as you implemented them.
- [ ] to screens: D-41(c) — wherever the console or board labels the blood-thinner fact, use `isAntiplatelet(value)` from `@lastwell/core` and show the drug (e.g. "Takes daily aspirin") instead of "Blood thinner: …" for antiplatelets.
- [ ] to voice: `GET /api/config` must return `alertDefaultTargetPhone` (`ALERT_DEFAULT_TARGET_PHONE` or null); the field is now required in `ConfigResponse` (D-39, screens request).
- [ ] to integration: E-03 slide/Devpost numbers are under "E-03" above (and `apps/eval/results/E-03-run1-table.md`); please carry them into docs/08 / the Devpost text with the footnote. `apps/eval/results` is gitignored, so the committed files were added with `git add -f`.
- [ ] to screens: `ConfigResponse` now has `alertDefaultTargetPhone: E164 | null` (D-39); `WebConfig`'s `.extend` in `apps/web/lib/config.ts` can be dropped.

## Handled requests from other lanes
- [x] from integration: D-43 contract additions → D-45 (`alertDelivery`, audio/played rows).
- [x] from integration: D-41(c) composer + rescore → a7703f2.
- [x] from screens: `alertDefaultTargetPhone` in `ConfigResponse` (D-39) — see commit "reasoning: D-39 …".

## Blockers for humans
- [ ] D-40 · The exact D-40 sex line ("quote the phrase that makes it certain, with its context … never a bare pronoun") made the fast pass drop the sex fact even for "My wife" (row 3) in a live run; with the old line row 3 passes. Not adopted; the fast pass keeps the old line (fast-4). Pronoun-only sex (rows 1, 5) still fails with every wording tried. Impact: sex then comes from the reasoner's other_facts or a relation word; the banner falls back to they/their. Decide: accept, or try another wording in a later window.
- [ ] D-46 · Rule R19 (a corrected claim is not emitted again) vs docs/03 §3 (signs are never removed once added): a sign the fast pass took before the caller corrected it stays on the card; the reasoner now omits it but cannot remove it. Decide whether corrections should remove a sign (a reducer + contract change).
- [ ] D-44 · Rule 24 (a wake-up or discovery time is not last-known-well) conflicts with docs/06 R11 (the parser maps "woke up like this" to a vague previous-evening LKW) and with the docs/04 §2 fact list, which names "woke up like this" as a last_known_well phrase. Both texts are sent unchanged; the parser is unchanged. Decide: keep R11 (then drop rule 24's wake-up clause from the prompt) or follow rule 24 (then R11 and the §2 example change).
- [ ] D-44 · Rules 26 and 29 ("must not imply a treatment window", "do not state … a treatment eligibility window") vs the stroke-team board's 4.5 h countdown from LKW (docs/00 scope item 6, acceptance row 8) and the briefing's "N minutes ago". These rules bind the model, which never states a window; the countdown is UI. Confirm the board countdown stays.
- [ ] D-44 · Rule 27 (a possible mimic is a parallel claim, not proof stroke is absent) vs the reasoner's level definition ("likely … and no look-alike explains the whole picture"), under which a look-alike can keep a two-sign call at `possible`. Run 2 shows no case where this lowered a stroke script. Confirm or reword the level definition.
- [ ] D-44 · Rule 25 (do not silently choose AM/PM) vs the parser's `ampm_assumed` (docs/06): the parser chooses but flags it, the banner asks to confirm, and the briefing says "possibly …, unconfirmed". Looks compatible; confirm.
- [ ] R-03 · (still open: two `fast-2` wordings tried live; the second fixed rows 1 and 5 but row 2 then returned Eliquis as `medication`, so the prompt stays `fast-1`. D-40 (human) asks for this wording; landing it needs a live run where rows 1–6 all pass.) Fast-pass prompt (docs/04 §2) lists "he"/"she" as sex evidence and asks for "the shortest verbatim span", so the model quotes `"he"` (2 characters), which the quote validator always drops (needs ≥ 3). Proposed wording change (docs/04 §6 protocol, bump to `fast-2`): in the `sex:` line, replace "(father, husband, he, mom, wife, she)" with "(father, husband, mom, wife, or a pronoun quoted with its next word, e.g. "his chest", "she says"; a quote must be at least 3 characters)". Not on the demo path (A01's sex comes from "my father"). Meanwhile: test left strict, rows 1 and 5 fail live on the sex item only.
- [x] eb5e836 (`reasoner-2`, D-42) R-06 · Reasoner prompt (docs/04 §3) rule 5(a) vs. the chameleon line: on B01 the model asks for an exact LKW clock time (or, on the full call, a speech check) instead of the face/arm check. Proposed wording (bump to `reasoner-2`): in rule 5(a) add "when the state line shows a clock time for lkw, last-known-well is settled: do not choose lkw"; and in the chameleon paragraph "…make the next question the face or arm check, unless the caller has already answered it". Not on the demo path (the code ladder decides the banner). Meanwhile: live test left strict.

## Notes and small decisions
- `ModelResult.output` is null on refusal / max_tokens / unparseable output; transport errors (timeout after the one retry, 429, 5xx) are thrown (docs/04 §1).
- `ReasonerInput.callStartedAt` / `now` are `Date`s and `timezone` is IANA; the user-message builder formats them (docs/04 §3).
- The fake reasoner returns no signs/facts of its own (the fake fast pass already extracted them); it proposes level, look-alikes, next question (via the docs/03 §9 ladder) and summary.
- `runScript` lives in core (no I/O beyond the injected ModelClient) rather than `apps/eval/src/scriptedRunner.ts` (docs/07 §5), so the X-01a test can use it; apps/eval imports it.
