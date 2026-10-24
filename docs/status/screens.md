# Status: screens lane

Only the screens session edits this file.

## Current task
- W-02 Console: live transcript pane

## Last green commit on version1
- W-01 (see below)

## Acceptance evidence (pasted command output per task)

### W-01 Web scaffold, proxy, WS hook, polling fallback — done 2026-10-25 ~00:50 PT
- Files: `app/api/gateway/[...path]/route.ts` + `lib/proxy.ts` (adds `x-internal-key`, path-segment allowlist, 502 `gateway_unreachable` when the gateway is down), `lib/env.ts` (zod, lazy so `next build` needs no env), `lib/gateway.ts` (typed REST client, docs/03 §6 schemas), `lib/ws.ts` (`UiSocket`: token before every connect, auth → subscribe, backoff 0.5/1/2/4/8 s, ping 20 s), `lib/callState.ts` (pure docs/03 §5 rules), `lib/config.ts`, `hooks/useCall.ts` (polls `GET /api/calls/:id` every 1.5 s while the socket is down), `hooks/useBoard.ts`, `components/ConnectionBadge.tsx`.
- `pnpm --filter @lastwell/web test` → 4 files, 19 tests passed (proxy 5, ws 5, callState 8, core 1).
- `INTERNAL_API_KEY=probe-secret-xyz … pnpm build` → compiled; `grep -rl "INTERNAL_API_KEY\|probe-secret-xyz" .next/static` → empty.
- Browser (web on :3300 against the mock gateway on :18787, A01 replay): badge `live`, "6 utterances · level likely · call live"; killed the gateway → badge `polling` (yellow); restarted it → badge `live` again (new token fetched through `/api/gateway/ws-token`; the restarted mock no longer knew the call → "Unknown call …").
- Real gateway: `/ws/ui` and REST land with V-04; until then the check above runs against `apps/web/scripts/mock-gateway.ts`.

## blocked-keys (exact command to run once keys exist)
-

## wired-to-fake (replace when the named task lands)
- `apps/web/lib/config.ts`: `alertDefaultTargetPhone` is read as an optional field of `/api/config` until the requests below land; without it the Send modal requires a typed number.
- `apps/web/scripts/mock-gateway.ts` (`pnpm --filter @lastwell/web mock:gateway`, `MOCK_PORT`, `MOCK_AUTOREPLAY=A01`): a dev-only stand-in for the gateway's UI surface built from the core fixtures. Not used by any test or by `dev:fake`; switch to `pnpm dev:fake` once V-04/V-11 land.

## Requests to other lanes
- [ ] to reasoning: add `alertDefaultTargetPhone: E164.nullable()` to `ConfigResponse` in `packages/core/src/contracts/rest.ts` (+ D-log line) (D-30: the Send modal prefills `ALERT_DEFAULT_TARGET_PHONE`, but the browser cannot read gateway env and `/api/config` has no field for it)
- [ ] to voice: return `alertDefaultTargetPhone` (= `ALERT_DEFAULT_TARGET_PHONE` or null) from `GET /api/config` once the contract field exists (same reason)

## Blockers for humans
-

## Notes and small decisions
- Lockfile: adding `ws`, `@types/ws`, `tsx` as web devDependencies (mock gateway) changes `pnpm-lock.yaml` (+9 lines, web importer only).
- Snapshots (WS or poll) clear partial lines and keep any finals/newer state already held, so a poll racing the socket never moves the console backwards.
