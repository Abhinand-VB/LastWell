# Status: integration lane

Only the integration session edits this file.

## Remaining work (snapshot 2026-10-25 03:05 PT; refreshed every 20-minute loop)

Tonight's order (human, 18:35 PT): (a) open P0/P1 tasks → (b) E-03 full live eval on the 20 scripts, numbers on the slide → (c) browser-mic fallback + play-briefing-locally on the live gateway → (d) W-11 polish for the judging table. Q&A (D-32: R-08, V-08 live) only after all of that is green. No real phone calls 9 PM–8 AM (FakeTelephony overnight).

| Task | What is left | Pri | Owner | Blocked? |
| --- | --- | --- | --- | --- |
| Morning tests | chameleon card, look-alike card, Q&A rerun (D-49/D-51) → Q&A keep/kill | P1 | humans + voice | after 8 AM |
| V-09 | browser mic live check (gateway side in, 998f166) | P1 | voice | needs a person at the laptop |
| V-10 | live Ink kill/reconnect check | P1 | voice | no |
| W-11 | polish list from Liang → screens; approved once it lands | P1 | screens | waits on the list |
| W-13 | console: Send at every level + notes field (gateway side V-13 is done; until W-13 the dispatcher cannot add a note or send at None from the UI) | P1 | screens | held until the morning (D-53) |
| C-04 | print deck, slide, two timed pitch runs | P1 | humans | human |
| LKW "N past H" | parser misses "ten past three" (blind set A11) — fix or leave is a human decision (BLOCKERS) | P1 | humans → reasoning | waits on the decision |
| X-05 | final PR + `demo-ready` tag after the live gates | P1 | integration | waits on M-01…M-04 |
| M-06 | ten rehearsals (Test 1 passed: M-01…M-04 done) | — | humans + voice | morning |
| C-01, C-05, C-07, C-08 | interview quote, Devpost, backup video, submission | — | humans | human |
| W-09 | mic record to WAV | P2 | screens | deferred (D-33) |


## Current task
- 2026-10-24 ~22:35 PT: E-05 held-out blind scripts landed (5541b71) and Path to production (08d1551); waiting for voice's single run; 20-minute version1 checks (D-50, main untouched).

## Last green commit on version1
- (X-04, see below)

## Acceptance evidence (pasted command output per task)

### X-02 Offline end-to-end test — done (version1 bfa43ca+)
- `pnpm e2e` → "e2e: 23 passed, 0 failed, 0 pending in 27 s"; `E2E_STRICT=1 pnpm e2e` → "23 passed, 0 failed, 0 pending (strict)". Checks listed in docs/TASKS.md X-02.

### X-03 Playwright smoke — done
- 2026-10-24 19:20 PT, with the W-12 step (dev:fake + ALERT_DELIVERY=local): `E2E_STRICT=1 pnpm e2e:ui` → "5 passed (41.4s)" incl. "console: Send pre-alert then Play briefing reaches completed".
- `E2E_STRICT=1 pnpm e2e:ui` → "4 passed (27.3s)": home lists calls; console renders the A01 replay (transcript, Likely, quoted chips); board shows the approved A01 alert; empty console shows "No stroke signs heard yet."; "no orphans" after teardown. Screenshots: docs/status/screens/{home,console-A01,board-A01}.png.

### X-04 Repo guardrails — done 2026-10-24
- Root scripts: `verify` = `pnpm scan:secrets && pnpm -r typecheck && pnpm -r test && pnpm --filter @lastwell/eval validate`; `scan:secrets` = `node scripts/scan-secrets.mjs`; `e2e` = `pnpm --filter @lastwell/e2e e2e`; `dev:fake` = `node scripts/dev-fake.mjs`. `.claude/settings.json` was already on version1 (commit f4e9c28) and is unchanged.
- `pnpm verify` → exit 0 (11.6 s): "scan:secrets ok: 110 tracked files and HEAD history clean (7 patterns, self-test passed)"; typecheck all packages Done; tests core/stt/web/eval/gateway passed (gateway 5); validate "3 valid, 0 invalid (3 files)".
- Secret scan negative check: a file with a fake `sk_car_…` (34 chars) added with `git add -N` → "scan:secrets FAILED: 1 finding(s) · leak-probe.txt: Cartesia API key sk_car_Z…(34 chars)", exit 1. Placeholders in `.env.example` (`sk_car_...`, `sk-ant-...`, `ACxxxx…`) do not trigger; a self-test asserts both directions on every run.
- `GATEWAY_PORT=18787 WEB_PORT=13000 pnpm dev:fake` → gateway "listening on 18787", "[dev:fake] gateway up: {"ok":true,…}", web `curl /` → 200, "POST /api/calls/replay → 404 (V-11 not landed yet); will keep trying". SIGINT → both children and their ports gone (`lsof` empty).
- `pnpm e2e` → "e2e: no scenarios yet (task X-02 not landed) — nothing was tested" (placeholder package `apps/e2e`; X-02 fills it).

