# 02 — Data model

One Convex deployment (decision D-29). The gateway is the only client: it writes through and reads history with `ConvexHttpClient`, passing the shared secret on every call. The web app never talks to Convex; it reads through the gateway's REST API (docs/03 §6). Live updates travel over the gateway WebSocket (docs/03 §5), not Convex reactive queries (decision D-04).

The `CaseState` document (docs/03 §3) is stored as one JSON value per call rather than normalized across tables: the console renders it as a unit, it changes as a unit, and nobody queries inside it this weekend. Every JSON value is validated with zod in the gateway before it is written.

## 1. Schema and functions — `apps/gateway/convex/`

| File | Contents |
| --- | --- |
| `schema.ts` | the five tables below with their indexes |
| `lib.ts` | typed `mutation`/`query` builders and `assertSecret` |
| `store.ts` | the functions the gateway calls (§2, §3) |
| `tsconfig.json` | Convex's own type-check config (the CLI type-checks this folder on deploy) |
| `_generated/` | written by `npx convex dev` (task S-06); commit it |

Field names are camelCase like the contracts. Our own uuids (`callId`, `alertId`, `utteranceId`) are stored as fields and indexed; Convex's `_id` stays internal. Times are ISO-8601 strings with offset, as in the contracts; Convex's automatic `_creationTime` (epoch ms) orders lists.

| Table | Fields | Indexes |
| --- | --- | --- |
| `calls` | `callId`, `mode` (`phone`/`browser`/`replay`), `twilioCallSid` (nullable), `callerNumber` (E.164 from Twilio `From`; null in browser/replay mode or when withheld), `label` (`TEST` for smoke-test calls, the script id for replays, else null), `timezone`, `startedAt` (webhook time, or creation time in other modes), `streamStartedAt` (first audio frame; base for `tStartMs` and LKW `saidAt`), `endedAt`, `status` (`live`/`ended`/`failed`), `lastError` | `by_callId`, `by_label` |
| `utterances` | `utteranceId`, `callId`, `seq` (1-based per call, assigned by the gateway), `speaker` (`caller`/`dispatcher`/`mixed`), `text`, `tStartMs` (ms since `streamStartedAt`), `tEndMs` | `by_call_seq` (`callId`, `seq`; unique by convention) |
| `caseStates` | `callId`, `version` (monotonic), `state` (CaseState JSON), `fastPassMs`, `reasonerMs`, `lastError`, `updatedAt` | `by_callId` |
| `alerts` | `alertId`, `callId`, `targetPhone` (E.164), `status` (`queued` … `failed`, docs/03 §5), `briefingText` (exactly what Sonic read), `caseSnapshot` (CaseState at approval), `transcriptSnapshot` (Utterance[] at approval; the Q&A reads this, not the live registry), `twilioCallSid`, `smsSid` (only when `ALERT_SMS_ENABLED`), `emsConfirmedAt`, `lastError`, `createdAt`, `updatedAt` | `by_alertId`, `by_callId` |
| `qaTurns` | `alertId`, `seq`, `question` (Ink 2 transcript of the neurologist's turn), `answer` (what Sonic read, fallback phrase included), `known` (false → fallback used), `evidence` (validated QuoteRef[]), `ms` (turn.end → first audio chunk) | `by_alert_seq` (`alertId`, `seq`; unique by convention) |

**Access.** Convex functions are public on the deployment URL, so every function in `store.ts` takes `secret` and compares it with the deployment's `INTERNAL_API_KEY` environment variable (set once with `npx convex env set INTERNAL_API_KEY <same value as .env>`). It fails closed: a missing variable rejects every call. The gateway passes `env.INTERNAL_API_KEY`. Nothing else holds the secret.

## 2. Write rules (gateway `store/repo.ts` → `convex/store.ts`)

| Event | Function |
| --- | --- |
| Webhook / browser start / replay | `insertCall` (idempotent on `callId`) |
| First audio frame | `patchCall {streamStartedAt}` |
| `turn.end` | `insertUtterance` (seq from the in-memory counter; a repeated `(callId, seq)` is a no-op) |
| Any state change | `upsertCaseState {version, state, …}`: write-through, fire-and-forget with error logging; a write older than the stored `version` is ignored. The in-memory `CaseState` remains the source of truth during the call |
| Approve | `insertAlert` (`queued`), then `patchAlert` on each status change |
| Q&A answer | `insertQaTurn` |
| Stream `stop` | `patchCall {endedAt, status: "ended"}` |
| Unhandled error in a call | `setCallError` (sets `lastError` on the call and its case state) |
| `DELETE /api/alerts/test` | `deleteTestCalls` (calls labelled `TEST` with their alerts, Q&A turns, utterances and state; returns the deleted `alertIds` for `alert.removed`) |

Writes never block the audio path: `repo.*` functions return promises that the call runner does not await inside frame handlers; failures are logged with `event: "store.error"` and the call continues.

## 3. Read rules

- `GET /api/calls` (gateway) → `listCalls` (recent 20, newest first, with the current level from the case state); the gateway masks `callerNumber` to the last 4 digits and maps rows to `CallInfo & {level}`.
- `GET /api/calls/:id` → from memory when the call is live, else `getCall` (`{call, utterances, caseState, alerts[+qaTurns]}`), mapped to the snapshot payload.
- `GET /api/alerts?sinceHours=24` → `listAlerts {sinceMs: now − sinceHours}` (board initial load).
- The web app has no direct database access (no keys in the browser at all).

The gateway calls functions through typed references in `apps/gateway/src/store/convexApi.ts` (`api.store.*`), which work before `npx convex dev` has generated `convex/_generated/`.

## 4. Retention

Everything is deleted at the end of the event (task M-07: `npx convex run store:wipe '{"secret":"…"}'` until `remaining` is 0, or delete the Convex project). No audio is ever stored. The eval runner writes nothing to the database (its results go to `apps/eval/results/`).

## 5. Identifiers and time

- `callId`, `alertId`, `utteranceId`: uuid v4 generated by the gateway (`crypto.randomUUID()`), never Twilio IDs, so browser mode and eval mode work identically.
- Absolute times are ISO-8601 strings with offset. Call-relative times are integer milliseconds from `calls.streamStartedAt` (`tStartMs`), displayed as `mm:ss`; the absolute time of an utterance is `streamStartedAt + tStartMs`.
- LKW arithmetic uses `calls.timezone` (default `CALL_TIMEZONE`) via luxon; the stored `lkwAt` is ISO-8601 with offset.

## 6. Tests

`apps/gateway/src/store/convexStore.test.ts` runs the functions in memory with `convex-test` (no deployment, no login): secret rejection and fail-closed, the full write path, version-ordered state writes, snapshot reads, `deleteTestCalls` and `wipe`.
