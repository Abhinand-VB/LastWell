# Status: voice lane

Only the voice session edits this file.

## Current task
- V-02 InkSession + spike (started 2026-10-24, then X-01b, V-01, V-03, V-04, V-05, V-11, V-06, V-07)

## Last green commit on version1
-

## Acceptance evidence (pasted command output per task)

### V-02 InkSession + spike — offline done, live spike blocked (needs a Card A recording)
- `packages/stt/src/{inkSession,wav}.ts`, `scripts/spike.ts`; package reads no env (the spike reads the repo-root `.env`).
- `pnpm --filter @lastwell/stt test` → 13 passed against an in-process `ws` server: URL params per docs/05 §4 (call and qa profiles, one `keyterm` per term), `X-API-Key` header, audio queued before open then forwarded as binary, turn.start/update/eager_end/end → partial/final with track timestamps and `sttMs`, empty finals ignored, finals never concatenated, `{"type":"close"}` drains the last turn, close timeout, reconnect once then `degraded`, 401 → degraded without reconnect, no throw without error listeners, µ-law silence 0xFF, WAV parse + 20 ms real-time pacing.

## blocked-keys (exact command to run once keys exist)
- V-02 live spike: keys are in `.env`, but there is no recording. Record ~20 s of Card A (16 kHz mono WAV) to `apps/eval/audio/A01.wav`, then `pnpm --filter @lastwell/stt spike apps/eval/audio/A01.wav` → expect turn.start/update/end lines and a FINAL TRANSCRIPT containing "coffee cup" and "Eliquis".

## wired-to-fake (replace when the named task lands)
-

## Requests to other lanes
- [ ] to <lane>: <what> (<why>)

## Blockers for humans
- [ ] V-02 · Need a ~20 s 16 kHz mono WAV of someone reading Card A's caller lines at `apps/eval/audio/A01.wav` (gitignored) for the live spike; my attempt to synthesize one with Sonic from an ad-hoc script was refused by the permission system · moved on to X-01b; command above.

## Notes and small decisions
-