### X-00 Docs alignment — done 2026-10-24
- D-30…D-38 added to docs/09; docs/00, 01, 05, 07, 08, .env.example, CLAUDE.md, TASKS.md edited per the docs/10 §2 Consequence column.
- `grep -n -i judge docs/*.md CLAUDE.md README.md .env.example` (excluding docs/10, SESSION-PROMPTS) → every remaining mention has the judge drawing/flipping cards or watching; none says the judge calls in or that the judge's phone rings.
- `pnpm verify` → exit 0.
- Reading taken: docs/08 §3 — the stroke-pile draw happens only when the first (full-deck) card was not a stroke, so a briefing call always happens; otherwise the replays fill the slot.

### C-02 Write the 20 scripts (D-33) — done 2026-10-24
- 17 new files in apps/eval/scripts (A02–A07, B02, B04, B06, B08, C02–C05, D01, D02, D04); A01/B01/C01 unchanged.
- `pnpm --filter @lastwell/eval validate` → "20 valid, 0 invalid (20 files)".
- `apps/eval/scripts/scripts.test.ts` → "Tests 42 passed". Parsed LKW per script at the moment spoken (all within tolerance):
  A01 2:00 PM (1:45–2:15 PM) · A02 12:30 PM (12:15–12:45 PM) · A03 3:10 PM (2:55–3:25 PM) · A05 9:02 AM (8:59–9:05 AM) · A06 about 8:00 AM (7:00–9:00 AM) · A07 9:20 PM (9:10–9:30 PM) · B01 6:50 PM (6:40–7:00 PM) · B02 4:15 PM (4:00–4:30 PM) · B04 11:00 AM (10:50–11:10 AM) · B06 11:35 AM (11:32–11:38 AM) · B08 9:25 PM (9:14–9:36 PM) · C01 7:05 PM (6:50–7:20 PM) · C02 3:10 PM (3:07–3:13 PM) · C03 10:30 PM (10:15–10:45 PM) · C04 3:40 PM (3:25–3:55 PM) · C05 yesterday 9:00 AM (6:00 AM–12:00 PM). A04, D01, D02, D04: no LKW (truth null).
- Keyword baseline flags 6 of 20: A02, A05, B08, C03, C04, C05 (it misses A03, A04, A06, A07 and all of B01–B06; it fires on the look-alikes C03–C05).
- `pnpm verify` → exit 0 (core 191, eval 43, gateway 5, web 1, stt 1 tests).

### C-04 Cards — deck built, live-checked
- Live check (E-03 run 1 records): all 16 card scripts match truth on final **and** peak level. Deck swap: A03 → C04 (A03 ended Possible live).

#### earlier
- `pnpm cards` → "cards: wrote docs/cards/cards.html (12 full-deck + 4 stroke-pile cards, 32 pages)". The generator refuses a stroke-pile card that is not a stroke and a stroke card without the LKW blank.
- Stroke pile: A01, A02, A05, A06 (all truth `likely` with LKW + blood thinner). Full deck: A03, A04, A07, B01, B02, B04, B06 (strokes), C01, C02, C05 (look-alikes), D01, D04 (no-stroke traps).
- Reading: the deck uses D01/D04 instead of C03/C04 because those two carry two sign kinds incl. a focal one, so only the model's judgment keeps them at Possible; D-31's "strokes, chameleons, look-alikes" read as "cases that may or may not be strokes".
- Not yet: X-02-style check of the 16 scripts through `createFakeModel` (X-01a); visual check of the print layout (no Chrome here; X-03 brings Playwright).

### C-06 README for judges — done 2026-10-24
- README.md: setup in 7 commands (clone, install, .env, convex, ngrok, gateway, web), `pnpm dev:fake` path without keys, Cartesia features, model table, results placeholder, honest limits. `pnpm scan:secrets` ok. Feature claims describe the spec; X-05 re-checks them against landed code before the PR.

### X-03 Playwright harness — landed, waiting on W-03/W-06/V-11
- `pnpm e2e:ui` → "1 passed (home lists calls), 3 skipped" with "PENDING: POST /api/calls/replay → 404 (V-11 not landed)"; exit 0; `pgrep` finds no leftover gateway/next processes (webServer gracefulShutdown SIGTERM → dev-fake kills both trees).
- Not in `pnpm verify` (needs Chromium and ~1 min); run before landing UI work. `E2E_STRICT=1` makes PENDING fail. One-time setup per machine: `pnpm --filter @lastwell/e2e exec playwright install chromium`.
- C-04 layout checked with the same Chromium: docs/cards/cards.html prints to 32 Letter pages (one face per page); front and back screenshots read correctly at 20 pt.

## blocked-keys (exact command to run once keys exist)
-

