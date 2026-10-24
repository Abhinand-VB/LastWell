# 10: Build spec for autonomous Claude Code sessions

This document tells Claude Code sessions what to build, in what order, how to work without supervision, and how the work lands. It sits on top of docs 00 to 09: those remain the source of truth for behavior, schemas, prompts and acceptance criteria. **Where this file and an earlier doc disagree, this file wins**, and task X-00 records each difference in the docs/09 decision log so the earlier docs stop disagreeing.

Read order for every session: `CLAUDE.md` → this file → `docs/00` → `docs/01` → `docs/03` → your lane's docs (listed in CLAUDE.md) → `docs/TASKS.md`.

## 1. Where we are (repo state at commit 5729f71)

Built and tested (199 tests pass): contracts (R-01), quote validator (R-02), CaseState reducer, level guard and next-question ladder (R-04), LKW parser (R-05), briefing composer (R-07), keyword baseline (R-09), Convex store schema and functions (D-29), workspace scaffold (S-01, S-02).

Not built: every Claude call (R-03, R-06, R-08, R-10), the STT client (V-02), the whole gateway beyond `/healthz` (V-01…V-11), the whole web app (W-01…W-11), the eval runner (E-01), 35 of 38 eval scripts (C-02), the judges' README (C-06).

Accounts: **only Convex is ready.** Twilio, Cartesia and the Anthropic API key are not. Therefore every lane must be able to finish its code and its offline tests without them (§4). Live acceptance criteria wait for keys and are tracked as `blocked-keys`, which does not count as a failure.

## 2. Decisions that change earlier docs

X-00 adds these to the docs/09 decision log as D-30 to D-38 and edits the docs named in the "Consequence" column.

| ID | Decision | Consequence |
| --- | --- | --- |
| D-30 | The briefing call goes to a **teammate's phone** (the "medical professional"), never the judge's. `DEMO_ALERT_TO_CALLER=false`; the Send modal prefills `ALERT_DEFAULT_TARGET_PHONE`. | Removes gotchas G-08 and G-09 from the demo path. D-18 is relaxed: Send is enabled while the 911 call is still live, because the target is a different phone. Update docs/00 acceptance rows 5 to 7, docs/08 §1 to §5, `.env.example`. |
| D-31 | A **teammate is the caller.** The judge draws a card from the **full deck** (12 cards: strokes, chameleons, look-alikes) and later from the **stroke pile** (4 cards), each with facts on the front and a sealed answer on the back; the judge flips the card after LastWell decides. The caller teammate dials the Twilio number; the dispatcher teammate answers on `DISPATCHER_PHONE`. | Code unchanged (inbound path is the same). docs/08 §3, §6 rewritten; cards are task C-04. D-20 (handwritten LKW time) still applies to every stroke card. |
| D-32 | **Spoken Q&A is last.** `FEATURE_QA_ENABLED=false` by default. R-08 and V-08 start only after the P0 and P1 lists in §5 are merged and the offline end-to-end test (X-02) is green. | docs/09 cut list: Q&A is now built last; it is no longer an on-demand cut. Acceptance row 7 in docs/00 becomes optional. |
| D-33 | **Eval is text mode only, on 20 scripts**: A01 to A07, B01, B02, B04, B06, B08, C01 to C05, D01, D02, D04. Audio mode (E-02, E-04) and E01 to E06 are deferred. | docs/07 §3 marks the others as backlog; the slide says "20 scripted calls". |
| D-34 | **Fakes for every external service** (§4), selected by `LASTWELL_FAKES`, so all lanes build and test without keys. Fakes are refused at boot when `DEMO_MODE=true`. | New env vars `LASTWELL_FAKES`, `DEMO_MODE`; gateway prints a red banner while any fake is active. |
| D-35 | **Outbound call allowlist.** The gateway only places calls to numbers in `ALERT_ALLOWED_NUMBERS` (E.164, comma-separated) and returns 409 otherwise. | Protects against an autonomous session dialing a real stranger. `.env.example` gains the variable. |
| D-36 | **Inbound audio:** Twilio phone call is primary; the existing single-track browser-mic fallback (V-09, D-13) is the backup. No two-stream browser mode is built. | None beyond docs/05 §10 staying as written. |
| D-37 | **Tracks:** Devpost has no Anthropic prize (docs/09 §5). Pitch leads with Microsoft, Cartesia and the Cal Hacks general prizes. The Convex track is skipped because Convex is a write-through store here (D-04). | docs/08 §9 unchanged except a note. |
| D-38 | **Coordination protocol** for four parallel sessions (§6) and the landing plan (§8). | CLAUDE.md "Conventions" points here; branch rules there are replaced by §8. |

