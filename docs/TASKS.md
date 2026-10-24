# TASKS — the ledger

Rules (since D-38, docs/10 §6): sessions claim a task on the "Current task" line of their own `docs/status/<lane>.md`; **only the Integration session edits this file**, at merge time, copying status and evidence from the lane files. A task is `done` only after every acceptance line was **observed** and the evidence is pasted (here or in the lane file). Statuses: `todo` · `doing` · `done` · `blocked` · `blocked-keys` (offline work done; the live criteria wait for vendor keys, which is not a failure) · `cut`. **Pri** is the docs/10 §5 priority: P0 = demo path and its offline proof, P1 = demo quality and safety nets, P2 = only after P0 + P1 are merged and X-02 is green. Tasks are ordered by dependency within each lane; the **Gate** column maps to the brief's go/no-go gates. Estimates are focused-agent hours.

Lanes: **X** integration (docs/10, session 4) · **S** setup (shared) · **R** reasoning · **V** voice · **W** screens · **E** eval · **C** clinical & pitch · **M** milestones & demo gates (decision IDs in docs/09 use D-nn; gotchas use G-nn).

## Ledger

| ID | Task | Lane | Owner | Status | Pri | Depends | Est | Gate | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| X-04 | Repo guardrails: verify, scan:secrets, dev:fake, e2e | X | integration | done | P0 | — | 0.5 | — | 2026-10-24 15:16 PT, landed 171a79a. `pnpm verify` exit 0 (scan:secrets "110 tracked files and HEAD history clean", typecheck + tests in all packages, validate 3 valid); a planted fake `sk_car_` key → "scan:secrets FAILED", exit 1; `pnpm dev:fake` (ports 18787/13000) → gateway healthz up, web 200, replay 404 until V-11; SIGINT stops both. Evidence: docs/status/integration.md. |
| X-00 | Docs alignment (D-30…D-38) | X | integration | done | P0 | — | 1 | — | 2026-10-24 15:40 PT. D-30…D-38 in docs/09 (D-18, G-08, G-09, risks and cut list annotated); docs/00 users + scope + rows 5–7; docs/01 diagram, layout (apps/e2e, scripts/), console modal, env table (LASTWELL_FAKES, DEMO_MODE, ALERT_ALLOWED_NUMBERS, new defaults); docs/05 §2/§7 notes; docs/07 D-33 scope + footnote; docs/08 §1, §2, §3, §4, §5, §6, §7, §9; .env.example; CLAUDE.md; this ledger (Pri column, X rows, `blocked-keys`, D-33 cuts). `grep -i judge` over docs (except docs/10 and SESSION-PROMPTS) → the judge only draws, watches and flips cards; no line says the judge calls in or is called. `pnpm verify` exit 0. |
| X-01a | Fake model (`createFakeModel`) + `ModelClient` interface | X | reasoning | todo | P0 | R-04, R-05 | 1.5 | — | docs/10 §4, §4.1 |
| X-01b | Gateway fakes, dev routes, `LASTWELL_FAKES` / `DEMO_MODE` / `ALERT_ALLOWED_NUMBERS` | X | voice | todo | P0 | S-02 | 1.5 | — | docs/10 §4 |
| X-02 | Offline end-to-end test `pnpm e2e` (`apps/e2e`) | X | integration | todo | P0 | X-01a, X-01b, V-05, V-06, V-07, V-11 | 2 | — |  |
| X-03 | Playwright smoke tests (console, board) under `pnpm dev:fake` | X | integration | todo | P1 | W-03, W-06, V-11 | 1 | — |  |
| X-05 | Release prep: `docs/status/RELEASE.md`, `version1 → main` PR text | X | integration | todo | P1 | X-02 | 0.5 | — |  |
| S-01 | Repo and workspace scaffold | S | AVB | done | — | — | 0.5 | 0 | `pnpm install` (pnpm 9.12.0 via corepack, Node 24.11.1): "Already up to date · Done in 386ms"; `git check-ignore -v .env .env.local` → `.gitignore:13:.env` / `.gitignore:14:.env.*`, `.env.example` not ignored, `git status` shows no .env; `pnpm typecheck` → "No projects matched the filters", exit 0. Kept existing README (C-06 replaces it). Merged scaffold .gitignore into the existing one (dropped Python lines: no Python). |
| S-02 | Package skeletons + scripts (5 packages) | S | AVB | done | — | S-01 | 0.5 | 0 | Observed 2026-10-24 03:17 PT (Node 24.11.1, pnpm 9.12.0). `pnpm -r typecheck`: core, stt, gateway, eval, web all "Done". `pnpm -r test`: 5 packages × "Test Files 1 passed (1) · Tests 1 passed (1)". `pnpm --filter @lastwell/gateway dev` → log "listening on 8787" (event server.listening, port 8787); `curl localhost:8787/healthz` → {"ok":true,"uptimeS":17,"liveCalls":0,"cartesia":"ok","version":"0.0.0"}. `pnpm --filter @lastwell/web dev` → "Next.js 15.5.28 (Turbopack) ✓ Ready in 7.1s"; `curl localhost:3000/` → 200, HTML contains "core 0.0.0" (page imports VERSION from @lastwell/core), log "✓ Compiled / in 5.9s", no build error. Readings taken: web scaffolded with create-next-app@15 (docs/01 §3 pins Next 15; the task line says @latest); resolved SDK @anthropic-ai/sdk 1.3.0, zod 3.25.76, fastify 5.12.7, vitest 3.2.7. Gateway split into app.ts (buildApp, testable with inject) + server.ts (listen); env.ts holds only NODE_ENV/PORT/LOG_LEVEL for now (V-01 adds the rest). healthz liveCalls/cartesia are constants until V-03/V-10. Removed create-next-app boilerplate (README, public/*.svg). Only `next dev --turbopack` was checked, not `next build`. |
| S-03 | Vendor accounts and `.env` | S |  | todo | — | — | 1 | 0 |  |
| S-04 | Twilio: upgrade, number, webhook | S |  | todo | — | S-03 | 0.5 | 0 |  |
| S-05 | Cartesia credits, concurrency, voice pick | S |  | todo | — | S-03 | 0.5 | 0 |  |
| S-06 | Convex project + schema deploy | S |  | todo | — | S-03 | 0.5 | 0 |  |
| R-01 | Contracts (zod) + script validator CLI | R | AVB | done | — | S-02 | 1.5 | 2 | Observed 2026-10-24 03:30 PT. `pnpm --filter @lastwell/core test` → "Test Files 2 passed (2) · Tests 63 passed (63)": A01/B01/C01 parse + pass cross-field rules; sample CaseState round-trips through JSON; all 11 UiServerMessage variants + 6 client shapes parse; FastPassOutput with an extra top-level or nested field fails (strict), same for Reasoner/Qa; zodOutputFormat(Fast/Reasoner/Qa) converts; Twilio connected/start/media(in+out)/mark/stop + media without track + outbound media/mark/clear parse; Ink connected/turn.*/error and Sonic chunk/done/error parse; hard_audio expansion from sourceId. `pnpm --filter @lastwell/eval validate` → "ok A01 classic 11 turns · ok B01 chameleon 12 turns · ok C01 lookalike 10 turns · 3 valid, 0 invalid (3 files)", exit 0. `pnpm --filter @lastwell/eval validate fixtures/invalid` (A01 copy with signs ["speech"]) → "FAIL fixtures\invalid\A01.json (A01) - truth.expectedLevel: "likely" needs ≥ 2 distinct sign kinds, got 1 (speech) · 0 valid, 1 invalid", exit 1. No `any`: grep for `: any\|as any\|<any>\|any[]` in packages/apps src → no matches. `pnpm -r typecheck` 5× Done; `pnpm -r test` core 63, stt/web/eval/gateway 1 each, all passed. Readings taken: contracts use `zod/v4` (SDK helper requires it) and UiClientMessage is z.union (zod throws "Duplicate discriminator value" on the doc's discriminatedUnion) → D-24 + note in docs/03 §5. loadScripts takes parsed JSON (core does no file I/O); the CLI reads files. Cross-field rules enforced beyond the §14 comments: id prefix ↔ type (docs/07 §3), isStroke ↔ type, none ⇒ no signs, lookalike ⇒ truth.lookalike set and ≤ possible, other ⇒ none, local-time format for callStartLocal/lkw.localTime, atMs non-decreasing, blood_thinner fact = bloodThinner, file name = {id}.json, unique ids. Extra contracts added for consumers (no doc shapes changed): REST bodies/responses from §6, TwilioOutboundMessage, TwilioVoiceWebhookBody, TwilioStatusCallbackBody, BrowserMediaControl, initialCaseState(), NO_SIGNS_HEADLINE. Web regression found and fixed: Turbopack 500 "Can't resolve './contracts/index.js'" → web dev/build on webpack with extensionAlias (D-25); re-checked `curl localhost:3000/` → 200 with "core 0.0.0". |
| R-02 | Quote validator | R | AVB | done | — | R-01 | 1 | 2 | Observed 2026-10-24 03:32 PT. `vitest run src/validate` → "Test Files 1 passed · Tests 19 passed (19)": the ten docs/03 §7 cases (exact; "He can't lift his coffee cup." vs "he cant lift his coffee cup" → returns "He can't lift his coffee cup"; curly apostrophe both ways; spanning two utterances → no_match; dispatcher-only sign → null; newer dispatcher echo + older caller → caller's ref (speaker filter before recency); "ok" → too_short; 161+ chars → too_long while exactly 160 passes; original casing/punctuation returned; address from dispatcher accepted) plus R-02 extras: "fine at about 2 PM" in "He was fine at about 2 PM. We had lunch and he was fine." → {quote:"fine at about 2 PM", tMs:8000, speaker:caller}, also for an upper-cased quote; Q&A dispatcher evidence accepted for "What's the address?"/"Where is the patient?", rejected for "Is he on blood thinners?"; caller/mixed-only for non-address facts and look-alikes; newest-first; no near-miss repair; same span for two signs; LKW phrase-within-quote. `pnpm -r typecheck` 5× Done; `pnpm -r test` core "Test Files 3 passed · Tests 82 passed", stt/web/eval/gateway 1 each passed. API: validateQuote(quote, purpose, utterances) → QuoteRef\|null; checkQuote(...) → {ok,ref}\|{ok:false, reason: too_short\|too_long\|no_match} so the caller can log `validator.dropped` with the reason (core does no logging); phraseWithinQuote() for the LKW rule. Reading taken (D-26, needs a human glance): norm drops apostrophes too, because the spec's own "cant" test cannot match while `'` is kept. Matching is otherwise exactly §7 (plain substring after norm, no word-boundary or fuzzy logic). |
| R-03 | Claude client + fast pass | R |  | todo | P0 | R-01, S-03 | 1.5 | 2 |  |
| R-04 | CaseState reducer, level guard, next-question ladder | R | AVB | done | — | R-01, R-02 | 2 | 2 | Observed 2026-10-24 03:40 PT. `vitest run src/state` → "Tests 33 passed (33)"; `pnpm -r test` → core "Test Files 4 passed · Tests 115 passed (115)", stt/web/eval/gateway 1 each passed; `pnpm -r typecheck` 5× Done. Acceptance lines, each a named test in packages/core/src/state/reducer.test.ts: fast-pass sign on empty state → level possible + nextQuestion {lkw, "Ask: when were they last seen completely normal?"} (he/his once a sex fact exists); two kinds + reasoner likely → likely; one kind + likely → possible; two kinds + none → possible; zero signs + likely → none. Ladder: vague LKW → "what time exactly" even with reasoner blood_thinner; LKW approx + no thinner → blood_thinner; approx + reasoner lookalike + unresolved → "Ask: Is he diabetic, and when did he last eat?"; diabetes fact → look-alike skipped (→ blood_thinner); ampm_assumed → "Ask: was that 3 o'clock in the morning, or in the afternoon or evening?"; yesterday_assumed text; Bell's palsy resolved by a non-face sign (also with curly apostrophe). Replacement: reasoner LKW from seq 4 does not replace fast-pass LKW from seq 8; later LKW replaces; later-seq fact replaces, earlier does not, equal seq → longer value; LKW equal seq → higher confidence, equal confidence keeps existing; unknown never erases a parsed LKW (phrase still stored on the fact). Signs never removed (dedupe kind+utteranceId); version increments only in publish() (1, 2); warnings round-trip through transitions and JSON. Plus a Card A walk-through (possible → likely; banner lkw-vague → blood_thinner → face). Bug found by the tests and fixed: LKW was only re-parsed when its fact won the fact slot. Files: state/{reducer,nextQuestion}.ts, validate/{levelGuard,outputs}.ts (validateFastPass/validateReasoner run the R-02 validator over model outputs and return drops for `validator.dropped` logging). The LKW parser is injected via ReducerConfig.parseLkw (R-05 plugs in). Readings (D-27): guard also requires a focal sign for likely (D-21); they-forms with agreeing verbs; parsed LKW beats unknown regardless of seq. |
| R-05 | LKW parser | R | AVB | done | — | R-01 | 3 | 3 | Observed 2026-10-24 03:55 PT. `vitest run src/lkw` → "Tests 59 passed (59)": all 50 rows of docs/06 §7 as table-driven tests (46 at saidAt 14:47; rows 47, 49, 50 at 07:05; row 48 at 09:30), each asserting lkwAt, range ends (local, with date), confidence, note and the exact display string; guards (ISO in the call's offset; invalid saidAt/timezone → unknown; yesterday_assumed; > 7 days → unknown; older_than_24h with weekday; meal/afternoon said too early); totality fuzz over 200 seeded random phrases (incl. unicode, NUL, punctuation, out-of-range clocks): never throws, always schema-valid, point and rangeEnd ≤ saidAt, start ≤ end, width ≤ 24 h; a source scan finds no `new Date(`, `Date.parse(`, `DateTime.local(` or `DateTime.now(` in lkw/*.ts (all math via luxon in the call's zone); plus a Card A integration through the R-04 reducer ("Since lunch" → "about 12:30 PM (12:00–1:30 PM)", banner lkw → "fine at about 2 PM" → "2:00 PM (1:45–2:15 PM)", banner blood_thinner). `pnpm -r typecheck` 5× Done; `pnpm -r test` core "Test Files 5 passed · Tests 173 passed" (+1 integration test added after this run → 174), stt/web/eval/gateway 1 each passed. Files: lkw/{grammar,parser,format}.ts, parser.test.ts; exported parseLkw/formatLkw from @lastwell/core (plug into ReducerConfig.parseLkw). Readings for phrases the table does not cover are logged as D-28 (standalone hour, extra bare-hour prefixes, in-the-morning/at-night qualifiers, meal windows not yet started → previous day, R16 sub-ranges, midpoints floored to the minute). |
| R-06 | Reasoner wrapper | R |  | todo | P0 | R-03, R-04 | 1.5 | 3 |  |
| R-07 | Briefing composer | R | AVB | done | — | R-04, R-05 | 1 | 3 | Observed 2026-10-24 04:00 PT. `vitest run src/briefing` → "Tests 12 passed (12)"; `pnpm -r typecheck` 5× Done (a web-only strictness difference on `let quote2` was fixed with an explicit type); `pnpm -r test` core "Tests 186 passed", stt/web/eval/gateway 1 each passed. Actual output with qaEnabled: A01 (70 words, now 14:48): "Stroke pre-alert from nine one one, approved by the dispatcher. 78-year-old man. Signs heard: one-sided weakness and speech trouble. The caller said: 'he can't lift his coffee cup' and 'his words come out all mixed up'. Last known well: 2:00 PM, 48 minutes ago. Caller's words: 'fine at about 2 PM'. Blood thinner: Eliquis, per the caller. Not yet confirmed by paramedics. You can ask me about the call now." B01 64 words (balance trouble and vision change; 6:50 PM, 31 minutes ago; "The caller says no blood thinners."). C01 68 words ("Could also be low blood sugar; not yet ruled out."; "Blood thinners were not mentioned."). TEST 51 words ("Last known well time was not established on the call." · "Blood thinners were not mentioned."). Tests also cover: every quoted fragment is a substring of a fixture quote; two speech signs → one label; two signs sharing a quote → one quote; 12-word cut and no dispatcher quotes; ampm_assumed/yesterday_assumed → "possibly … unconfirmed"; vague/older_than_24h/clipped/>180 min sentences; look-alike only at level possible; oversized trim order quote 2 → caller's words → look-alike with the fixed sentences kept. Fixtures packages/core/src/fixtures/caseState.{A01,B01,C01,TEST}.json were generated by running the real validators + reducer + parseLkw over the docs/07 scripts with ideal model outputs (not hand-typed); TEST is the canned docs/03 §6 state. spokenLkwSentence() is exported for the Q&A path (docs/04 §4). Readings: trailing punctuation is dropped from spoken quotes; "Caller's words" speaks the original span of the validated quote that matches the phrase; three or more labels are joined with " and " as written. Note: A01 is exactly at the 70-word ceiling, so a longer live quote will drop quote 2 first, as designed. |
| R-08 | Q&A wrapper | R |  | todo | P2 | R-03, R-02 | 1 | 3 |  |
| R-09 | Keyword baseline | R | AVB | done | — | R-01 | 0.5 | — | Observed 2026-10-24 04:01 PT. `vitest run src/baseline` → "Tests 5 passed (5)": A02 (turns from its docs/07 seed, since C-02 has not written the file yet) flags on "drooping" → {flagged:true, index:3, pattern:"droop"}; the real B01 script never flags, although its dispatcher asks "…drooping or uneven?" (only caller/mixed utterances count); D04 "lips and face are swelling" never flags; each of the 8 patterns matches caller/mixed text; deterministic across two runs. Finding for the slide: the real A01 script is NOT flagged by the baseline (no pattern in "words come out all mixed up", "right hand is weak", "can't get the words out right"). `pnpm -r typecheck` 5× Done; `pnpm -r test` core "Tests 191 passed", stt/web/eval/gateway 1 each passed. API: keywordBaseline(turns) → {flagged, index, pattern}; the runner maps index → atMs for "seconds to first flag". Patterns copied verbatim from docs/07 §2 (BASELINE_PATTERNS). |
| R-10 | Prompt caching + latency tuning | R |  | todo | P1 | V-05 | 1 | — | P2 |
| V-01 | Gateway boot + Twilio voice webhook | V |  | todo | P0 | S-02, S-04 | 2 | 0 |  |
| V-02 | `@lastwell/stt`: InkSession + spike script | V |  | todo | P0 | S-02, S-05, R-01 | 1.5 | 0 |  |
| V-03 | Media stream + InkSession + utterances | V |  | todo | P0 | V-01, V-02, R-01 | 3 | 1 |  |
| V-04 | UI hub (WS, tokens, Origin) + REST + config + store | V |  | todo | P0 | V-03, S-06 | 2.5 | 1 |  |
| V-05 | Call runner (pipeline wiring) | V |  | todo | P0 | V-04, R-03, R-04, R-06 | 2 | 2 |  |
| V-06 | Alert approve: compose → Sonic bytes → outbound call | V |  | todo | P0 | V-05, R-07 | 2 | 3 |  |
| V-07 | Alert media stream: play briefing, marks, hang-up | V |  | todo | P0 | V-06 | 2 | 3 |  |
| V-08 | Q&A loop with barge-in | V |  | todo | P2 | V-07, R-08 | 3 | — | cut #2 |
| V-09 | Browser-mic fallback (gateway) | V |  | todo | P1 | V-03 | 1.5 | — |  |
| V-10 | Degrade/reconnect, test-briefing endpoint, call-again | V |  | todo | P1 | V-07 | 1.5 | — |  |
| V-11 | Replay endpoint for scripted calls | V |  | todo | P0 | V-05 | 1 | — | demo B/C |
| W-01 | Web scaffold, proxy, WS hook, polling fallback | W |  | todo | P0 | S-02 | 2 | 1 |  |
| W-02 | Console: live transcript pane | W |  | todo | P0 | W-01, R-01 | 2 | 1 |  |
| W-03 | Console: stroke card | W |  | todo | P0 | W-02 | 2 | 2 |  |
| W-04 | Console: next question, look-alike, facts, latency | W |  | todo | P0 | W-03 | 2 | 3 |  |
| W-05 | Console: Send pre-alert modal + alert status | W |  | todo | P0 | W-04, V-06, V-10 | 1.5 | 3 |  |
| W-06 | Board page | W |  | todo | P1 | W-01, V-06 | 2.5 | — | cut #3 |
| W-07 | Home: call list, start browser call | W |  | todo | P1 | W-01 | 0.5 | — |  |
| W-08 | Mic page (AudioWorklet) | W |  | todo | P1 | W-07, V-09 | 2 | — | fallback |
| W-09 | Mic page: record to WAV | W |  | todo | P2 | W-08 | 1 | — | P2 |
| W-10 | Replay buttons (B01/C01) | W |  | todo | P1 | W-07, V-11 | 0.5 | — | demo |
| W-11 | Visual polish | W |  | todo | P1 | W-05, W-06 | 2 | — | before freeze |
| E-01 | Runner: text mode + scoring + table | E |  | todo | P0 | R-03…R-09, C-02 | 3 | — |  |
| E-02 | Runner: audio mode (uses @lastwell/stt) | E |  | cut | — | E-01, V-02 | 2 | — | deferred by D-33 (text-mode eval only) |
| E-03 | Full text run → slide | E |  | todo | P1 | E-01 | 0.5 | — | Sat eve |
| E-04 | Audio run on subset | E |  | cut | — | E-02, C-03 | 1 | — | deferred by D-33 |
| C-01 | Interview + quote | C |  | todo | — | — | 2 | — | by Sat noon |
| C-02 | Write the 20 scripts (D-33) | C |  | todo | P0 | R-01 (schema + validator) | 4 | — |  |
| C-03 | Record audio (A01, B01, C01, E01–E06, more) | C |  | cut | — | C-02 | 3 | — | deferred by D-33 (no audio eval) |
| C-04 | Cards: 12-card deck + 4-card stroke pile (D-31), slide, pitch | C |  | todo | P1 | — | 2 | — |  |
| C-05 | Devpost draft + final | C |  | todo | — | C-01 | 1.5 | — | Sat 11 PM |
| C-06 | README for judges | C |  | todo | P1 | V-08 or cut | 1 | — |  |
| C-07 | Backup video | C |  | todo | — | M-06 | 0.5 | — | Sun AM |
| C-08 | Submission checklist | C |  | todo | — | C-05, C-06, C-07 | 0.5 | — |  |
| M-01 | Gate 0: call audio reaches Cartesia | M |  | todo | — | V-03 | — | 0 |  |
| M-02 | Gate 1: live transcript on screen | M |  | todo | — | V-04, W-02 | — | 1 |  |
| M-03 | Gate 2: Haiku JSON with quotes on 5 scripts | M |  | todo | — | R-03, R-02 | — | 2 |  |
| M-04 | Gate 3: approve → Sonic briefing call | M |  | todo | — | V-07, W-05 | — | 3 |  |
| M-05 | Feature freeze | M |  | todo | — | — | — | — | Sun 2 AM |
| M-06 | Ten rehearsals | M |  | todo | — | M-04 | 2 | — | Sun 6–8 AM |
| M-07 | Teardown after judging | M |  | todo | — | — | 0.5 | — |  |

Critical path for the demo: S-01 → S-02 → S-03/S-04 → V-01 → V-03 → V-04 → V-05 (with R-01…R-04, R-06) → V-06 → V-07 → W-05 → M-04 → M-06. Everything else parallelizes around it.

---

## Task details

### S-01 Repo and workspace scaffold
**Goal.** A pnpm monorepo that typechecks empty.
**Files.** `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.npmrc` (`shell-emulator=true`, so `LIVE=1 …` scripts work on Windows too), `.gitignore`, `README.md` (title + "see docs/"). `.env.example` already exists at the repo root (part of this planning package); keep it. Exact file contents: `docs/scaffold/README.md`.
**Steps.** Root `package.json`: `"private": true`, `"packageManager": "pnpm@9"`, `"engines": {"node": ">=22"}`, scripts `typecheck: "pnpm -r typecheck"`, `test: "pnpm -r test"`. `pnpm-workspace.yaml`: `packages: ["packages/*", "apps/*"]`. `tsconfig.base.json`: `strict`, `module: NodeNext`, `moduleResolution: NodeNext`, `target: ES2022`, `esModuleInterop`, `skipLibCheck`, `verbatimModuleSyntax`. `.gitignore`: `node_modules`, `.env`, `.env.*`, `!.env.example`, `dist`, `.next`, `apps/eval/audio/*.wav`, `apps/eval/results`.
**Acceptance.** `pnpm install` succeeds; `git status` shows no `.env`; `pnpm typecheck` runs (no packages yet) without error.

### S-02 Package skeletons + scripts
**Goal.** Five packages (`core`, `stt`, `gateway`, `web`, `eval`) with `typecheck`, `test`, `dev` scripts and one passing smoke test each.
**Files.** `packages/core/{package.json,tsconfig.json,vitest.config.ts,src/index.ts,src/index.test.ts}`; `packages/stt/{…}`; `apps/gateway/{…,src/server.ts}`; `apps/web` via `pnpm create next-app@latest apps/web --ts --app --tailwind --eslint --no-src-dir --import-alias "@/*"` plus `transpilePackages: ["@lastwell/core"]` in `next.config.ts`; `apps/eval/{…,src/run.ts}`. Contents per `docs/scaffold/README.md`. Core exports `const VERSION = "0.0.0"`. Gateway `server.ts` starts Fastify on `PORT` and serves `GET /healthz`. Eval `run.ts` prints usage.
**Acceptance.** `pnpm -r typecheck && pnpm -r test` pass; `pnpm --filter @lastwell/gateway dev` prints "listening on 8787" and `curl localhost:8787/healthz` returns JSON; `pnpm --filter @lastwell/web dev` serves `/` and imports `VERSION` from `@lastwell/core` without a build error.

### S-03 Vendor accounts and `.env`
**Goal.** Every key in `.env`, each verified with one request.
**Steps.** Anthropic: key from a funded org; `curl` one `claude-haiku-5-5` message. Cartesia: key from play.cartesia.ai/keys; `curl -H "Authorization: Bearer $CARTESIA_API_KEY" -H "Cartesia-Version: 2026-08-14" https://api.cartesia.ai/voices?limit=1`. Convex: account created (S-06 creates the project and deploys the schema). ngrok: account + reserved domain; `ngrok http 8787 --domain …` reachable. Generate `INTERNAL_API_KEY` with `openssl rand -hex 32`.
**Acceptance.** Paste the four successful responses (keys redacted) into Notes. `.env` is not tracked.

### S-04 Twilio: upgrade, number, webhook
**Goal.** A paid Twilio account with one voice-capable US local number pointed at the gateway.
**Steps.** Upgrade (add payment, $20 minimum). Buy a local number with Voice capability. Console → the number → Voice & Fax → "A call comes in" → Webhook `POST {PUBLIC_BASE_URL}/twilio/voice`. Verify Geographic Permissions include US. Put `TWILIO_PHONE_NUMBER`, `DISPATCHER_PHONE` in `.env`.
**Acceptance.** From a phone that is **not** verified on the account, call the number: the ngrok request inspector shows `POST /twilio/voice` (a 404 before V-01 is fine); no "trial account" announcement plays. Paste the inspector line.

### S-05 Cartesia credits, concurrency, voice pick
**Goal.** Enough credits for the weekend; a chosen voice.
**Steps.** Check plan credits and concurrent-connection limit in the Playground billing page; buy or obtain sponsor credits so that ≥ 300 000 credits are available; set `EVAL_CONCURRENCY` ≤ the limit. Generate the Card A briefing text (docs/05 §7 example) with Skylar and Daniel via `/tts/bytes` (wav container) and listen; set `CARTESIA_VOICE_ID`.
**Acceptance.** Screenshot of the balance in Notes; the chosen voice id in `.env` and in `docs/01 §4.3` if it differs from the default.

### S-06 Convex project + schema deploy
**Goal.** Schema and functions deployed (docs/02 §1); `CONVEX_URL` in `.env`.
**Steps.** `cd apps/gateway && npx convex dev` (log in, create project `lastwell`; it pushes `convex/schema.ts` + `convex/store.ts`, writes `convex/_generated/` and `apps/gateway/.env.local`). `npx convex env set INTERNAL_API_KEY <the .env value>`. Copy `CONVEX_URL` from `apps/gateway/.env.local` into `.env`. Commit `convex/_generated/`.
**Acceptance.** The dashboard shows the five tables; `npx convex run store:listCalls '{"secret":"<INTERNAL_API_KEY>"}'` returns `[]`; the same call with a wrong secret fails with `unauthorized`; `pnpm --filter @lastwell/gateway typecheck` still passes with `_generated/` present.

### R-01 Contracts (zod)
**Goal.** Every schema in docs/03 implemented and exported from `@lastwell/core`, plus the script validator the Clinical lane needs on day one.
**Files.** `packages/core/src/contracts/{primitives,transcript,caseState,modelOutputs,ui,rest,lkw,twilio,cartesia,eval}.ts`, `index.ts`; `packages/core/src/eval/{validateScript,loadScripts}.ts` (schema + cross-field rules from docs/03 §14, `hard_audio` expansion from `sourceId`); `apps/eval/src/validate.ts` CLI (`pnpm --filter @lastwell/eval validate`); `contracts.test.ts` with fixtures: A01/B01/C01 scripts from docs/07 §4 parse; a sample `CaseState` round-trips; `UiServerMessage` parses each variant; `FastPassOutput` with an extra field fails (`.strict()` on model outputs); the minimal Twilio/Ink/Sonic shapes from docs/01 §4 parse with the §12–§13 schemas.
**Acceptance.** `pnpm --filter @lastwell/core test` green; `pnpm --filter @lastwell/eval validate` reports the three example scripts valid and a deliberately broken copy (likely with one sign kind) invalid; no `any`.

### R-02 Quote validator
**Goal.** docs/03 §7 exactly.
**Files.** `packages/core/src/validate/quotes.ts`, `quotes.test.ts`.
**Acceptance.** All ten test cases from docs/03 §7 pass (including speaker-filter-before-recency), plus: "fine at about 2 PM" matches "He was fine at about 2 PM. We had lunch and he was fine." and returns the original casing; Q&A evidence from the dispatcher is accepted only for an address question.

### R-03 Claude client + fast pass
**Goal.** `fastPass(utterance, prevDispatcher)` returns a validated `FastPassOutput` or null, with `ms`.
**Files.** `packages/core/src/claude/{client,fastPass}.ts`, `src/prompts/fastPass.ts`, `fastPass.live.test.ts` (runs only with `LIVE=1`), `warmup.ts` (one tiny parse call per schema at gateway boot to compile grammars).
**Acceptance.** `LIVE=1 pnpm --filter @lastwell/core test:live` passes the six fixture rows in docs/04 §2 (signs/facts kinds as listed; quotes validate with R-02); median `ms` < 1500 over the six calls; the request contains no `temperature`. Paste the output.

### R-04 CaseState reducer, level guard, next-question ladder
**Goal.** Pure transitions per docs/03 §3, §8, §9 and docs/05 §6.
**Files.** `packages/core/src/state/{reducer,nextQuestion}.ts`, `src/validate/levelGuard.ts`, tests.
**Acceptance.** Tests: a fast-pass sign on an empty state → `level possible`, `nextQuestion.kind lkw` (unknown variant); two distinct kinds + reasoner `likely` → `likely`; one kind + reasoner `likely` → `possible`; two kinds + reasoner `none` → `possible` (floor); zero signs + reasoner `likely` → `none`. Ladder (docs/03 §9): vague LKW → `lkw` with the "what time exactly" text even when the reasoner proposed `blood_thinner`; LKW approx + no thinner fact → `blood_thinner`; LKW approx + reasoner `lookalike` with an unresolved look-alike → that look-alike; a resolved look-alike (diabetes fact present) is skipped; `ampm_assumed` → confirmation text; Bell's palsy resolves when a non-face sign exists. Replacement: a reasoner `last_known_well` from utterance seq 2 does not replace a fast-pass LKW from seq 4; a fact from a later seq does; equal seq → higher confidence. Signs never removed; `version` increments on every publish; `warnings` round-trip.

### R-05 LKW parser
**Goal.** docs/06.
**Files.** `packages/core/src/lkw/{parser,grammar,format}.ts`, `parser.test.ts`.
**Acceptance.** All 50 rows of docs/06 §7 (both blocks) pass as table-driven tests; the function is total (never throws on any string, fuzz with 200 random phrases); no `Date` without zone.

### R-06 Reasoner wrapper
**Goal.** `reasoner(transcript, state, clock)` → validated `ReasonerOutput` or null, with `ms`.
**Files.** `packages/core/src/claude/reasoner.ts`, `src/prompts/reasoner.ts`, `reasoner.live.test.ts`.
**Acceptance.** Live on the A01 transcript (all turns): `level likely`, signs include `speech` and `arms` with validating quotes, `last_known_well.phrase` contains "about 2 PM", `blood_thinner.value` "Eliquis", `next_question.kind` is `none` or a sign check; `ms` < 7000 at `medium`. Live on B01: level `possible` (balance + eyes, no focal sign), `next_question.kind` face or arms. Live on C01: level ≤ `possible`, `lookalikes[0].name` "low blood sugar". Paste outputs.

### R-07 Briefing composer
**Goal.** docs/05 §7.
**Files.** `packages/core/src/briefing/compose.ts` (signature docs/03 §11, `opts.qaEnabled`), `compose.test.ts` with fixtures `fixtures/caseState.{A01,B01,C01,TEST}.json` (TEST = the canned smoke-test state, docs/03 §6; the gateway rewrites its `callId` and `ref.utteranceId`s to the new call at creation).
**Acceptance.** A01 fixture → text contains "78-year-old man", "speech trouble", "one-sided weakness", "Last known well: 2:00 PM", "Blood thinner: Eliquis"; 45–70 words; every quoted fragment is a substring of a fixture quote; two signs of the same kind produce one label; two signs sharing a quote produce one quote; an oversized fixture is trimmed in the documented order; `ampm_assumed` reads "possibly … unconfirmed"; C01 fixture mentions "Could also be low blood sugar"; TEST fixture says "was not established on the call" and "Blood thinners were not mentioned".

### R-08 Q&A wrapper
**Goal.** docs/04 §4 with evidence enforcement and the fallback phrase.
**Files.** `packages/core/src/claude/qa.ts`, `src/prompts/qa.ts`, `qa.live.test.ts`.
**Acceptance.** Live with the A01 transcript + state: "Is he on blood thinners?" → `known true`, answer contains "Eliquis", evidence validates; "Any seizure before this?" → fallback phrase; "When was he last normal?" → answer contains "2:00 PM" and no parentheses or dashes; "What's the address?" → accepted with dispatcher or caller evidence; each `ms` < 2000.

### R-09 Keyword baseline
**Files.** `packages/core/src/baseline/keywordBaseline.ts` + test (A02 flags on "drooping"; B01 never flags; D04 "swelling" never flags).

### R-10 Prompt caching + latency tuning (P2)
**Goal.** Measure fast-pass and reasoner latency over 20 live calls; try `CLAUDE_REASONER_EFFORT=low`; keep `cache_control`.
**Acceptance.** A table of p50/p95 for both passes at both efforts in Notes; the chosen defaults in `.env.example`.

### V-01 Gateway boot + Twilio voice webhook
**Goal.** docs/05 §2.
**Files.** `apps/gateway/src/{server,env,log}.ts`, `twilio/{voiceWebhook,twiml}.ts` (schemas come from `@lastwell/core`); `server.ts` calls core's `warmup()` after boot (R-03).
**Acceptance.** Boot with a missing var prints the var name and exits 1; the log shows `claude.warmup` with `ms`. Real call from an unverified phone: the dispatcher phone rings and both people can talk; gateway log shows `event:"call.webhook"` with `callId`, `From` masked; a forged request without a valid signature gets 403. `twiml.test.ts` snapshots the XML.

### V-02 `@lastwell/stt`: InkSession + spike script
**Goal.** Prove the STT contract before building on it, in the shared package the eval runner will reuse.
**Files.** `packages/stt/src/{inkSession,wav}.ts` (constructor options per docs/05 §4; the package reads no env), `packages/stt/scripts/spike.ts` (`pnpm --filter @lastwell/stt spike file.wav`; reads `CARTESIA_API_KEY`, `CARTESIA_VERSION`, `STT_KEYTERMS` itself), unit test with an in-process mock WebSocket server.
**Acceptance.** Streaming a 16 kHz WAV at real-time pace prints `turn.start/update/end` events; the final transcript of a 20-second recording of Card A contains "coffee cup" and "Eliquis" (keyterms on); `{"type":"close"}` drains the last turn. Paste the event log.

### V-03 Media stream + InkSession + utterances
**Goal.** docs/05 §3–§5.
**Files.** `twilio/mediaStream.ts`, `stt/utteranceAssembler.ts`, `pipeline/callRegistry.ts`, tests with an in-process mock Twilio socket.
**Acceptance (Gate 0 + 1 evidence).** Real call: gateway log shows `utterance.final` lines for both `caller` and `dispatcher` with `tStartMs` increasing and `calls.streamStartedAt` set; finals arrive ≤ 2.5 s after the speaker stops (stopwatch, and `sttMs` in the log); hanging up produces `call.ended`. Unit: a `start` with a wrong `accountSid` closes with 1008; a `media` message without `track` is treated as inbound.

### V-04 UI hub (WS) + REST + store write-through
**Goal.** docs/03 §5–§6; docs/02 §2.
**Files.** `ui/{wsHub,rest,tokens}.ts`, `store/{convex,repo}.ts` (`convex.ts` wraps `ConvexHttpClient` with the typed refs in `store/convexApi.ts`; the functions already exist in `apps/gateway/convex/store.ts`); endpoints `GET /api/ws-token`, `GET /api/config`; Origin allowlist on WS upgrades (docs/03 §6).
**Acceptance.** `curl -H x-internal-key GET /api/ws-token` → token; `wscat -c ws://localhost:8787/ws/ui` → `{type:"auth", token}` → `subscribe call` returns `snapshot`; a bad token gets `error unauthorized`; an upgrade with `Origin: http://evil` is refused; during a real call the socket receives `utterance.partial` then `utterance.final`; `GET /api/calls/:id` returns the same utterances; `GET /api/config` returns the four flags; rows appear in the Convex `utterances` table; a wrong `CONVEX_URL` or secret does not stop the call (log `store.error`).

### V-05 Call runner (pipeline wiring)
**Goal.** docs/05 §6 with R-03/R-04/R-06.
**Files.** `pipeline/{callRunner,triggers}.ts`.
**Acceptance (Gate 2 live).** Real call reading Card A (time written on the card, docs/08 §6): `state.updated` messages show `signs` with quotes and `tMs`; `level` becomes `possible` after the first sign and `likely` ≤ 12 s after "coffee cup"; the banner shows the LKW question first (vague "since lunch"), then `lkw.display` shows the card's time with a ±15 min range; `facts` contain blood_thinner Eliquis; `latency.fastPassMs` and `reasonerMs` populated; `droppedCount` ≥ 0. One Claude failure (simulate with a bad key for one call) does not crash the process; three reasoner failures put `reasoner_delayed` in `state.warnings`.

### V-06 Alert approve: compose → Sonic bytes → outbound call
**Goal.** docs/05 §7.
**Files.** `alerts/{approve,alertRegistry}.ts`, `tts/sonic.ts` (bytes), `twilio/client.ts`, `twilio/alertStatus.ts`.
**Acceptance.** `POST /api/calls/:id/alert` on a live Card A state returns an `AlertSummary` with `briefingText` matching R-07; `alerts.transcriptSnapshot` holds the utterances; the gateway log shows `alert.created` with `ms` < 2500; the target phone rings within 20 s; status callbacks move the alert to `ringing`; 409 when level is `none`.

### V-07 Alert media stream: play briefing, marks, hang-up
**Goal.** docs/05 §8 up to the `briefing` mark; `FEATURE_QA_ENABLED=false` path hangs up after the mark.
**Files.** `twilio/alertStream.ts`, `tts/audioChunks.ts`.
**Acceptance (Gate 3).** Answering the call: speech starts ≤ 1.5 s after answer, the full briefing is intelligible, status becomes `briefed` when the mark returns, call ends cleanly; `alert.briefing_done` logged with `ms` since answer. Unit test with a mock Twilio socket asserts the message order: media×N → mark.

### V-08 Q&A loop with barge-in
**Goal.** docs/05 §8 after the mark.
**Files.** `alerts/qaLoop.ts`, `tts/sonic.ts` (websocket).
**Acceptance.** On the briefing call: "Is he on blood thinners?" → spoken answer within 3 s containing "Eliquis"; "Any seizure before this?" → "That wasn't mentioned on the call."; talking over an answer stops it within 0.5 s (clear + cancel); silence for 60 s hangs up; `qaTurns` records written.

### V-09 Browser-mic fallback (gateway)
**Files.** `browser/browserMedia.ts`, `POST /api/calls/browser`.
**Acceptance.** With W-08: speaking into the laptop produces `utterance.final` with `speaker mixed`; the console for that call behaves as in V-05.

### V-10 Degrade/reconnect, test-briefing endpoint, call-again
**Files.** reconnect logic in `packages/stt/src/inkSession.ts` and `state.warnings` plumbing in `callRunner.ts`; `POST /api/alerts/test-briefing {targetPhone}` (uses `fixtures/caseState.TEST.json`, label `TEST`); `POST /api/alerts/:id/retry`; `DELETE /api/alerts/test` (docs/03 §6).
**Acceptance.** Killing the Ink socket mid-call (block the host for 2 s) reconnects once and transcription resumes; a second kill puts `stt_degraded` in `state.warnings`; the test-briefing endpoint rings a phone with the canned text and the alert shows on the board with label `TEST`; `DELETE /api/alerts/test` removes it from the board without a reload (`alert.removed`) and from the registries; retry from `ringing` ends the first call and re-dials using the cached audio (no second Sonic call in the log); retry after a gateway restart re-synthesizes from `briefingText`.

### V-11 Replay endpoint for scripted calls
**Goal.** docs/05 §13: `POST /api/calls/replay {scriptId, speed}` creates a `replay` call (`label: scriptId`, `streamStartedAt = now`) and feeds the script's turns through the normal pipeline at `atMs / speed`, then ends the call.
**Files.** `pipeline/replay.ts`; `EVAL_SCRIPTS_DIR`.
**Acceptance.** Replaying B01 reaches `possible` with balance + eyes and a face/arm banner; its LKW reads about 30 minutes before the real clock; C01 shows the look-alike panel as resolved; `call.ended` arrives after the last turn; the console renders it like a live call.

### W-01 Web scaffold, proxy, WS hook, polling fallback
**Files.** `apps/web/app/layout.tsx`, `lib/{gateway,ws,config}.ts`, `app/api/gateway/[...path]/route.ts`, `hooks/useCall.ts` (holds `CallInfo`, utterances, partials, state, alerts; applies docs/03 §5 rules; fetches a token from `/api/gateway/ws-token` before connecting and again on reconnect; reconnects with backoff; polls `GET /api/calls/:id` every 1.5 s when disconnected); `lib/config.ts` loads `GET /api/config` once.
**Acceptance.** A test page shows connection status; killing the gateway flips it to "polling", restarting flips back; the WebSocket authenticates with a token (visible in the network tab) and no key appears in the browser bundle (`grep -r INTERNAL_API_KEY .next/static` empty).

### W-02 Console: live transcript pane
**Acceptance.** Real or replayed call: utterances appear with `mm:ss`, speaker label, partial line in grey; validated quotes underlined in amber once `state.signs/facts` reference them; clicking a quote in the card scrolls and flashes the utterance.

### W-03 Console: stroke card
**Acceptance.** Level pill colors: none grey, possible amber, likely red; "No stroke signs heard yet." headline when no signs; chips B E F A S T with T lit when `lkw` known; sign rows with quote + time; `modelLevel` and guard reason in a tooltip.

### W-04 Console: next question, look-alike, facts, latency
**Acceptance.** Banner text equals `state.nextQuestion.text`; hidden when null; look-alike panel lists `name — Ask: …` while unresolved and `name — answered: {fact value}` once the matching fact exists (docs/03 §9 table); facts panel shows LKW `display`, `minutesAgo` ticking every 30 s, the quote; blood thinner / age / sex / diabetes / seizure history / medications / address rows appear only when present; latency readout `fast {ms} · reason {ms}`; `state.warnings` render as yellow banners ("Transcription degraded — switch to the table mic", "Reasoner delayed").

### W-05 Console: Send pre-alert modal + alert status
**Acceptance.** Button disabled at level `none` with tooltip; modal prefills the caller number (phone mode, `demoAlertToCaller` from `/api/config`) and otherwise requires a typed number; requires `confirm` checkbox; shows "caller still on the line" until `call.ended`; after submit shows the alert status pill updating through `calling → ringing → answered → briefed → qa → completed`; "Call again" enabled on `calling`, `ringing` and `failed` (docs/03 §6 `retry`); footer links "Test briefing call" (prompts for a number) and "Clear test alerts" (both via docs/03 §6 endpoints).

### W-06 Board page
**Acceptance.** Cards from `board.snapshot` + `alert.updated`, removed on `alert.removed`; countdown per docs/06 §9; EMS toggle calls the API and flips the label; the sentence "The treating team makes every treatment decision." present; legible from 2 m on a laptop.

### W-07 Home: call list, start browser call
**Acceptance.** Lists recent calls with level and label; "Start browser-mic call" opens `/mic` (hidden when `featureBrowserMic` is false). The replay buttons are W-10.

### W-08 Mic page (AudioWorklet)
**Files.** `app/mic/page.tsx`, `public/worklets/downsampler.js`.
**Acceptance.** Level meter moves; the gateway receives 640-byte binary frames every 20 ms; speaking Card A produces a transcript on the console.

### W-09 Mic page: record to WAV (P2)
**Acceptance.** "Record" writes a 16 kHz mono 16-bit WAV named by the typed script id; playable; usable by E-02.

### W-10 Replay buttons
**Files.** `app/page.tsx` (buttons call `POST /api/gateway/calls/replay`).
**Acceptance.** Clicking "Replay B01" on `/` opens the console for the new call and the card reaches `possible` within 30 s.

### W-11 Visual polish
**Goal.** Dark console with high contrast, large type for the banner and the card, a monospace timestamp column, amber underlines, no layout shift when partials arrive. Board readable across a table.
**Acceptance.** Screenshots of console (Card A end state) and board in Notes; presenter approves.

### E-01 Runner: text mode + scoring + table
**Files.** `apps/eval/src/{run,scriptedRunner,score,report,env}.ts` (`validate.ts` exists since R-01).
**Acceptance.** docs/07 §6 items 1, 2, 4, 5; `hard_audio` scripts are skipped in text mode with a log line; the summary includes the level-agreement row.

### E-02 Runner: audio mode
**Files.** `apps/eval/src/audioRunner.ts` using `InkSession` and the WAV pacer from `@lastwell/stt`.
**Acceptance.** docs/07 §6 item 3; pacing verified (a 60 s file takes ≥ 60 s); `hard_audio` scripts load their turns and truth from `sourceId`.

### E-03 Full text run → slide
**Acceptance.** `results/*.json` committed (without transcripts of audio); the Markdown table pasted into the slide and Devpost with the "scripted calls" footnote.

### E-04 Audio run on subset
**Acceptance.** Per-group rows for E01–E06 in the results; one sentence on accent/panic results in the Devpost.

### C-01 Interview + quote
**Acceptance.** A quote with name/role consent in `docs/interview.md`; one line in the Devpost "Inspiration".

### C-02 Write the 20 scripts (D-33)
**Acceptance.** The 20 D-33 scripts (A01–A07, B01, B02, B04, B06, B08, C01–C05, D01, D02, D04), 8–14 turns each, from the docs/07 §3 seeds; `pnpm --filter @lastwell/eval validate` passes for all; each stroke script's caller turns contain the truth signs in lay words; reviewed by whoever has clinical exposure or a mentor (name in Notes).

### C-03 Record audio
**Acceptance.** WAVs for A01, B01, C01, E01–E06 at minimum (16 kHz mono); `ffprobe` output in Notes; stored in `apps/eval/audio/` (or a shared drive link in README if > 50 MB).

### C-04 Cards, slide, pitch
**Acceptance.** 12-card full deck + 4-card stroke pile as a printable PDF or HTML (D-31): front = facts for the caller in lay words (stroke cards carry the LKW blank, D-20), back = sealed answer and expected LastWell result, built only from scripts that pass X-02-style checks; cards printed; slide with the eval table placeholder; pitch timed at ≤ 2:00 in two dry runs.

### C-05 Devpost draft + final
**Acceptance.** Draft saved Saturday 11 PM with all sections from brief §13; "Built with" = claude-api, cartesia, twilio, next.js, convex, typescript; tracks selected per runbook §9.

### C-06 README for judges
**Acceptance.** Setup in ≤ 10 commands; architecture sketch; Cartesia features used; model list; known limits (scripted calls, single-track browser fallback, no SMS, demo auth); no keys.

### C-07 Backup video
**Acceptance.** `demo-backup.mp4` 90 s, cued on the presenter's laptop and uploaded to Devpost.

### C-08 Submission checklist
**Acceptance.** Every box in runbook §9 ticked, with who/when in Notes.

### M-01 … M-04 Gates
Observed by the whole team; the gate is `done` only when the brief's milestone is seen live. If a gate fails at its deadline, apply the brief's "if it fails" column (docs/08 §8) and record the decision in docs/09 §1.

### M-05 Feature freeze
`git tag freeze`; after this only PRs labelled `fix` merge; W-11 must be done before.

### M-06 Ten rehearsals
Runbook §7; the latency table from run 10 in Notes.

### M-07 Teardown
`npx convex run store:wipe '{"secret":"…"}'` until `remaining` is 0 (or delete the Convex project); rotate Twilio auth token, Cartesia and Anthropic keys; confirm the public repo has no secrets (`git log -p | grep -iE "sk_car|sk-ant|AC[0-9a-f]{32}"` empty).

---

### X-00 Docs alignment
**Goal.** docs/10 §2 decisions D-30…D-38 in docs/09; docs/00 (rows 5–7), docs/05 §2/§7 notes, docs/08 (§1, §3, §6, §9), `.env.example`, CLAUDE.md, this file.
**Acceptance.** No doc still says the judge's phone rings or that the judge is the caller.

### X-01a Fake model · X-01b Gateway fakes
Spec and acceptance: docs/10 §4 and §5 (Session 1 and 2 tables).

### X-02 Offline end-to-end test
**Acceptance.** docs/10 §5 Session 4 table: `pnpm e2e` spawns the gateway with `LASTWELL_FAKES=all` on a free port, drives the dev routes, and asserts the A01, B01 and C01 outcomes and the alert reaching `briefed`; green on `version1` at all times.

### X-03 Playwright smoke tests · X-05 Release prep
docs/10 §5 Session 4 table and §8.

## Backlog (not on the demo path; add here, never on the path)

- The 18 deferred eval scripts (D-33): A08–A10, B03, B05, B07, C06–C08, D03, D05, D06, E01–E06; audio mode (E-02, E-04, C-03, W-09).

- Speaker diarization for the browser-mic mode.
- SMS alert when a 10DLC-registered number exists (`alerts/sms.ts`, `ALERT_SMS_ENABLED`).
- Spanish/Cantonese (Ink 2 detects es; Sonic speaks es; prompts stay English).
- Prompt-cache metrics in the latency readout.
- Convex reactive queries for the board (alerts only) as an alternative transport.
