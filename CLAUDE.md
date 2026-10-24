# LastWell — agent operating manual

LastWell is a Cal Hacks 13.0 project (Palace of Fine Arts, SF). **Devpost submission closes Sunday Oct 25, 2026, 9:00 AM PT — a hard deadline** (verified on the Devpost page 2026-10-24; the team must also be checked in at the venue by 8:00 AM). Plan every "last" task to finish by 8:00 AM. It is built by a team of four, each driving a coding agent. **The files in `docs/` are the source of truth.** When code and docs disagree, the docs win until a human edits the docs.

Nothing in this repository was written before the event. These documents are planning material (allowed by the Hacker Guide); all code is written during the hacking window. The original brief is at `docs/brief/LastWell_Project_Brief.pdf`; where this manual and the brief differ, the decision log in `docs/09` explains why.

## Read in this order (≈10 minutes)

1. `docs/00-OVERVIEW.md` — what we build, what we never build, the acceptance test that defines "done"
2. `docs/01-ARCHITECTURE.md` — components, repo layout, verified vendor facts, data flow, environment variables
3. `docs/03-CONTRACTS.md` — every schema and message shape; you will implement these as zod schemas in `packages/core`
4. Your lane's doc:
   - Voice lane → `docs/05-VOICE-PIPELINE.md`
   - Reasoning lane → `docs/04-PROMPTS.md`, `docs/06-LKW-PARSER.md`
   - Screens lane → `docs/02-DATA-MODEL.md` + the "Web app" section (§7) of `docs/01-ARCHITECTURE.md`
   - Eval / clinical / pitch lane → `docs/07-EVAL.md`, `docs/08-DEMO-RUNBOOK.md`
5. `docs/TASKS.md` — pick the next unclaimed task in your lane. Claim it by writing your initials in the Owner column before starting.
6. `docs/09-DECISIONS-AND-RISKS.md` — read the "Gotchas" section before touching Twilio, Cartesia or the Claude API. Every item there costs an hour if ignored.

## Non-negotiables

- **The demo path never breaks.** Inbound call → live transcript → stroke flag with quotes → dispatcher approves → the caller's own phone rings with the Sonic briefing. Any change that risks this path ships behind a feature flag that defaults to the previous behavior.
- **Quote or drop.** Every sign and fact shown to a human carries a verbatim quote from the transcript, attached to a transcript timestamp by code. The quote validator (`docs/03-CONTRACTS.md` §7) drops anything else. Never weaken it.
- **Time is computed by code, never by a model** (`docs/06-LKW-PARSER.md`). Models output phrases; the parser outputs clock times and ranges.
- **LastWell never says "not a stroke", never dispatches units, never changes call priority, never gives medical instructions to the caller.** When nothing is heard, the card says "No stroke signs heard yet."
- **No secrets in git.** `.env` is gitignored; `.env.example` lists every variable with a comment. Secrets are read from `process.env` only, in `apps/gateway/src/env.ts`, `apps/eval/src/env.ts`, `packages/stt/scripts/spike.ts`, `packages/core/src/claude/client.ts` and, for the web app's server side, `apps/web/lib/env.ts` (`INTERNAL_API_KEY`, `GATEWAY_URL`; the browser bundle sees only `NEXT_PUBLIC_*` variables; the web app has no database access at all). The full variable-to-process table is `docs/01-ARCHITECTURE.md` §8.
- **Contracts are shared.** Do not change a schema in `docs/03-CONTRACTS.md` without updating the producer and every consumer in the same change, and adding a line to the decision log in `docs/09`.
- **No sampling parameters.** The Claude API version we use (`2026-10-21`, `@anthropic-ai/sdk` v1) rejects `temperature`, `top_p`, `top_k`. Do not set them.

## Conventions

- TypeScript everywhere, `"strict": true`, ESM, Node 22 LTS, pnpm workspaces. No Python (one language, fewer failure points).
- Validate every external input with zod at the boundary: Twilio webhook bodies, WebSocket messages, LLM outputs, HTTP bodies, environment variables (fail fast at boot with a readable message).
- Logging: `pino` JSON. Every gateway log line carries `callId` (and `alertId` when relevant). Latencies are integers in milliseconds under the key `ms`.
- An error inside one call must never crash the gateway process. Every per-call handler is wrapped; log and continue; the call's `caseStates` record gets `lastError`.
- Timeouts: Claude requests 8 s with one retry; Cartesia WebSocket reconnect once then degrade (`docs/05` §9); Twilio REST 10 s.
- `packages/core` does no I/O except calling the Claude API, and reads only `ANTHROPIC_API_KEY` and `CLAUDE_TIMEOUT_MS` from the environment; everything else arrives as config. The Ink 2 client lives in `packages/stt` (shared by the gateway and the eval runner). Everything else that touches Twilio, Cartesia, Convex or HTTP lives in `apps/gateway` (Convex functions in `apps/gateway/convex/`); the test runner lives in `apps/eval`.
- Commit messages: `<lane>: <task-id> <what>` — e.g. `voice: V-03 route media frames to two STT sessions`.
- Branch per task, merge to `main` as soon as the acceptance criteria pass. `main` must always start and serve the demo path.

## Commands

The first four exist after task S-02; `validate` arrives with R-01, `spike` with V-02, `eval --mode text` with E-01 and `--mode audio` with E-02. Teammates are on both macOS and Windows: package scripts must not rely on bash syntax (`LIVE=1 cmd`, `$VAR`) — the root `.npmrc` sets `shell-emulator=true` so pnpm runs scripts through its own POSIX-style emulator on every OS (scaffold in `docs/scaffold/README.md`).

```
pnpm install
pnpm -r typecheck
pnpm -r test
pnpm --filter @lastwell/core test:live                        # fixtures against the real Claude API (needs ANTHROPIC_API_KEY)
pnpm --filter @lastwell/gateway dev                           # gateway on :8787
pnpm --filter @lastwell/stt spike path/to.wav                 # stream a WAV to Ink 2, print turn events
pnpm --filter @lastwell/web dev                               # web on :3000
pnpm --filter @lastwell/eval validate                         # check every script in apps/eval/scripts
pnpm --filter @lastwell/eval eval --mode text                 # scripted eval (docs/07). Script args follow the script name directly: no `--` (pnpm forwards a literal `--` to the script)
pnpm --filter @lastwell/eval eval --mode audio --ids A01,B01,C01
ngrok http 8787 --domain $NGROK_DOMAIN                        # public URL for Twilio (bash/zsh)
ngrok http 8787 --domain $env:NGROK_DOMAIN                    # same, PowerShell
```

## Definition of done (any task)

1. Every acceptance criterion in `docs/TASKS.md` was **observed**, not assumed. Paste the command output or the observation into the task's Notes.
2. `pnpm -r typecheck && pnpm -r test` pass on your branch.
3. No new `TODO` on the demo path. Other TODOs go into the backlog at the bottom of `docs/TASKS.md`.
4. `docs/TASKS.md` status and Notes updated; relevant doc updated if behavior changed.

## When you are blocked or unsure

If a decision cannot be undone (deleting data, changing a contract, changing the Twilio number configuration) and could reasonably go either way, stop, write the question in the task's Notes, and move to another task. Otherwise take the most reasonable reading of the docs, write which reading you took in the Notes, and keep going. Nobody is waiting to approve small choices; everybody is waiting on the demo path.