## 3. Non-negotiables (repeated from CLAUDE.md, plus three new ones)

- The demo path never breaks: caller dials the Twilio number → dispatcher answers → live transcript → stroke flag with quotes → dispatcher approves → the medical professional's phone rings with the Sonic briefing.
- Quote or drop. Never weaken `validate/quotes.ts`, `validate/levelGuard.ts` or their tests.
- Time is computed by code, never by a model.
- Never "not a stroke", never dispatch, never change priority, never instruct the caller.
- No secrets in git. No sampling parameters on Claude requests.
- **New:** never delete, skip or loosen a test to make it pass (live tests are the only `skip`, via the existing `LIVE` guard).
- **New:** never place a real call to a number outside `ALERT_ALLOWED_NUMBERS`, and never run live API tests in a loop (§7.4 budget).
- **New:** never push to `main`, never force-push `version1`, never rewrite published history.

## 4. Fakes: building without keys

Every external dependency sits behind an interface with a real and a fake implementation. Selection is by `LASTWELL_FAKES`, a comma-separated list from `claude, stt, tts, twilio, store` (or `all`). The gateway parses it in `apps/gateway/src/env.ts`; `packages/core` never reads it (it receives a `ModelClient` as config, keeping the CLAUDE.md rule that core reads only `ANTHROPIC_API_KEY` and `CLAUDE_TIMEOUT_MS`).

