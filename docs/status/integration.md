# Status: integration lane

Only the integration session edits this file.

## Current task
- 2026-10-24 ~16:35 PT: X-05 (draft PR at the P0 milestone, RELEASE.md); then 20-minute version1 checks, copy re-scored E-03 numbers when reasoning posts them.

## Last green commit on version1
- (X-04, see below)

## Acceptance evidence (pasted command output per task)

### X-02 Offline end-to-end test — done (version1 bfa43ca+)
- `pnpm e2e` → "e2e: 23 passed, 0 failed, 0 pending in 27 s"; `E2E_STRICT=1 pnpm e2e` → "23 passed, 0 failed, 0 pending (strict)". Checks listed in docs/TASKS.md X-02.

### X-03 Playwright smoke — done
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
- 2026-10-24 17:13 PT · version1 a7703f2 (D-41c antiplatelet wording, E-03 rescore) · verify exit 0 (core 217 + 2 skipped, gateway 50, eval 51, web 37, stt 13; 20 valid) · e2e 23 passed, 0 failed, 0 pending (strict).
- 2026-10-24 16:50 PT · version1 eb5e836 (R-06 reasoner-2, D-42) · verify exit 0 (core 216 + 2 skipped, gateway 50, eval 51, web 37, stt 13; 20 valid) · e2e 23 passed, 0 failed, 0 pending (strict).
- 2026-10-24 16:42 PT · version1 63555e3 (V-06 timing, V-09/V-10, V-08 Q&A behind FEATURE_QA_ENABLED, default false confirmed in apps/gateway/src/env.ts) · verify exit 0 (core 216 + 2 skipped, gateway 50, eval 51, web 37, stt 13; 20 valid) · e2e 23 passed, 0 failed, 0 pending (strict).
- 2026-10-24 ~16:33 PT · version1 90936d4 + mine · verify exit 0 (core 216 + 2 skipped, gateway 39, eval 51, web 37, stt 13; 20 valid) · e2e 23 passed, 0 failed, 0 pending (strict too) · e2e:ui 4 passed (strict).
- 2026-10-24 16:18 PT · version1 74acdd4..4cafd7c + mine · `pnpm verify` exit 0 (core 216 + 2 skipped, web 37, stt 13, eval 51, gateway 5; 20 scripts valid) · `pnpm e2e` 0 passed, 0 failed, 2 pending (X-01b, V-04).
- 2026-10-24 15:58 PT · df3e7a7 · verify exit 0 · e2e 2 pending.

## Handled requests from other lanes
- [x] from reasoning: re-scored E-03 run 1 (D-41a) → only level agreement moved (18/20 → 19/20, not a slide metric); README and docs/08 numbers unchanged, source lines say "re-scored". Deck: A05's back now labels aspirin "Antiplatelet" (D-41c).
- [x] from voice: demo gateway runs with `pnpm --filter @lastwell/gateway start`, never `dev` → docs/08 §2 pre-flight and README setup updated.
- [x] from screens: X-03 board test approves before "fine at about 2 PM"/"Eliquis" are in the snapshot → the test now waits until `GET /api/calls/:id` reports `ended` before approving.
- [x] from screens: board footnote repeats per card → `.first()`.
- [x] from reasoning: E-03 run 1 numbers carried into README "Results" and docs/08 §3 "Slide numbers", with the footnote.

## Requests to other lanes
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
