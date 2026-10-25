# Status: voice lane

Only the voice session edits this file.

## Current task
- 2026-10-24 18:40 PT: V-12 (local briefing delivery, D-43 fallback) landing now. Next: the live phone gates (V-01, V-03…V-07, M-01…M-04) — the number and webhook exist (D-43 update), so they need only a person to place the call from an unverified phone; commands under blocked-keys.

## Last green commit on version1
- 0f8c31a (version1 head at the 18:05 rebase); voice's last landing 0011ef5, `pnpm e2e` 23 passed / 0 failed / 0 pending.

## Acceptance evidence (pasted command output per task)

### V-08 Q&A loop with barge-in — offline done, behind FEATURE_QA_ENABLED (default false)
- `tts/sonicWs.ts` (one Sonic WebSocket per briefing call, opened at stream `start`; fresh `context_id`, `continue:false`, cancel; reopen once) + `FakeTtsStream`; `alerts/qaAnswer.ts` (docs/04 §4 post-processing in code: evidence quote-or-drop with purpose `qa`, fallback "That wasn't mentioned on the call.", LKW questions answered with the parser's spoken time, "not established" when unknown); loop in `twilio/alertStream.ts`.
- `alerts/qa.test.ts` → 7 passed: with Q&A on the briefing ends "You can ask me about the call now."; no STT during the briefing; after the `briefing` mark status `qa` and an Ink session with the `qa` profile; "Is he on blood thinners?" → answer naming Eliquis as media then `mark answer-1`, qaTurn recorded (store + alert.updated); "Any seizure before this?" → fallback; invented evidence → fallback + `qa.evidence_dropped`; LKW answer "Last seen normal at 2:00 PM, N minutes ago." with no parentheses/dashes; barge-in (`turn.start` while answering) → `clear` + TTS cancel of `a-1`; no question within the idle timeout → hang-up → completed.
- Live (blocked on a real call + rehearsal): `FEATURE_QA_ENABLED=true`, approve, answer the phone, ask "Is he on blood thinners?" → spoken answer ≤ 3 s (`qa.answer` ms), barge-in stops it ≤ 0.5 s, 60 s silence hangs up. Stays off until two clean rehearsals (D-32).

### X-03 UI smoke against the real gateway (2026-10-24 ~16:58 PT)
- `pnpm e2e:ui` (dev:fake → this gateway + web) → **4 passed (27.5 s)**: home lists calls; console renders the A01 replay (transcript, Likely, quoted chips); board shows the approved A01 alert; console starts empty with "No stroke signs heard yet.". Screens can drop `apps/web/scripts/mock-gateway.ts` and the optional `alertDefaultTargetPhone`.

### V-10 Degrade/reconnect, test-briefing, call-again — offline done (live parts need a real call)
- Ink reconnect once → `degraded` on the second failure / 401 (stt tests); a degraded session publishes `stt_degraded` in `state.warnings` (streams test); `healthz.cartesia` = degraded after an Ink 401/403.
- `alerts.test.ts`: test briefing → TEST alert with "was not established on the call" / "Blood thinners were not mentioned", listed with label TEST; `DELETE /api/alerts/test` → `{deleted:1}` + `alert.removed`, gone from the registries; retry from ringing ends the first call and re-dials with cached audio (1 synthesis, 2 dials); **retry after a restart** (new gateway, same store) rehydrates the alert and re-synthesizes from `briefingText` → `calling`.
- Live (blocked on a real call): block the Ink host for 2 s mid-call → `stt.reconnected`, a second block → `stt.degraded` + console banner.

### V-09 Browser-mic fallback (gateway) — offline done
- `browser/browser.test.ts`: `POST /api/calls/browser` → `{callId, micWsUrl: ws://localhost:<port>/browser/media/<id>?token=<64 hex>}`; a wrong token → close 1008; first binary frame sets `streamStartedAt`; finals are `mixed` and reach the runner; `{"type":"end"}` ends the call; `FEATURE_BROWSER_MIC=false` → 409. Live with W-08 needs a browser + Cartesia.

### Live checks with the keys (2026-10-24 ~16:35 PT, gateway on :18999, no phone dialled)
- Real boot (`LASTWELL_FAKES=twilio`, everything else from `.env`): `/healthz` → `{"ok":true,…,"cartesia":"ok","fakes":["twilio"]}`; log `server.listening` `store:"convex"`; **`claude.warmup` ms 2569** (fast 2350, reasoner 2550).
- **V-05 live (real Claude, replay A01 at speed 2):** 4.0 s first fast pass 1555 ms; 8.0 s `possible` with speech "his words come out all mixed up" + arms "his right hand is weak", LKW "about 12:30 PM (12:00–1:30 PM)" (vague "since lunch"), banner `lkw`; **11.1 s `likely`** (reasoner 3109 ms); 19.1 s LKW `2:00 PM (1:45–2:15 PM)` → banner `blood_thinner`; 20.1 s blood thinner `Eliquis` → banner `face`; call ended 24 s, final reasoner 2701 ms. Fast pass 922–2687 ms, reasoner 2701–3272 ms.
- **V-06/V-07 live Sonic (Twilio faked):** approve → 200 `calling`; briefing: "Stroke pre-alert from nine one one, approved by the dispatcher. 78-year-old man. Signs heard: one-sided weakness and speech trouble. The caller said: 'his right hand is weak' and 'his words come out all mixed up'. Last known well: 2:00 PM, 148 minutes ago. Caller's words: 'fine at about 2 PM'. Blood thinner: Eliquis, per the caller. Not yet confirmed by paramedics. Goodbye." `tts.synthesized` ms 2967, 211 200 bytes (26.4 s); events calling → ringing → answered → `alert.briefing_sent` → `alert.briefing_done` ms 26706 → briefed → completed.
  - `alert.created` was 2972 ms (> 2.5 s budget) because Sonic ran before the dial. Fixed in the next commit: Twilio is dialled in parallel with synthesis, the stream waits for pending audio if answered first, and a synthesis failure hangs up the call (test added).
- **Store:** with a wrong `INTERNAL_API_KEY` every Convex write logged `store.error` (insertCall, insertUtterance, insertAlert …) and the call, replay, approval and briefing all completed (V-04 "a wrong secret does not stop the call"). With the real key, an unsigned local `POST /twilio/voice` (`TWILIO_VALIDATE_SIGNATURE=false`) → TwiML with the ngrok stream URL and the Twilio number as callerId; `call.webhook` + `call.created`, **no `store.error`** (Convex accepted insertCall).

### Gateway: X-01b, V-01, V-03, V-04, V-05, V-06, V-07, V-11 — offline done, landed bfa43ca
- `pnpm e2e` (spawns `pnpm --filter @lastwell/gateway dev` with LASTWELL_FAKES=all and only the X-02 variables) → **23 passed, 0 failed, 0 pending in 27 s**: healthz fakes; ws token + auth; A01 likely, ≥ 2 kinds, quotes in utterances with tMs, LKW = card time ±15 min, Eliquis, "what time exactly" → blood thinner banner; approve to a non-allowlisted number → 409; allowlisted → 200, briefing names Eliquis + LKW; alert reached `briefed` (fake telephony); board REST lists it; B01 possible, never likely, balance + eyes, face/arm banner; C01 ≤ possible, low blood sugar resolved by diabetes; every /ws/ui message matched docs/03 §5.
- `pnpm --filter @lastwell/gateway test` → 39 passed (+ the existing Convex store tests):
  - X-01b (`app.test.ts`): boots with `LASTWELL_FAKES=all` and no vendor secrets; with nothing faked every missing var is named (TWILIO_*, DISPATCHER_PHONE, ALERT_ALLOWED_NUMBERS, CARTESIA_API_KEY, ANTHROPIC_API_KEY, CONVEX_URL); DEMO_MODE=true refuses fakes; unknown fake names rejected; `/healthz` has `fakes` (5); dev routes absent under DEMO_MODE; REST 401 without/with a wrong `x-internal-key`.
  - V-01 (`twilio/twilio.test.ts`): inline TwiML snapshots (inbound `<Start><Stream both_tracks>` + `<Dial callerId timeout=25 answerOnBridge>` + `<Say>` fallback; briefing `<Connect><Stream>` with nothing after); signature validation with a fixed token (public URL ok; localhost URL, altered param, missing sig/token → false); forged `POST /twilio/voice` → 403, signed → TwiML + live call; `/twilio/alert-status` is signature-checked.
  - V-03 (`twilio/streams.test.ts`, mock Twilio socket): wrong `accountSid` → close 1008; unknown callId → 1008; inbound/outbound routed to caller/dispatcher sessions (µ-law 8 kHz, call profile); `media` without `track` → inbound; `getTs` = last media.timestamp; finals → utterances with increasing seq; `stop` → call ended and sessions closed; `STT_DISPATCHER_TRACK=false` → one session; socket close without stop ends the call; degraded session → `stt_degraded` in state.warnings.
  - V-04 (`ui/ui.test.ts`, real socket): `Origin: http://evil` upgrade refused (403), localhost:3000 accepted; bad token → `error unauthorized`; subscribe before auth → unauthorized; auth → `auth.ok`, subscribe → `snapshot`, `utterance.partial` before `utterance.final`, `state.updated`; `GET /api/calls/:id` returns the same utterances; unknown call → `unknown_call`; ping → pong; utterance written through to the store; `GET /api/config` returns the 4 flags + `alertDefaultTargetPhone`.
  - V-05 (`pipeline/callRunner.test.ts`): fast-pass exceptions absorbed (process alive); 3 reasoner failures → `reasoner_delayed`, cleared on the next success; latency fastPassMs/reasonerMs populated; dispatcher turns skip the fast pass; final reasoner run on call end bumps the version.
  - V-06 (`alerts/alerts.test.ts`): 409 at level none; 409 outside ALERT_ALLOWED_NUMBERS with no call placed; 404 unknown call; 400 without `confirm:true`; briefing text from R-07 ("78-year-old man", "Blood thinner: Eliquis", ends "Goodbye."); transcript snapshot stored; second approve → 409; walks calling → … → completed and is in the store and on the board; Sonic failure → `failed` "Briefing synthesis failed — retry" (502), retry re-synthesizes; retry from ringing ends the first call and re-dials with cached audio (one synthesis, two dials); test briefing + `DELETE /api/alerts/test`; EMS toggle.
  - V-07 (`twilio/streams.test.ts`): wrong accountSid → 1008; `start` → answered; message order = 300 ms silence (2400 × 0xFF) → media × N (1280-byte chunks, bytes equal the cached audio) → `mark briefing`; mark echo → briefed → hang-up → completed.
  - V-11 (`ui/ui.test.ts`): replay B01 at speed 50 → possible, balance + eyes, face/arm banner, LKW 20–40 min before now, `call.ended`, listed as `replay`/`B01`/no caller number; unknown script 404, bad id 400.

### V-02 InkSession + spike — offline done, live spike blocked (needs a Card A recording)
- `packages/stt/src/{inkSession,wav}.ts`, `scripts/spike.ts`; package reads no env (the spike reads the repo-root `.env`). Landed 4cafd7c.
- `pnpm --filter @lastwell/stt test` → 13 passed against an in-process `ws` server: URL params per docs/05 §4 (call and qa profiles, one `keyterm` per term), `X-API-Key` header, audio queued before open then forwarded as binary, turn.start/update/eager_end/end → partial/final with track timestamps and `sttMs`, empty finals ignored, finals never concatenated, `{"type":"close"}` drains the last turn, close timeout, reconnect once then `degraded`, 401 → degraded without reconnect, no throw without error listeners, µ-law silence 0xFF, WAV parse + 20 ms real-time pacing.

### V-12 Local briefing delivery (D-43) — done offline + live (no Twilio call)
- `ALERT_DELIVERY=phone|local` in env.ts (default `phone`: the Twilio path, its flags and e2e are unchanged). In `local`, approve composes + synthesizes exactly as before and places no call; the alert stays `queued` (audio ready) until `POST /api/alerts/:alertId/played` → `briefed` → `completed` (each `alert.updated`, idempotent once completed, 409 from `failed`). `GET /api/alerts/:alertId/audio` → `audio/wav` 8 kHz mono 16-bit, decoded from the cached µ-law (G.711), re-synthesized from `briefingText` if the cache is gone (restart → store). Retry in local re-synthesizes from `failed`/`queued`. Test briefing works the same way. `GET /api/config` returns `alertDelivery`.
- Unit: `alerts/localDelivery.test.ts` 4/4 (µ-law reference points; approve → no call, WAV data == decode(cached audio), Sonic called once, broadcasts queued → briefed → completed, store completed; re-synthesis after the registry loses it, 404 unknown; synth failure 502 → retry → queued; test-briefing; config). `app.test.ts` config now includes `alertDelivery: "phone"`.
- Live (real Claude + real Sonic, `LASTWELL_FAKES=twilio` as a belt so no call is possible, throwaway INTERNAL_API_KEY so Convex writes were refused and logged): A01 replay → likely; approve 200 `queued` in 2728 ms (`alert.created` ms 2725, `tts.synthesized` 2723 — synthesis is serial in local mode, there is no dial to overlap); `GET …/audio` → 200 `audio/wav` 423,724 bytes, 8000 Hz, 1 ch, 16 bit, 26.5 s; `POST …/played` → `completed`. Log: `alert.local_ready`, `alert.briefed`, `alert.completed`, no `alert.dialed`. Still to observe with a person: the same from a live `/mic` Card A call (W-08) and W-12's Play button.

## blocked-keys (exact command to run once keys exist)
- Keys are in `.env` now; what is still blocked needs a human or ngrok:
- V-02 live spike: record ~20 s of Card A (16 kHz mono WAV) to `apps/eval/audio/A01.wav`, then `pnpm --filter @lastwell/stt spike apps/eval/audio/A01.wav` → expect turn.start/update/end lines and a FINAL TRANSCRIPT containing "coffee cup" and "Eliquis".
- V-01/V-03/V-04 live (Gate 0/1): `ngrok http 8787 --domain $NGROK_DOMAIN`, `pnpm --filter @lastwell/gateway dev` with `LASTWELL_FAKES=` empty, Twilio number webhook → `{PUBLIC_BASE_URL}/twilio/voice`; call from an unverified phone → dispatcher phone rings; log shows `call.webhook` (From masked), `media.start`, `utterance.final` for caller and dispatcher with `ms`; hang up → `call.ended`.
- V-05 live (Gate 2): same setup, read Card A; console shows possible → likely ≤ 12 s after "coffee cup", LKW question first, card time ±15 min, Eliquis.
- Twilio number + webhook are set (D-43 update, 18:20 PT); these need only a person placing the call and `ngrok http 8787 --domain $NGROK_DOMAIN` + `pnpm --filter @lastwell/gateway start` on the gateway Mac.
- V-06/V-07 live (Gate 3): approve on the console to `ALERT_DEFAULT_TARGET_PHONE`; the phone rings ≤ 20 s; log `alert.created` `ms` < 2500, `alert.answered`, `alert.briefing_done`; status `briefed` → `completed`.

## wired-to-fake (replace when the named task lands)
- None. Every service has its real implementation behind the fake (Ink, Sonic bytes, Twilio REST, Convex, Claude); which one runs is `LASTWELL_FAKES`.

## Requests to other lanes
- [ ] to reasoning: D-43 contract lines — add `alertDelivery: z.enum(["phone","local"])` to `ConfigResponse` (the gateway already returns it; app.ts types it as `ConfigResponse & {alertDelivery}` until then), and to docs/03 §6: `GET /api/alerts/:alertId/audio` → `audio/wav` (8 kHz mono 16-bit PCM, 404 `unknown_alert`, 502 `tts_failed`) and `POST /api/alerts/:alertId/played` `{}` → `{alert}` (409 `bad_state` from `failed`). In local mode an approved alert stays `queued` until played. (V-12)
- [ ] to integration: in docs/08 (runbook) start the demo gateway with `pnpm --filter @lastwell/gateway start` (plain `tsx`, `.env` from the repo root, LASTWELL_FAKES empty, DEMO_MODE=true), not `dev`: `dev` is `tsx watch` and restarts the gateway, dropping live calls and in-memory alerts, whenever a file is saved. (demo safety)

## Handled requests from other lanes
- [x] from integration (D-43, P0 then P1): V-12 local delivery landed (see evidence). V-09 gateway side was already in (998f166); its live `/mic` check needs a person at the laptop. Live phone gates are next and need a caller.
- [x] from integration (keys): live checks run within §7.4 (one Claude replay, one Sonic briefing, no Twilio call); V-01 landed, ngrok/webhook can be set up — see Current task.
- [x] from integration (D-41): the gateway never words blood thinners itself; spoken and logged briefing text comes only from core's `composeBriefing`. Pinned end to end by `alerts.test.ts` "D-41: an aspirin caller's briefing names the drug" (approve path → briefing text sent to Sonic and stored matches /aspirin, per the caller\./, no "blood thinner"): 10/10 pass.
- [x] from integration (X-02): dev routes exactly per docs/10 §4.1 (`POST /api/dev/calls` → 201 `{callId}`, utterances, end → `call.ended`), `/healthz` `fakes`, boots with only the X-02 variables, missing routes stay Fastify's default 404 — bfa43ca.
- [x] from integration (X-02): `alert.updated` goes to sockets subscribed to the alert's call **and** to `board` (once per socket) — bfa43ca.
- [x] from screens and reasoning: `GET /api/config` returns `alertDefaultTargetPhone` (ALERT_DEFAULT_TARGET_PHONE or null, D-39) — bfa43ca.

## Blockers for humans
- [ ] V-02 · Need a ~20 s 16 kHz mono WAV of someone reading Card A's caller lines at `apps/eval/audio/A01.wav` (gitignored) for the live spike; my attempt to synthesize one with Sonic from an ad-hoc script was refused by the permission system · moved on; command above.
- [ ] V-01/V-03/V-06 live · Needs ngrok running with the reserved domain, the Twilio number's voice webhook set to `{PUBLIC_BASE_URL}/twilio/voice`, and two phones (caller + dispatcher, plus the medical professional's for the briefing) · commands above; the code path is the same one e2e drives.