| Interface | Real | Fake | Owner (task) |
| --- | --- | --- | --- |
| `ModelClient` (§4.1) | `packages/core/src/claude/{fastPass,reasoner,qa}.ts` | `packages/core/src/claude/fake.ts`: deterministic rules. Signs from a phrase table (lay phrases per BE-FAST kind, superset of the keyword baseline vocabulary); facts from regexes (LKW phrases: "fine at…", "since…", "…ago", "when…"; blood thinners from the `STT_KEYTERMS` drug list; diabetes/insulin/seizure/alcohol/migraine cues); every quote is an exact substring of the utterance so the validator keeps it. The fake reasoner proposes level from validated sign kinds (the guard still decides), look-alikes from cue words, and next-question kinds from the docs/03 §9 menu. **Must reproduce the docs/04 fixture expectations for A01, B01 and C01.** | Reasoning (X-01a) |
| `SttSessionFactory` returning sessions that emit `turn.update` / `turn.end` | `@lastwell/stt` `InkSession` | `FakeSttSession`: accepts audio and discards it; text arrives through the dev injection route or replay | Voice (X-01b) |
| `TtsClient.synthesize(text) → µ-law bytes` | `tts/sonic.ts` | `FakeTts`: returns silence of `max(1500, 60 ms × words)` ms as µ-law `0xFF` bytes | Voice (X-01b) |
| `TelephonyClient.placeCall(to, alertId)` plus status events | `twilio/client.ts` | `FakeTelephony`: records the request, checks the allowlist, then emits `ringing` (+1 s), `in-progress` (+2 s), streams the briefing bytes to nowhere, emits the mark and `completed`, driving the same alert-status transitions as Twilio callbacks | Voice (X-01b) |
| `Store` (the gateway's `store/repo.ts` surface) | Convex via `ConvexHttpClient` | `MemoryStore`: maps in process | Voice (X-01b) |

### 4.1 The `ModelClient` interface (lands first, so Voice never waits on Reasoning)

`packages/core/src/claude/types.ts`, exported from `@lastwell/core`, written by the Reasoning session as the first commit of X-01a (within its first 20 minutes) and never changed afterwards without a request:

```ts
export interface ModelClient {
  fastPass(input: FastPassInput): Promise<ModelResult<FastPassOutput>>;
  reason(input: ReasonerInput): Promise<ModelResult<ReasonerOutput>>;
  answer(input: QaInput): Promise<ModelResult<QaOutput>>;
}
export interface ModelResult<T> { output: T | null; ms: number; refused?: boolean; truncated?: boolean }
```

`FastPassInput`, `ReasonerInput` and `QaInput` are the user-message builder inputs in docs/04 §2 to §4; the output types are the docs/03 §4 model-output schemas (`FastPassOutput`, `ReasonerOutput`, `QaOutput`). `createClaudeClient(config)` and `createFakeModel()` both return a `ModelClient`. The gateway chooses between them from `LASTWELL_FAKES` and passes the instance into the call runner.

Dev-only routes (registered only when any fake is active and `DEMO_MODE` is not `true`):

- `POST /api/dev/calls` → `{callId}`: creates a call as if Twilio had connected (mode `phone`, label `dev`).
- `POST /api/dev/calls/:callId/utterances {speaker: "caller"|"dispatcher", text}`: injects a final utterance into the call runner exactly where `utteranceAssembler` would.
- `POST /api/dev/calls/:callId/end`.

Root script `pnpm dev:fake`: starts the gateway with `LASTWELL_FAKES=all` and the web app, then replays A01 every 90 s so the console always has something live to render. This is what the Screens lane develops against.

## 5. Work order

Priorities: **P0** = the demo path and its offline proof; **P1** = demo quality and safety nets; **P2** = only after P0 and P1 are merged and X-02 is green. Within a lane, take tasks top to bottom unless a dependency is missing; then take the next task whose dependencies are met. Acceptance criteria are in docs/TASKS.md unless the task is new (X-tasks below).

### Session 1: Voice and gateway (lane V)

| Pri | Task | Notes |
| --- | --- | --- |
| P0 | V-02 InkSession + spike | Unit tests against an in-process mock WebSocket server now; the spike against Cartesia waits for the key (`blocked-keys`). |
| P0 | X-01b Gateway fakes and interfaces | §4 table rows 2 to 5, dev routes, `LASTWELL_FAKES`, `DEMO_MODE`, `ALERT_ALLOWED_NUMBERS` in `env.ts`. Acceptance: gateway boots with `LASTWELL_FAKES=all` and no other secrets; `/healthz` reports `fakes: [...]`. |
| P0 | V-01 Boot + voice webhook | TwiML snapshot test; signature validation unit-tested with a fixed token. |
| P0 | V-03 Media stream + utterances | Mock Twilio socket tests. |
| P0 | V-04 UI hub, tokens, REST, store | Against `MemoryStore` in tests; Convex adapter used when `store` is not faked. |
| P0 | V-05 Call runner | Uses the `ModelClient` interface; with the fake model until R-03/R-06 land. |
| P0 | V-11 Replay endpoint | Moved up: it is the demo's fallback and the e2e driver. |
| P0 | V-06 Approve → compose → bytes → outbound call | Allowlist enforced (D-35); prefill from `ALERT_DEFAULT_TARGET_PHONE` (D-30). |
| P0 | V-07 Alert media stream, marks, hang-up | Mock socket asserts media×N → mark. |
| P1 | V-10 Degrade/reconnect, test-briefing, call-again | |
| P1 | V-09 Browser-mic fallback (gateway side) | Single mixed track (D-13). |
| P2 | V-08 Q&A loop with barge-in | Only per D-32. |

### Session 2: Reasoning and eval (lanes R, E)

| Pri | Task | Notes |
| --- | --- | --- |
| P0 | X-01a Fake model | §4 row 1. Acceptance: a unit test runs A01, B01, C01 utterances through fake fast pass → validator → reducer → fake reasoner → guard and reaches the docs/04 fixture expectations and the docs/00 acceptance rows 2 to 4 and 9 (levels, chips, LKW, banner). |
| P0 | R-03 Claude client + fast pass | Offline: unit tests with a stubbed SDK transport asserting request shape (model, effort, thinking, `max_tokens`, `output_config.format`, no sampling params). Live test `blocked-keys`. |
| P0 | R-06 Reasoner wrapper | Same pattern as R-03. |
| P0 | E-01 Runner, text mode | Runs against the fake model offline (`--model fake`) and the real one when keyed (`--model live`); prints the docs/07 §5 table for LastWell and the baseline. |
| P1 | R-10 Prompt caching + latency tuning | Needs keys; until then, implement the cache-control placement and unit-test request shapes. |
| P1 | E-03 Full text run → slide numbers | `blocked-keys` until the Anthropic key exists. Budget §7.4. |
| P2 | R-08 Q&A wrapper | Only per D-32. Its quote/fallback enforcement is testable offline. |

### Session 3: Screens (lane W)

Develop against `pnpm dev:fake`. Follow docs/01 §7 and docs/03 §5 to §6 for every message and route.

| Pri | Task | Notes |
| --- | --- | --- |
| P0 | W-01 Scaffold, proxy, WS hook, polling fallback | |
| P0 | W-02 Transcript pane | |
| P0 | W-03 Stroke card | Chips with clickable quotes. |
| P0 | W-04 Next question, look-alike, facts, latency | |
| P0 | W-05 Send pre-alert modal + alert status | Prefill from config (D-30); Send enabled while the call is live; shows the allowlist error clearly. |
| P1 | W-06 Board | |
| P1 | W-07 Home: call list | |
| P1 | W-10 Replay buttons | |
| P1 | W-08 Mic page (AudioWorklet) | |
| P1 | W-11 Visual polish | Before freeze. Calm clinical look; large type for the projector distance of a judging table. |
| P2 | W-09 Record to WAV | Deferred with audio eval (D-33). |

Every page gets a Playwright smoke test that runs against `pnpm dev:fake` (X-03).

### Session 4: Integration, content and release (new lane X, plus C)

| Pri | Task | Notes |
| --- | --- | --- |
| P0 | X-00 Docs alignment | Add D-30…D-38 to docs/09; edit docs/00 (acceptance rows 5 to 7), docs/05 §2/§7 notes, docs/08 (§1 roles, §3 script, §6 cards, §9 tracks note), `.env.example` (new vars, new defaults), CLAUDE.md (pointer to this file, branch rules → §8), TASKS.md (new X rows, priorities, `blocked-keys` status). Acceptance: no doc still says the judge's phone rings or that the judge is the caller. |
| P0 | X-04 Repo guardrails | `.claude/settings.json` (provided alongside this file), root scripts `verify` (`pnpm -r typecheck && pnpm -r test && pnpm --filter @lastwell/eval validate`), `dev:fake`, `e2e`. A secret-scan script `pnpm scan:secrets` (the docs/08 §9 grep) run inside `verify`. |
| P0 | C-02 Write the 20 scripts (D-33) | From the docs/07 §3 seeds, 8 to 14 turns each, validated by `pnpm --filter @lastwell/eval validate`. A human clinical glance is a C-02 note, not a blocker. |
| P0 | X-02 Offline end-to-end test | `pnpm e2e`, a black-box test in a new workspace package `apps/e2e` that imports nothing from the gateway: it spawns `pnpm --filter @lastwell/gateway dev` with `LASTWELL_FAKES=all` and a free port, waits for `/healthz`, then drives the dev routes over HTTP and reads results over the docs/03 §5 WebSocket and §6 REST. It creates a dev call, injects A01's turns, and asserts: level `likely` with ≥ 2 chips each carrying a validated quote; LKW parsed with its range; the banner sequence of docs/00 row 4; approve to an allowlisted number → alert status reaches `briefed`; the board REST lists the alert. Then B01 → `possible` with balance + eyes and a face/arm banner; C01 → look-alike panel resolved. Must stay green on `version1` at all times. |
| P1 | X-03 Playwright smoke tests | Console and board render the A01 replay under `pnpm dev:fake`. |
| P1 | C-04 Cards (D-31) | 12-card full deck + 4-card stroke pile as a printable PDF or HTML: front = facts for the caller in lay words, back = sealed answer and expected LastWell result, built only from scripts that pass X-02-style checks. Stroke cards carry the LKW blank (D-20). |
| P1 | C-06 Judges' README | Setup, architecture sketch, Cartesia features used, honest limits, `.env.example` only. |
| P1 | X-05 Release prep | Writes `docs/status/RELEASE.md`: what passed, what is `blocked-keys`, the human checklist (§9), and opens the `version1 → main` PR (§8); if `gh` is not authenticated, writes the PR title and body to `docs/status/RELEASE.md` for a human to open. |

### Single-session fallback order

If only one session runs: X-04 → X-00 → X-01a → X-01b → V-02 → R-03 → V-01 → V-03 → V-04 → V-05 → V-11 → X-02 → W-01…W-05 → V-06 → V-07 → R-06 → C-02 → E-01 → W-06, W-07, W-10 → V-10 → V-09, W-08 → X-03 → C-04 → C-06 → W-11 → X-05 → (D-32) R-08, V-08.

## 6. Coordination between four sessions

- **One worktree and branch per session**, all cut from `version1`:
  `git worktree add ../lw-voice -b lane/voice origin/version1` (likewise `lane/reasoning`, `lane/screens`, `lane/integration`).
- **File ownership.** A session edits only files in its lane:
  - Voice: `packages/stt/**`, `apps/gateway/**`
  - Reasoning: `packages/core/**` (including contracts), `apps/eval/src/**`
  - Screens: `apps/web/**`
  - Integration: `docs/**`, `apps/eval/scripts/**`, root files (`package.json` scripts, `.claude/`, `.env.example`, `README.md`, `CLAUDE.md`), `e2e/**`
- **Shared surface changes go through requests.** A session that needs something outside its lane (a new contract field, a new root script, a REST route) writes it under the "Requests to other lanes" heading of its own status file: `- [ ] to <lane>: <what> (<why>)`. Every session reads all four status files at the start of each task and handles requests addressed to it before its own next task, ticking the line with the commit hash. Only the author of a status file edits it, so rebases never conflict on these files. Contract changes also follow the CLAUDE.md rule (producer, every consumer and a decision-log line in one change), which only the Reasoning session may make.
- **Status.** Each session keeps `docs/status/<lane>.md`: current task, last green commit, acceptance evidence, requests to other lanes, blockers for humans. Only Integration edits `docs/TASKS.md` and `docs/status/BLOCKERS.md` (an aggregate for humans), at merge time, from the four lane files. The CLAUDE.md step "claim a task by writing your initials in TASKS.md" is superseded: claims are the "Current task" line of the lane file.
- **Blockers.** Anything needing a human (keys, phone numbers, a judgment call the docs do not settle) goes under "Blockers for humans" in the lane's own status file with the question and what the session did meanwhile. The session never waits; it takes the next task. Humans answer by editing the relevant doc or `.env`, then tick the line.
- **Dependencies.** Before starting a task, `git fetch` and check that its dependencies are merged on `origin/version1`. If not, code against the interface with the fake and leave a `// wired-to-fake: replace when <task> lands` comment listed in the lane status file (not a TODO on the demo path).

## 7. How each session works unattended

### 7.1 The loop (per task)

1. `git fetch && git rebase origin/version1`; read all four `docs/status/*.md` files and handle requests addressed to this lane.
2. Read the task's docs and acceptance criteria. Write the tests first where the criteria are testable offline.
3. Implement. Run `pnpm verify` (and `pnpm e2e` once X-02 exists).
4. Red? Fix and rerun, up to 5 attempts. Still red: `git stash` the attempt, record the failure (command, error, hypothesis) under the lane file's blockers, move to the next independent task.
5. Green? Commit (`<lane>: <task-id> <what>`), update `docs/status/<lane>.md`, then land it (§8).
6. Time box: 60 minutes of wall time per task. Over it, commit what is green behind a flag that defaults to the previous behavior, record the rest as a blocker, move on.

### 7.2 Definition of done (adds to CLAUDE.md)

- Every offline-testable acceptance criterion observed and pasted in the lane status file.
- Criteria that need keys marked `blocked-keys` with the exact command to run once keys exist.
- `pnpm verify` and `pnpm e2e` green after rebasing on `origin/version1`.

### 7.3 What the session decides alone vs. writes down

Decide alone and note in the lane status file: naming, file layout inside the lane, library choice within docs/01 §3 majors, UI layout details, test structure. Write a blocker in the lane file and continue elsewhere: anything that changes a contract, a prompt's wording (docs/04 §6 protocol), a decision in docs/09, vendor account settings, or spending.

### 7.4 Live API budget (once keys exist)

- Anthropic: `test:live` at most 3 runs per hour per session; full eval (E-03) at most twice before freeze.
- Cartesia: live STT/TTS tests only for the gate tasks (V-02 spike, M-01, M-02, M-04) and at most 10 minutes of audio per hour.
- Twilio: real calls only to `ALERT_ALLOWED_NUMBERS`; never from a loop or a test that runs in `verify`.

## 8. How the code lands

- **Integration branch: `version1`.** Each session lands a task by rebasing onto `origin/version1`, running `pnpm verify && pnpm e2e`, and pushing with a plain fast-forward: `git push origin HEAD:version1`. If the push is rejected (someone landed first), fetch, rebase, rerun the checks, push again. No force-pushes, no merge commits on `version1` (linear history makes bisecting easy at 3 AM).
- **A green `version1` is the rule.** If a push turns `pnpm e2e` red on `version1`, the pushing session reverts its own commit first and fixes second.
- **One PR into `main` at the end.** Integration (X-05) opens `version1 → main` with the description from `docs/status/RELEASE.md`: tasks done, `blocked-keys` items with their commands, the human checklist, test counts, and screenshots from X-03. A human reviews and merges it. Tag `demo-ready` on the merge commit after the human gates (§9) pass.
- **Mid-way safety PRs.** At the P0 milestone (all P0 tasks landed, X-02 green), Integration also opens a draft PR `version1 → main` so teammates can review early; it is updated by the same branch.

## 9. Human checklist (things only people can do)

| When | What | Unblocks |
| --- | --- | --- |
| Before starting sessions | Node 22, pnpm 9, git and Claude Code on every machine; GitHub push access to `version1` on every machine; `gh auth login` on the Integration machine (optional, for the PR) | Everything |
| Before starting sessions | Convex: `CONVEX_URL` in `.env`, `INTERNAL_API_KEY` set in the deployment with `npx convex env set` (sessions are not allowed to run that), `npx convex dev` run once in `apps/gateway` so `_generated/` exists | V-04 with the real store |
| Now | Anthropic API key with a spending limit; put in `.env` on the gateway laptop | R-03/R-06 live tests, E-03, M-03 |
| Now | Cartesia Pro plan (or sponsor credits); pick and freeze the voice (S-05) | V-02 spike, M-01, M-02, M-04 |
| Now | Twilio: upgrade from trial, buy a number, set the voice webhook to `{PUBLIC_BASE_URL}/twilio/voice` (S-04); ngrok account, auth token and static domain (D-15) | V-01/V-03 live, M-01, M-02, M-04 |
| Now | Fill `DISPATCHER_PHONE`, `ALERT_DEFAULT_TARGET_PHONE` and `ALERT_ALLOWED_NUMBERS` with the dispatcher's and the medical professional's phones | V-06/V-07 live, M-04 |
| Sat evening | EMT interview quote (C-01); clinical glance at the 20 scripts | Devpost, C-02 sign-off |
| Sat night | Print the card deck (C-04); record the backup video (C-07) | Demo |
| Sun morning | Set `DEMO_MODE=true` and `LASTWELL_FAKES=` (empty) in the demo `.env` and confirm the red banner is gone; ten rehearsals (M-06); merge the `version1 → main` PR; submit Devpost by 8:00 | Submission |

## 10. Running the sessions

Start each session in its worktree with `claude`, then switch it to auto mode (or start with `claude --permission-mode acceptEdits`; the allow list in `.claude/settings.json` covers every command the loop needs, so prompts stay rare). The deny rules in that file apply in every mode, including auto and bypass. If a session stalls on a permission prompt, approve it once and add the pattern to the allow list through Integration.

**Mixed macOS and Windows.** Package scripts already run through pnpm's shell emulator (`.npmrc`), so no script may use bash syntax. Code that spawns processes (the e2e runner, `dev:fake`) uses `execa` or `child_process.spawn` with an explicit executable and argument array, never a shell string. Paths use `path.join`, never hard-coded slashes. Run the gateway, ngrok and the demo on a macOS laptop; Windows machines are fine for every lane's development, but Windows Defender Firewall may block the gateway's WebSocket port on first run (allow it once).

**No `gh` CLI.** X-05 writes the PR title and body to `docs/status/RELEASE.md`; a human opens `version1 → main` on GitHub and pastes them. The draft PR at the P0 milestone is opened the same way.

**Shifts.** Two or three people are awake at a time. Blockers may therefore wait hours, which is why no session ever waits on one. The person on duty runs this loop every hour: read `docs/status/BLOCKERS.md`, answer what you can by editing docs or `.env`, tick the lines in the lane files, put any new keys into every worktree's `.env` and note it in BLOCKERS.md, then glance at each session's last message. At shift change, the outgoing person leaves a three-line note at the top of `docs/status/BLOCKERS.md`: what was answered, what is still open, what to watch.

## 11. Freeze and cut rules

- P0 complete and X-02 green by **Saturday 11 PM**; P1 by **Sunday 2 AM** (feature freeze, M-05). After freeze: bug fixes only, each with a test.
- If P0 is not complete by Sunday 1 AM, drop to: replay-driven demo (V-11 + console + approve + briefing call), and say in the pitch that the live line is the next step.
- Q&A (D-32) starts only if P0 and P1 are merged and X-02 is green; it ships behind `FEATURE_QA_ENABLED`, default `false` until two clean rehearsals with it on.