## wired-to-fake (replace when the named task lands)
- `pnpm e2e` reports PENDING (exit 0) for every route that is not on the gateway yet: today `/api/ws-token` (V-04) and the dev routes (X-01b); `E2E_STRICT=1 pnpm e2e` turns PENDING into failure and is what X-05 runs.
- `pnpm dev:fake` replays A01 through `POST /api/calls/replay`; it logs a 404 until V-11 lands, and the gateway runs without fakes until X-01b lands (it ignores `LASTWELL_FAKES` today).

## Periodic version1 checks (newest first)
- 2026-10-25 03:05 PT · version1 e0f5eb1 (no lane commits since freeze) · verify exit 0 · e2e 23/0/0 (strict) · GREEN; main untouched (D-50).
- 2026-10-25 02:43 PT · version1 48089c9 (no lane commits since freeze) · verify exit 0 · e2e 23/0/0 (strict) · GREEN; main untouched (D-50).
- 2026-10-25 02:21 PT · version1 59341ed (since `freeze`: only integration's freeze record) · verify exit 0 · e2e 23/0/0 (strict) · GREEN; main untouched (D-50). All lanes quiet (expected after freeze).
- 2026-10-25 02:00 PT · **M-05 freeze: tag `freeze` on version1 c5b7f7b** (verify exit 0, e2e 23/0/0 on that commit).
- 2026-10-25 01:58 PT · version1 32049eb (V-13 D-53 fixes, W-11 board rename) · verify exit 0 · e2e 23/0/0 (strict) · GREEN; main untouched (D-50).
- 2026-10-25 01:35 PT · version1 10c46e5 (voice V-13 note/override, screens W-11 light theme D-54…D-56) · verify exit 0 · e2e 23/0/0 (strict) · GREEN; main untouched (D-50).
- 2026-10-25 01:13 PT · version1 967dfd3 · verify exit 0 · e2e 23/0/0 (strict) · GREEN; main untouched (D-50). All lanes quiet (voice 57 min, nothing open for it until the 8 AM tests; reasoning and screens have nothing open). Waiting: parser-gap decision; freeze 2 AM.
- 2026-10-25 00:51 PT · version1 6311fb2 · verify exit 0 · e2e 23/0/0 (strict) · GREEN; main untouched (D-50). Voice 35 min, reasoning 4 h 29, screens 5 h 41. Waiting: the parser-gap decision; freeze at 2 AM.
- 2026-10-25 00:28 PT · version1 aa4fd12 (E-05 blind run) · verify exit 0 · e2e 23/0/0 (strict) · GREEN; main untouched (D-50). scripts-heldout unchanged since 5541b71.
- 2026-10-25 00:06 PT · version1 f6ee57a · verify exit 0 · e2e 23/0/0 (strict) · GREEN; main untouched (D-50). No lane activity since 22:03. Freeze reminder posted (2 AM).
- 2026-10-24 23:44 PT · version1 50010bb · verify exit 0 · e2e 23/0/0 (strict) · GREEN; main untouched (D-50). No lane activity since 22:03 (voice 1 h 41, E-05 waits).
- 2026-10-24 23:22 PT · version1 0ee6467 · verify exit 0 · e2e 23/0/0 (strict) · GREEN; main untouched (D-50, 11 behind). Idle: voice 1 h 19 (E-05 waits), reasoning 3 h, screens 4 h 12 (W-11 waits on Liang's list).
- 2026-10-24 22:59 PT · version1 cd65916 · verify exit 0 · e2e 23/0/0 (strict) · GREEN; main untouched (D-50, 9 behind). Idle: voice 57 min → BLOCKERS (E-05 waits on it), reasoning 2 h 37, screens 3 h 49.
- 2026-10-24 22:37 PT · version1 08d1551 · verify exit 0 (now also validates scripts-heldout: 8 valid) · e2e 23/0/0 (strict) · GREEN; main untouched (D-50, 8 behind). Idle: reasoning 2 h 15, screens 3 h 27 (flagged); voice 34 min ok. heldout-run1.md not yet.
- Note: I wrote "~22:45" for the E-05 landing at ~22:35; corrected. Times only from `date`.
- 2026-10-24 22:15 PT · version1 7d1f870 (voice Q&A latency) · verify exit 0 · e2e 23/0/0 (strict) · GREEN; main untouched (D-50). Idle: reasoning 1 h 53, screens 3 h 05; voice active 22:03 (Q&A is P2, but voice's P1 live checks need real calls, which are off 9 PM–8 AM).
- 2026-10-24 21:53 PT · version1 5e55cd7 (no new commits) · verify exit 0 · e2e 23/0/0 (strict) · GREEN; main untouched (D-50). Idle: reasoning 1 h 31 → BLOCKERS, screens 2 h 43 (nothing P0/P1 open); voice 34 min ok.
- 2026-10-24 ~21:40 PT · D-50: per-loop main syncs stopped (last: PR #5, dcc4d93). main stays behind version1 until the final merge.
- 2026-10-24 21:30 PT · version1 2228586 = main (dcc4d93, PR #5 at 21:20 on request) · verify exit 0 · e2e 23/0/0 (strict) · no sync needed. Idle: screens 2 h 20 (nothing P0/P1 open); reasoning 1 h 08 (build work done; asked to review voice's core LKW edit); voice active 21:19.
- 2026-10-24 21:08 PT · version1 11eb6ef (voice LKW widen fix, D-49 Q&A sorting) · verify exit 0 · e2e 23/0/0 (strict) · **synced to main: PR #4, a10249f**. Idle: screens 2 h (nothing P0/P1 open); voice active 20:52; reasoning 20:22.
- 2026-10-24 20:45 PT · version1 7634766 = main (6b572d0, PR #3) · verify exit 0 · e2e 23/0/0 (strict) · no sync needed. Idle: voice 2 h (18:47), screens 1 h 35 (19:10, nothing P0/P1 open); reasoning 20:22.
- 2026-10-24 20:23 PT · version1 32fe31a (D-46 compact guardrails, R-08, D-47 human decisions, fast-5/reasoner-5) · verify exit 0 · e2e 23/0/0 (strict). Idle: reasoning active (20:20) and its build work is done; voice 96 min; screens 73 min (nothing P0/P1 open).
- 2026-10-24 20:00 PT · version1 e6d3aff (no new commits) · verify exit 0 · e2e 23/0/0 (strict). Idle: voice 73 min, reasoning 48 min, screens 50 min → all three in BLOCKERS (screens likely just finished).
- 2026-10-24 19:38 PT · version1 aabbe6f (no new commits) · verify exit 0 · e2e 23/0/0 (strict). Idle: **voice 51 min (18:47) → BLOCKERS**; reasoning 19:12, screens 19:10 ok.
- 2026-10-24 19:14 PT · version1 3389497 (D-44 prompts, E-03 run 2, D-45 contract, W-12, W-08, W-11 labels, fake phrase table) · verify exit 0 · e2e 23/0/0 (strict). Idle check: all three lanes active (voice 18:47, reasoning 19:12, screens 19:10).
- 2026-10-24 18:52 PT · version1 7f904d6 (V-12, voice hardening) · verify exit 0 · e2e 23/0/0 (strict). Idle: reasoning (16:53), screens (16:08) still silent → stay at the top of BLOCKERS; voice active (18:47).
- 2026-10-24 18:31 PT · version1 169567f (main synced, 6c767d5) · verify exit 0 · e2e 23/0/0 (strict). Idle check 18:34: reasoning last 16:53, screens last 16:08 (> 45 min) → BLOCKERS; voice 18:06 ok.
- 2026-10-24 17:35 PT · version1 cd32ac8 (no new commits) · verify exit 0 · e2e 23/0/0 (strict).
- 2026-10-24 17:13 PT · version1 a7703f2 (D-41c antiplatelet wording, E-03 rescore) · verify exit 0 (core 217 + 2 skipped, gateway 50, eval 51, web 37, stt 13; 20 valid) · e2e 23 passed, 0 failed, 0 pending (strict).
- 2026-10-24 16:50 PT · version1 eb5e836 (R-06 reasoner-2, D-42) · verify exit 0 (core 216 + 2 skipped, gateway 50, eval 51, web 37, stt 13; 20 valid) · e2e 23 passed, 0 failed, 0 pending (strict).
- 2026-10-24 16:42 PT · version1 63555e3 (V-06 timing, V-09/V-10, V-08 Q&A behind FEATURE_QA_ENABLED, default false confirmed in apps/gateway/src/env.ts) · verify exit 0 (core 216 + 2 skipped, gateway 50, eval 51, web 37, stt 13; 20 valid) · e2e 23 passed, 0 failed, 0 pending (strict).
- 2026-10-24 ~16:33 PT · version1 90936d4 + mine · verify exit 0 (core 216 + 2 skipped, gateway 39, eval 51, web 37, stt 13; 20 valid) · e2e 23 passed, 0 failed, 0 pending (strict too) · e2e:ui 4 passed (strict).
- 2026-10-24 16:18 PT · version1 74acdd4..4cafd7c + mine · `pnpm verify` exit 0 (core 216 + 2 skipped, web 37, stt 13, eval 51, gateway 5; 20 scripts valid) · `pnpm e2e` 0 passed, 0 failed, 2 pending (X-01b, V-04).
- 2026-10-24 15:58 PT · df3e7a7 · verify exit 0 · e2e 2 pending.

## Handled requests from other lanes
- [x] from a human: committed the two E-01 consistency runs (08-29-53, 08-36-02; read and compared first: 20/20 both, 0 per-script differences, run on cd65916 from ~/LastWell) + note in docs/07 and README.
- [x] from voice: record the note + override decision → it is D-53 (wording and field name per Liang; mismatches posted back); `override` flag documented in docs/03 §6.
- [x] from voice: E-05 heldout-run1.md → slide (docs/08) and README, unchanged numbers incl. LKW 3/6; LKW misses read against the scripts by integration (2 are a parser gap, 1 is by design) → BLOCKERS decision.
- [x] from a human: "Path to production" in README (three stages, measures, exit criteria as examples to agree with partners, audit endpoint, dispatcher approval, synthetic-voice robustness as a first check only, open questions) + short version in the Devpost draft (RELEASE.md). No numbers beyond the docs/07 eval results and the Copenhagen figures; the Bergen study is named without figures.
- [x] from a human (EMT interview): Devpost Inspiration + What we learned (RELEASE.md), docs/interview.md, chameleon-first demo (docs/08 §0, §3), stroke pile B01, B06, A01, A02 (≥ 2 chameleons, generator enforces it), judge Q&A (docs/08 §10), README limit on unverified A05/B08 labels. **Correction to the request:** the keyword baseline caught 1/5 chameleons (B08, "slurred"), not 0/5; LastWell 5/5 (E-03 run 2). B08 and A05 kept out of the stroke pile (unverified labels).
- [x] from voice: Q&A latency numbers → README (Cartesia section, marked as bench numbers, Q&A off by default); decision recorded as D-51 (proposed, human glance wanted, extends D-10).
- [x] from voice: audio robustness table → README Results + docs/08 slide line, with the synthetic-speech caveat.
- [x] from voice: D-49 recorded in docs/09 (proposed, flagged for human approval because it relaxes D-10), notes in docs/04 §4 (outside the prompt block) and docs/05 §8.
- [x] from reasoning (D-47): README "Honest limits" gains append-only signs and no sex from a bare pronoun; D-40 marked not adopted in docs/09; slide/README footnote names the prompt versions of E-03 run 2 and the fast-5/reasoner-5 spot check.
- [x] from screens (W-12): X-03 now runs dev:fake with `ALERT_DELIVERY=local` and clicks send-button → confirm-checkbox → modal-send → play-briefing until `alert-status[data-status=completed]` (A02 replay); the phone path stays covered by `pnpm e2e`.
- [x] from reasoning: E-03 run 2 (slide numbers) → README Results + docs/08 §3; all 16 card scripts still match truth (final and peak) in run 2.
- [x] from voice (README check): (1) the "pending carrier verification" limit → "fallback without the phone line"; (2) Ink `call`/`qa` profiles, reconnect-once-then-degrade banner, local-delivery WAV from the same Sonic bytes; (3) keyterms on by default; (4) the unmeasured "1.5 s" claim dropped (re-add from `alert.briefing_sent` `ms` after the first real briefing call); (5) Q&A ships off (D-32).
- [x] from reasoning: re-scored E-03 run 1 (D-41a) → only level agreement moved (18/20 → 19/20, not a slide metric); README and docs/08 numbers unchanged, source lines say "re-scored". Deck: A05's back now labels aspirin "Antiplatelet" (D-41c).
- [x] from voice: demo gateway runs with `pnpm --filter @lastwell/gateway start`, never `dev` → docs/08 §2 pre-flight and README setup updated.
- [x] from screens: X-03 board test approves before "fine at about 2 PM"/"Eliquis" are in the snapshot → the test now waits until `GET /api/calls/:id` reports `ended` before approving.
- [x] from screens: board footnote repeats per card → `.first()`.
- [x] from reasoning: E-03 run 1 numbers carried into README "Results" and docs/08 §3 "Slide numbers", with the footnote.

## Requests to other lanes
- [ ] to voice, reasoning, screens: **feature freeze is in effect: tag `freeze` = version1 c5b7f7b (02:00 PT).** Only bug fixes with a test land now (docs/10 §11). Already-decided exceptions: W-13 (D-53 notes UI) in the morning; the LKW "N past H" fix only if a human approves it. (M-05)
- [ ] to voice: **D-53 is in docs/09 (d18ece0, recorded 01:20 PT, landed just before your 0fed720)**; two mismatches to fix (bug-fix sized; before 1:45 AM if you can, else first thing in the morning): (1) `OVERRIDE_LINE` must be exactly **"Dispatcher-initiated pre-alert. LastWell has not detected stroke signs on this call."** (Liang's wording); (2) the request field is **`notes`** (docs/03 §6, Liang's wording), not `note`. Your `override: true` requirement below `possible` is kept and now documented in docs/03 §6 (409 `override_required` without it) — tell me if your error code differs. Audit fields as you built them. (D-53)
- [ ] to screens: **W-13 (D-53) is held until the morning** (not started before the 1:45 AM deadline). When you do it: send `notes` (≤ 200, counter) and `override: true` when the level is below `possible` after the dispatcher confirms. (D-53)
- [ ] to voice: **D-53 (Liang), task V-13, only after your LKW post-mortem lands; land by 1:45 AM PT or hold until the morning.** (1) Approve at every level: drop the 409 at `none`; below `possible` the briefing's first sentence is exactly "Dispatcher-initiated pre-alert. LastWell has not detected stroke signs on this call."; the audit records the send as an override. (2) Optional `notes` (≤ 200 chars, trimmed, 400 above) on `POST /api/calls/:callId/alert`: append "The dispatcher adds: {notes}" verbatim (no model), not counted in the 45–70-word budget and never dropped (docs/05 §7 rule 8); store on the alert and in the audit. (3) Q&A: anything only in the note is attributed to the dispatcher ("the dispatcher said …"), never to the caller. Liang OKs your edit of `packages/core/src/briefing` (composer) and the `AlertApproveBody` contract in core for this; if Q&A attribution changes prompt wording, change docs/04 and `prompts/qa.ts` in the same commit (client.test.ts compares them). docs/03 §6, docs/05 §7 and docs/09 D-53 are already updated. Acceptance in docs/TASKS.md V-13. (D-53)
- [ ] to screens: **D-53 (Liang), task W-13, land by 1:45 AM PT or hold until the morning:** Send pre-alert enabled at every level, including `none` (tooltip: "LastWell has not detected stroke signs; the briefing will say this is a dispatcher-initiated pre-alert"); one optional notes textarea in the Send modal, ≤ 200 characters with a live counter, sent as `notes`. Coordinate with voice (V-13) for the contract field; keep X-03 green. (D-53)
- [ ] to reasoning: FYI D-53 adds `notes?` to the alert-approve body and an override opener to the composer; Liang OK'd voice editing `packages/core/src/briefing` and that contract for it. Nothing for you to do unless voice asks. (D-53)
- [ ] to voice, reasoning, screens: **feature freeze at 2:00 AM PT (M-05, docs/10 §11).** After it: bug fixes only, each with a test; no new features, prompt changes or contract changes. Land anything you want in the demo before 2 AM. Exceptions only by a human decision. Voice: E-05 (the one blind run) is an eval run, not a feature, and may run after the freeze. (M-05)
- [ ] to voice, screens, reasoning: **Liang's decisions (~23:05 PT):** D-49 and D-51 approved; **live Test 1 passed** (M-01…M-04, V-01, V-03…V-08 done, D-52); `FEATURE_QA_ENABLED=true` on the gateway Mac until the morning keep/kill; Sonic voice frozen (S-05); V-02's Card A recording closed. Morning tests after 8 AM: chameleon, look-alike, Q&A rerun. Screens: Liang sends you a W-11 polish list; W-11 is approved once it lands. Voice: E-05 (one blind run) is still yours. (human update)
- [ ] to reasoning: **do NOT read, run or tune anything on `apps/eval/scripts-heldout/`** (E-05 held-out blind test, docs/07 §5b). No prompt, rule, fake-model or scorer change may ever be based on it; do not open the files. If a change of yours needs a full eval, use `apps/eval/scripts` only. (E-05, human instruction)
- [ ] to voice: **E-05, after your current Q&A task lands:** run, exactly once, `pnpm --filter @lastwell/eval eval --mode text --scripts scripts-heldout` with the prompts as they are on `version1` at that moment (live keys; no edits to prompts, scorer or scripts first). Save the printed table **unchanged** to `apps/eval/results/heldout-run1.md` (`git add -f`, results is gitignored) with a header line: date, `version1` commit hash, prompt versions (fast/reasoner). Commit it even if the results are bad. **No reruns**; if the run errors out before printing a table, note the error in your status file and ask integration before trying again. (E-05, human instruction)
- [ ] to voice, reasoning, screens: **all four vendors are live on the gateway Mac** (Anthropic, Cartesia, Convex, Twilio; human, 2026-10-24 ~18:35 PT; Twilio number works end to end, Send pre-alert rang the medical phone). Run your `blocked-keys` checks now, within docs/10 §7.4 (Anthropic test:live ≤ 3/h, E-03 ≤ 2 runs total before freeze; Cartesia live only for gate tasks, ≤ 10 min audio/h). **Exception: no real phone calls between 9 PM and 8 AM** — for any call check overnight run the gateway with `LASTWELL_FAKES=twilio` (FakeTelephony; DEMO_MODE=false) so no teammate's phone rings. (human update)
- [ ] to voice, reasoning, screens: **tonight's priority order** (human): (a) any open P0/P1 task (see "Remaining work" above), (b) E-03 full live eval → slide, (c) browser-mic fallback + play briefing locally on the live gateway (V-09, V-12, W-08, W-12), (d) W-11 polish for the judging table. Q&A (D-32) only after all of that is green. Each lane: update your "Current task" line when you pick one up; a lane with no commit and no status update for 45 minutes goes to the top of BLOCKERS. (human update)
- [ ] to voice, screens: **D-43 update (human, ~18:20 PT): the Twilio number exists and its webhook is set and verified; the phone path is primary again.** V-12/W-12 and V-09/W-08 drop to P1 (the §0 fallback); keep building them, but the live gates on the phone path (V-01, V-03…V-07 live; M-01…M-04) come first. Real calls only to ALERT_ALLOWED_NUMBERS (D-35), never from a loop (§7.4). (D-43)
- [ ] to voice: **D-43, P0 now** (human, 2026-10-24 ~18:00 PT): there is no Twilio number (Trust Hub pending), so the demo runs phone-free on the live gateway on the Mac (:8787). (1) **V-09 browser mic is P0**: make the `/mic` → `POST /api/calls/browser` → `WS /browser/media/:callId` path work end to end on the live gateway (real Ink 2, real Claude), and note the live evidence. (2) **New V-12, P0**: `ALERT_DELIVERY=phone|local` in env.ts (default `phone`, so nothing changes for Twilio or e2e); in `local`, approve composes + synthesizes exactly as now but places no call; `GET /api/alerts/:alertId/audio` returns the cached briefing as a 16-bit PCM WAV (8 kHz mono, decoded from µ-law, re-synthesized from `briefingText` if the cache is gone); `POST /api/alerts/:alertId/played` → `briefed` → `completed` with `alert.updated`; the test-briefing endpoint works the same way in local mode; `GET /api/config` returns `alertDelivery`. Acceptance in docs/TASKS.md V-12. Keep the Twilio path and its flags untouched so it works the moment a number exists. (D-43)
- [ ] to screens: **D-43, P0 now**: (1) **W-08 mic page is P0**: verify it against the live gateway on :8787 (a browser call, transcript on the console). (2) **New W-12, P0**: when `/api/config` says `alertDelivery: "local"`, the alert status on the console shows **Play briefing** once the alert exists: play `/api/gateway/alerts/:id/audio` in an `<audio>` element (allow `alerts/:id/audio` and `alerts/:id/played` in the proxy allowlist and pass the binary body through), then `POST …/played`; hide "Call again" in local mode; the "Test briefing call" footer link must also get a Play button. Acceptance in docs/TASKS.md W-12. (D-43)
- [ ] to reasoning: D-43 contract additions (producer voice, consumer screens): `ConfigResponse.alertDelivery: z.enum(["phone","local"])`; docs/03 §6 rows `GET /api/alerts/:alertId/audio` → `audio/wav` (16-bit PCM, 8 kHz mono) and `POST /api/alerts/:alertId/played` `{}` → `{alert}` (status `briefed` → `completed`); D-43 is already in docs/09, add your contract line to it or a follow-up D. (D-43)
- [ ] to screens: hide the Next.js dev indicator (the "N" badge, bottom left in docs/status/screens/*.png) for the demo, e.g. `devIndicators: false` in next.config.ts; the projector shows it otherwise. (X-03 finding)
- [ ] to voice: **live tests are unblocked** (human, 2026-10-24 ~16:40 PT). `~/lw-voice/.env` has ANTHROPIC_API_KEY, CARTESIA_API_KEY, the Twilio credentials, DISPATCHER_PHONE / ALERT_DEFAULT_TARGET_PHONE / ALERT_ALLOWED_NUMBERS, and CONVEX_URL (project healthy-chipmunk-255; INTERNAL_API_KEY is set in the deployment); LASTWELL_FAKES is empty on the gateway Mac. Stay inside docs/10 §7.4: Cartesia live only for the gate tasks (V-02 spike, M-01, M-02, M-04), ≤ 10 min of audio per hour; real Twilio calls only to ALERT_ALLOWED_NUMBERS, never from a loop or from anything `pnpm verify` runs. The Twilio webhook and ngrok are set up by a human **after V-01 lands**: note in your status file when it has. (keys)
- [ ] to voice: D-41(c): an antiplatelet (aspirin, clopidogrel/Plavix, ticagrelor/Brilinta) is never called a blood thinner; the briefing names the drug ("Takes daily aspirin, per the caller."). The text comes from core's composer (reasoning request below); if anything in the gateway builds spoken or logged text about blood thinners itself, follow the same rule. (D-41)
- [ ] to reasoning: **live tests are unblocked** within docs/10 §7.4: `test:live` ≤ 3 runs per hour, full eval (E-03) ≤ 2 before freeze (run 1 is used). The keys are in `~/lw-voice/.env`; copy ANTHROPIC_API_KEY into your worktree's `.env` if it is not there. (keys)
- [ ] to reasoning: **D-40 approved (fast-pass sex evidence).** Land the docs/04 §2 wording and `prompts/fastPass.ts` in **one commit** (client.test.ts compares them byte for byte; you may edit docs/04 for this), bump `PROMPT_VERSION` to `fast-2`, and follow the docs/04 §6 protocol (test:live + eval on A01,B01,C01,C02,D01, outputs in your status file). New `sex:` line, exactly: `- sex: value = "male" or "female" ONLY when the caller's words make it certain. quote the phrase that makes it certain, with its context ("my father", "he's 78", "my wife", "she says"), never a bare pronoun like "he" or "she" on its own.` Adjust the §2 fixture rows that expect a bare-pronoun quote (row 1 `sex male ("his")`). The quote validator stays unchanged. (D-40)
- [ ] to reasoning: D-41(c): the composer's blood-thinner sentence (docs/05 §7 rule 5, updated) → for an antiplatelet value say `"Takes {value}, per the caller."`, never "Blood thinner: …"; add a compose test (A05-style "baby aspirin every day"). Apply the same to the Q&A answer for "Is he on blood thinners?" when only an antiplatelet is known. Then `pnpm --filter @lastwell/eval eval --rescore` E-03 run 1 with the new B08 truth (expectedLevel `likely`, D-41a) and post the re-scored table; I copy it into README and docs/08. (D-41)
- [ ] to screens: D-41(c): where the console facts panel or the board labels a `blood_thinner` fact, show an antiplatelet as "Antiplatelet: aspirin" (or "Takes: …"), not "Blood thinner: aspirin". (D-41)
- [ ] to reasoning: extend the fake fast-pass phrase table and LKW regexes so the demo-card scripts reach their truth with `--model fake`: speech "garbled", "can't say any words"/"nothing comes out", "words won't come out", "not talking"; eyes "can't see anything on her left"; LKW "fine around 12:30", "talked at 11", "fine yesterday morning". Today 12/16 card scripts agree on level (A04, A06, B04, C02 miss). The C-04 deck must come from scripts that pass X-02-style checks, and `pnpm dev:fake` replays them. (C-04)
- [ ] to screens: X-03 smoke tests match on visible text from the docs: transcript shows "coffee cup"; level pill text "Likely" (any case); the caller's quote appears on the stroke card as well as in the transcript; "No stroke signs heard yet." for an empty card; board shows "The treating team makes every treatment decision.", the blood thinner value and "Dispatcher pre-alert". Run `pnpm e2e:ui` before landing W-02…W-06. (X-03)
- [ ] to voice: `pnpm e2e` (apps/e2e, X-02) drives exactly docs/10 §4.1: `POST /api/dev/calls` → 200/201 `{callId}`; `POST /api/dev/calls/:callId/utterances {speaker,text}`; `POST /api/dev/calls/:callId/end` → `call.ended` on /ws/ui; `GET /healthz` includes `fakes: [...]`. It spawns `pnpm --filter @lastwell/gateway dev` with PORT, LASTWELL_FAKES=all, DEMO_MODE=false, INTERNAL_API_KEY, PUBLIC_BASE_URL=http://127.0.0.1:{port}, ALERT_ALLOWED_NUMBERS=+14155550100, ALERT_DEFAULT_TARGET_PHONE, DISPATCHER_PHONE, TWILIO_PHONE_NUMBER, FEATURE_QA_ENABLED=false — please make sure the gateway boots with only these (no other secrets) when fakes are on. A route that is missing must stay Fastify's default 404 ("Route … not found"): e2e reports it as PENDING, while 404 `{error:{code}}` for an unknown id is treated as a real answer. (X-02)
- [ ] to voice: `alert.updated` must reach a socket subscribed to the alert's call **and** to `board` (e2e waits for status `briefed` there, then `GET /api/alerts?sinceHours=24`). (X-02)

## Blockers for humans
- [ ] C-04 · Print docs/cards/cards.html duplex (flip on long edge), seal each back (fold + tape or envelope); bring a marker for the LKW blanks (D-20). Slide with the eval table placeholder and two timed pitch dry runs are human tasks · deck file is landed.
- [x] C-02 · answered by a human 2026-10-24 (D-41): B08 → likely; C02/C03 unchanged, likely on a look-alike = false positive; A05 aspirin kept, briefing names the drug. ~~Clinical glance at the 20 eval scripts (apps/eval/scripts/*.json), especially the truth choices B08 (possible despite face+speech), C02/C03 (signs on look-alikes), A05 (aspirin counted as the blood thinner)~~ · Scripts landed and validated; numbers are scripted either way. Answer by editing the script JSON or ticking here.

## Notes and small decisions
- 2026-10-24 ~15:50 PT: I pushed af710dc while my local `pnpm verify` was red. The cause was my stale node_modules (screens added `ws` to apps/web); after `pnpm install`, verify on that exact tree → exit 0, so version1 was green. Fix in my loop: `pnpm install` after every rebase, and the push is chained with `&&` behind verify and e2e.
- 16:40 PT: I again wrote estimated times (~16:50/16:55) for checks that ran ~16:33; corrected. Times now only from `date`.
- Timestamps in earlier evidence were estimates; they are now commit hashes. From here on, times come from `date`.
- Secret scan is a Node script, not the docs/08 §9 grep: the literal grep matches the `.env.example` placeholders, and grep is not available the same way on Windows. It scans tracked files plus the `git log -p` history of HEAD, and fails on any tracked `.env*` other than `.env.example`.
- `dev:fake` and the e2e runner spawn pnpm through `npm_execpath` (no shell string), per docs/10 §10; ports are overridable so four worktrees on one machine do not collide.
- The e2e package lives at `apps/e2e` (X-02 text: "a new workspace package `apps/e2e`"), so the integration lane owns `apps/e2e/**` in addition to the `e2e/**` named in docs/10 §6. It has no `test` script, so `pnpm -r test` never spawns a gateway.
