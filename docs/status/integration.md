# Status: integration lane

Only the integration session edits this file.

## Current task
- X-00 Docs alignment

## Last green commit on version1
- (X-04, see below)

## Acceptance evidence (pasted command output per task)

### X-04 Repo guardrails — done 2026-10-24 15:16 PT
- Root scripts: `verify` = `pnpm scan:secrets && pnpm -r typecheck && pnpm -r test && pnpm --filter @lastwell/eval validate`; `scan:secrets` = `node scripts/scan-secrets.mjs`; `e2e` = `pnpm --filter @lastwell/e2e e2e`; `dev:fake` = `node scripts/dev-fake.mjs`. `.claude/settings.json` was already on version1 (commit f4e9c28) and is unchanged.
- `pnpm verify` → exit 0 (11.6 s): "scan:secrets ok: 110 tracked files and HEAD history clean (7 patterns, self-test passed)"; typecheck all packages Done; tests core/stt/web/eval/gateway passed (gateway 5); validate "3 valid, 0 invalid (3 files)".
- Secret scan negative check: a file with a fake `sk_car_…` (34 chars) added with `git add -N` → "scan:secrets FAILED: 1 finding(s) · leak-probe.txt: Cartesia API key sk_car_Z…(34 chars)", exit 1. Placeholders in `.env.example` (`sk_car_...`, `sk-ant-...`, `ACxxxx…`) do not trigger; a self-test asserts both directions on every run.
- `GATEWAY_PORT=18787 WEB_PORT=13000 pnpm dev:fake` → gateway "listening on 18787", "[dev:fake] gateway up: {"ok":true,…}", web `curl /` → 200, "POST /api/calls/replay → 404 (V-11 not landed yet); will keep trying". SIGINT → both children and their ports gone (`lsof` empty).
- `pnpm e2e` → "e2e: no scenarios yet (task X-02 not landed) — nothing was tested" (placeholder package `apps/e2e`; X-02 fills it).

## blocked-keys (exact command to run once keys exist)
-

## wired-to-fake (replace when the named task lands)
- `pnpm dev:fake` replays A01 through `POST /api/calls/replay`; it logs a 404 until V-11 lands, and the gateway runs without fakes until X-01b lands (it ignores `LASTWELL_FAKES` today).

## Requests to other lanes
-

## Blockers for humans
-

## Notes and small decisions
- Secret scan is a Node script, not the docs/08 §9 grep: the literal grep matches the `.env.example` placeholders, and grep is not available the same way on Windows. It scans tracked files plus the `git log -p` history of HEAD, and fails on any tracked `.env*` other than `.env.example`.
- `dev:fake` and the e2e runner spawn pnpm through `npm_execpath` (no shell string), per docs/10 §10; ports are overridable so four worktrees on one machine do not collide.
- The e2e package lives at `apps/e2e` (X-02 text: "a new workspace package `apps/e2e`"), so the integration lane owns `apps/e2e/**` in addition to the `e2e/**` named in docs/10 §6. It has no `test` script, so `pnpm -r test` never spawns a gateway.