## Notes and small decisions
- Gateway loads the repo-root `.env` (like apps/eval); variables already in the environment win, so e2e/dev:fake overrides still apply.
- WebSocket Origin allowlist: no Origin, or `http://localhost:<any port>` / `http://127.0.0.1:<any port>` (docs/03 §6 says localhost:3000; dev:fake, e2e and screens use other ports; still local-only, `http://evil` refused).
- Sonic request body uses `voice: {mode:"id", id}` (Cartesia's current API shape) where docs/05 §7 abbreviates to `voice: ID`.
- Status machine: alert statuses only move forward; a `busy/no-answer/failed/canceled` callback after the stream answered counts as `completed`, not `failed` (found by a test: our own hang-up could race the fake's answer).
- Status callbacks are matched by `CallSid`; retry forgets the old sid before hanging it up, so the old call's callbacks are ignored.
- Approve returns 502 (alert broadcast as `failed` with `lastError`) when Sonic or Twilio fails; the UI can retry with `POST /api/alerts/:id/retry`.
- Browser mic: `micWsUrl` is `ws://<host>` when the request reached the gateway on localhost/127.0.0.1 (the Next proxy on laptop 1), else `wss://` from PUBLIC_BASE_URL.
- `FAKE_ACCOUNT_SID` is `AC-fake-telephony` (a 34-char `AC…` placeholder trips scan:secrets).
