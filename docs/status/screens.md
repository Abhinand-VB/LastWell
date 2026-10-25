# Status: screens lane

Only the screens session edits this file.

## Current task
- done for tonight: all buildable screens tasks landed; waiting on human steps (W-08 speak-into-mic, W-11 approval)

## Last green commit on version1
- W-08 real-gateway check + W-11 polish (see below)

## Acceptance evidence (pasted command output per task)

### W-08 against the real gateway — 2026-10-24 ~20:05 PT (speak-into-mic step: human)
- Real gateway from this worktree (`GATEWAY_PORT=28787 WEB_PORT=23000 node scripts/dev-fake.mjs`; no `.env` here, so STT is FakeSttSession, which discards audio). Edge via Playwright with Chromium's fake microphone (`--use-fake-device-for-media-stream`, a test tone): `/mic` → Start → `getUserMedia` ok → `POST /api/calls/browser` → WS `ws://localhost:28787/browser/media/{callId}?token=…`; after ~3 s 163 binary frames sent, every one 640 bytes; level bar 84 %. Console tab opened at `/console/{callId}`: "Browser mic | Caller still on the line | Live"; gateway `GET /api/calls/{id}` → mode `browser`, status `live`.
- Transcript path: STT is faked here, so one turn was injected with `POST /api/dev/calls/{id}/utterances` → 201 → console showed "…he can't lift his coffee cup." and the card reached Likely (fake model). Stop → text frame `{"type":"end"}` → console "Call ended" (207 frames in total).
- Screenshots `apps/web/screenshots/{mic,console-browser-mic}.png`.
- **Human step (blocked-keys, gateway Mac):** `LASTWELL_FAKES=twilio pnpm --filter @lastwell/gateway start` with the real `.env` (Cartesia key), `pnpm --filter @lastwell/web dev`, open http://localhost:3000/mic in Chrome, allow the microphone, Start, read Card A aloud → the console tab shows utterances labelled **Mic** within ~2.5 s of each pause and the card reaches Likely with quoted chips; Stop → "Call ended".

### W-11 final polish — 2026-10-24 ~20:05 PT (presenter approval pending)
- Header labels the call "A01 · Replay" / "Browser mic" / "Phone •••1234" instead of the raw mode; mic page says "The console for this call is open in another tab. Open it again"; the Next dev badge is gone (`devIndicators: false`).
- Screenshots refreshed against the real gateway (phone delivery, FakeTelephony): `apps/web/screenshots/{console-A01-mid,console-A01-end,console-send-modal,console-alert-status,console-C01-end,board,home,mic,console-browser-mic,console-local-play,console-local-played}.png`. Send enabled at the A01 end state (`isDisabled() → false`); C01 end: Possible, speech chip, look-alike "low blood sugar — answered: diabetic". The board reads "Window passed" because a replayed "2 PM" is > 4.5 h before the real clock (correct; the demo card uses {T} ≈ 1 h earlier).

### W-12 Play briefing (D-43) — done 2026-10-24 ~19:30 PT
- `hooks/useBriefingPlayer.ts` (one `<audio>` on `/api/gateway/alerts/:id/audio`, `onended` → `POST …/played`), `components/console/SendAlert.tsx` (local mode: "▶ Play briefing" on the alert status, steps Ready to play → Played → Completed, "Call again"/"Hang up" hidden; footer "Test briefing" + "▶ Play test briefing"), `lib/alerts.ts` (`statusSteps(…, delivery)`, `statusLabel`, `canPlay`), `lib/config.ts` (`alertDelivery` read with default `phone` until core's `ConfigResponse` has it; `alertDefaultTargetPhone` now required, since the gateway serves it), `lib/proxy.ts` (response body passed as bytes, not text). The proxy's path-segment allowlist already admits `alerts/:id/audio` and `alerts/:id/played`.
- `pnpm --filter @lastwell/web test` → 40 passed (adds proxy WAV byte-for-byte, local steps/labels/canPlay, antiplatelet label).
- Real gateway (this worktree, `ALERT_DELIVERY=local GATEWAY_PORT=28787 WEB_PORT=23000 node scripts/dev-fake.mjs`; no `.env` here, so every vendor faked, FakeTts silence) → `/api/config` `"alertDelivery":"local"`. Edge (Playwright, 1440×900), A01 replay at speed 4: modal "…will be ready to play from this laptop."; after Send the pill read "Ready to play", `call-again` count 0; clicked Play → `GET /api/gateway/alerts/a381…/audio 200 audio/wav`, `POST …/played 200`; pill "Completed", button "▶ Play briefing again". Footer Test briefing → "Test briefing ready: press Play test briefing." → Play → audio 200 + played 200. Proxy vs direct WAV: identical md5 `8e14024e…`, RIFF/WAVE header, fmt PCM 1 ch 8000 Hz 16-bit. Screenshots `apps/web/screenshots/console-local-{play,played}.png`.
- blocked-keys: hearing real Sonic audio through the laptop speaker needs the gateway Mac's `.env` (Cartesia key): `ALERT_DELIVERY=local LASTWELL_FAKES=twilio pnpm --filter @lastwell/gateway start` + web, Send, Play.

### D-41(c) antiplatelet label + dev indicator — done 2026-10-24 ~19:35 PT
- `bloodThinnerLabel(value)` in `lib/consoleText.ts` (core `isAntiplatelet`): the facts panel row and the board `dt` read "Antiplatelet" for aspirin/clopidogrel/…, "Blood thinner" otherwise. A05 replay on the real gateway: facts row "Antiplatelet · aspirin · “aspirin” 00:10", no "Blood thinner" anywhere on the page.
- `devIndicators: false` in `next.config.ts`: no "N" badge on the console screenshot after the restart.

### X-03 on the real gateway — 2026-10-24 ~19:40 PT
- `E2E_STRICT=1 pnpm e2e:ui` → "4 passed (34.2s)" (home, console A01 Likely + quoted chips, board approved A01, empty console headline). Playwright's chromium-headless-shell was installed on this machine for it.

### W-11 Visual polish — done 2026-10-24 ~17:25 PT (presenter approval pending)
- Dark clinical theme, 17 px root, 20 px transcript and card text, 30 px banner, monospace `mm:ss` column, amber underlines on quotes, partial line in its own row (no shift of earlier rows). Console order: warnings → stroke card → next question → Send → look-alike → facts, so card + banner + Send fit at 1440×900 without scrolling. Header call timer (own component, 1 Hz). Board: single alert uses up to 1024 px width, countdown 48 px, footnote 17 px.
- Screenshots (Edge, 1440×900, mock gateway, A01 replay): `apps/web/screenshots/{console-A01-mid,console-A01-end,console-send-modal,console-alert-status,board,home}.png`.
- Human: presenter looks at the screenshots (or the live pages) from 2 m and approves → tick under Blockers for humans.

### W-08 Mic page (AudioWorklet) — done 2026-10-24 ~17:10 PT (live speech check pending V-09)
- `app/mic/{page,MicView}.tsx`, `public/worklets/downsampler.js`, `lib/pcm.ts` (+ `pcm.test.ts`, 5 tests: 48 kHz → 50×640 B per second at any block size, 44.1 kHz within one frame of real time, clamping, rate guard, RMS). Start → `getUserMedia` → `POST /api/calls/browser` → WS `micWsUrl` → worklet frames; console opens in a new tab (opened inside the click so pop-up blockers allow it); Stop → `{"type":"end"}` + `POST /api/calls/:id/end`. Level meter from worklet RMS (~10 Hz). Hidden when `featureBrowserMic` is false.
- `pnpm --filter @lastwell/web test` → 8 files, 37 tests passed.
- In the browser pane: OfflineAudioContext, 1 s of 48 kHz sine through `/worklets/downsampler.js` → 50 frames, all 640 bytes, 9 level messages. Live AudioContext (48 kHz) oscillator → worklet → mock `/browser/media/:callId?token=` for 6 s → mock log "mic 250 frames, sizes [[640,250]], 20.0 ms/frame", then "mic control {"type":"end"}", "closed after 283 frames".
- The pane blocks microphone capture: Start showed the permission error and closed the pre-opened tab (message now "Microphone permission denied — allow the microphone …").
- Pending: "speaking Card A produces a transcript on the console" needs V-09 (gateway `/browser/media`) and a laptop browser with a mic: `pnpm dev:fake` is not enough (STT faked); run with `stt` real once Cartesia keys exist → blocked-keys.

### X-03 selector check — 2026-10-24 ~16:50 PT
- Level pill now renders the level word in its own element ("Likely" + "stroke") so X-03's `getByText(/^likely$/i)` finds it. With the scratch config (no webServer, Edge channel, mock gateway): `home lists calls` ✓, `console renders the A01 replay` ✓, board test ✗ for the X-03 reasons filed under Requests.

### W-07 Home + W-10 Replay buttons — done 2026-10-24 ~16:35 PT
- `app/page.tsx` → `app/HomeView.tsx` (one file holds both tasks): recent calls from `GET /api/calls` every 3 s (time in the call's timezone, label chip, level pill, live/ended), "Stroke team board" link, "Start browser-mic call" → `/mic` (rendered only when `featureBrowserMic`), "Replay B01" / "Replay C01" → `POST /api/gateway/calls/replay` → `router.push(/console/{callId})`.
- Browser: list showed 5 replays (A01 ×3 likely, B01/C01 possible, all ended). Clicked "Replay B01" → navigated to `/console/735bc10e-…`; level pill `possible` within 20 s.

### W-06 Board — done 2026-10-24 ~16:30 PT
- `app/board/{page,BoardView}.tsx`, `hooks/useBoard.ts` (board scope + polling `GET /api/alerts?sinceHours=24`). Labels (TEST / script id) come from `GET /api/calls` because `AlertSummary` has no label.
- Browser (1440×900): two cards. A01: "Likely stroke 78 y · male A01", "2 h 37 m left · 4.5 h window from LKW 2:00 PM “He was fine at about 2 PM” 00:30", footnote "The treating team makes every treatment decision.", blood thinner Eliquis with quote, three sign rows with quotes, "Briefing call: Completed". TEST card: "LKW unknown", "Briefing call: Briefed".
- "Mark paramedic-confirmed" → label flipped to "Paramedic-confirmed" (API answer applied + `alert.updated`). `DELETE /api/alerts/test` → `{deleted:1}`, the TEST card left the board within 1 s with no reload (`alert.removed`).
- Legibility: countdown 36 px bold, body 20 px; checked on the 1440 px screenshot. Presenter's 2 m check is part of W-11.

### W-05 Console: Send pre-alert modal + alert status — done 2026-10-24 ~16:20 PT
- `components/console/SendAlert.tsx`, `lib/alerts.ts` (+ `alerts.test.ts`, 3 tests), `hooks/useConfig.ts`; `lib/config.ts` reads `alertDefaultTargetPhone` (D-39, kept optional so a pre-D-39 gateway still loads).
- `pnpm --filter @lastwell/web test` → 7 files, 32 tests passed.
- Browser, A01 replay via the mock gateway: button disabled with "Enabled once a stroke sign is heard" at level none; enabled at "Likely stroke" **while the call was live** (D-30). Modal: target prefilled `+14155550100` from `/api/config`, "Caller still on the line — this does not end or change the 911 call.", Send disabled until the confirm box is ticked. `+1 415 555 0199` (not allowlisted) → red alert "Not sent: this number is not on the allowed list (ALERT_ALLOWED_NUMBERS). No call was placed. (…)". Prefilled number → status pill `ringing` (2 s) → `answered` (5 s, "Call again" hidden, Send disabled) → `completed` (13 s).
- "Call again" shows on calling/ringing/failed, "Hang up briefing" while the call is up; footer "Test briefing call" (window prompt, prefilled) and "Clear test alerts" call the docs/03 §6 endpoints. The prompt path was not driven in the browser pane (it blocks automation); the endpoints were exercised with curl against the mock.
- Reading taken: the docs/TASKS.md W-05 text predates D-30 (prefill the caller number); docs/10 + D-30/D-39 win: prefill `alertDefaultTargetPhone`. `demoAlertToCaller` cannot prefill anything because the browser only ever gets the masked caller number; the typed field covers it.

### W-02, W-03, W-04 Console: transcript, stroke card, next question / look-alike / facts / latency — done 2026-10-24 ~16:00 PT
- One commit: the three tasks share `app/console/[callId]/ConsoleView.tsx`. Components in `components/console/{Transcript,QuoteButton,StrokeCard,Panels}.tsx`; pure helpers in `lib/{format,consoleText}.ts`.
- `pnpm --filter @lastwell/web test` → 6 files, 29 tests passed (adds format 6, consoleText 4).
- Browser, 1440×900, A01 replay through the mock gateway: utterances with `mm:ss` + speaker, partial line grey italic, quoted spans underlined amber (address, "my father", "he's 78", both sign quotes, LKW, Eliquis). Card: pill "Likely stroke" (red), chips A and S lit, T lit after "fine at about 2 PM"; sign rows "Speech “his words come out all mixed up” 00:11", "Arms “he can't lift his coffee cup” 00:11"; tooltip on the pill = modelLevel + guard reason + summary. Banner went "Ask: when was he last seen completely normal?" → face question once LKW and Eliquis were in. Facts: "2:00 PM (1:45–2:15 PM) 1 h 44 min ago “He was fine at about 2 PM” 00:30", blood thinner Eliquis, age, sex, address. Latency "fast 941 ms · reason 3.0 s".
- Quote click: scrolled the transcript from the top to "Yes, he takes Eliquis. For his heart." and that row got the `lw-flash` class.
- B01 replay: "Possible stroke", chips B and E lit, balance/eyes rows, face banner, LKW "3:15 PM (3:05–3:25 PM) 30 min ago". C01 replay: look-alike panel "low blood sugar — answered: diabetic, skipped dinner".
- No-sign state renders exactly "No stroke signs heard yet." (constant `NO_SIGNS_HEADLINE`, seen at the start of each replay). Warning banners: text unit-tested; not yet seen live (no producer of `state.warnings` until V-10).

### W-01 Web scaffold, proxy, WS hook, polling fallback — done 2026-10-25 ~00:50 PT
- Files: `app/api/gateway/[...path]/route.ts` + `lib/proxy.ts` (adds `x-internal-key`, path-segment allowlist, 502 `gateway_unreachable` when the gateway is down), `lib/env.ts` (zod, lazy so `next build` needs no env), `lib/gateway.ts` (typed REST client, docs/03 §6 schemas), `lib/ws.ts` (`UiSocket`: token before every connect, auth → subscribe, backoff 0.5/1/2/4/8 s, ping 20 s), `lib/callState.ts` (pure docs/03 §5 rules), `lib/config.ts`, `hooks/useCall.ts` (polls `GET /api/calls/:id` every 1.5 s while the socket is down), `hooks/useBoard.ts`, `components/ConnectionBadge.tsx`.
- `pnpm --filter @lastwell/web test` → 4 files, 19 tests passed (proxy 5, ws 5, callState 8, core 1).
- `INTERNAL_API_KEY=probe-secret-xyz … pnpm build` → compiled; `grep -rl "INTERNAL_API_KEY\|probe-secret-xyz" .next/static` → empty.
- Browser (web on :3300 against the mock gateway on :18787, A01 replay): badge `live`, "6 utterances · level likely · call live"; killed the gateway → badge `polling` (yellow); restarted it → badge `live` again (new token fetched through `/api/gateway/ws-token`; the restarted mock no longer knew the call → "Unknown call …").
- Real gateway: `/ws/ui` and REST land with V-04; until then the check above runs against `apps/web/scripts/mock-gateway.ts`.

## blocked-keys (exact command to run once keys exist)
- W-08 live speech: on the gateway Mac, `LASTWELL_FAKES=twilio pnpm --filter @lastwell/gateway start` (real `.env`) + `pnpm --filter @lastwell/web dev`, open http://localhost:3000/mic in Chrome, allow the mic, Start, read Card A → console shows Mic utterances and the card reaches Likely.
- W-12 real audio: same gateway with `ALERT_DELIVERY=local`, Send on a Likely call, ▶ Play briefing → Sonic voice from the laptop speaker, pill Completed.

## wired-to-fake (replace when the named task lands)
- `apps/web/lib/config.ts`: `alertDelivery` (D-43) is read as an optional field (default `phone`) until reasoning adds it to core's `ConfigResponse`.

## Requests to other lanes
- [x] to reasoning (done 0c53f6b, D-39): add `alertDefaultTargetPhone: E164.nullable()` to `ConfigResponse` in `packages/core/src/contracts/rest.ts` (+ D-log line) (D-30: the Send modal prefills `ALERT_DEFAULT_TARGET_PHONE`, but the browser cannot read gateway env and `/api/config` has no field for it)
- [x] to voice (served by the gateway, seen on /api/config 2026-10-24 19:20): return `alertDefaultTargetPhone` (= `ALERT_DEFAULT_TARGET_PHONE` or null) from `GET /api/config` (contract field landed in 0c53f6b, D-39) (same reason)
- [x] (fixed by integration: waitEnded) to integration: X-03 `board shows the approved A01 alert` approves as soon as "Likely" shows; at speed 4 the approval snapshot (`AlertSummary.caseSnapshot`) predates "fine at about 2 PM" and "takes Eliquis", so the board correctly shows "LKW unknown" / no blood thinner and `getByText(/Eliquis/)` fails. Suggest waiting for `call.ended` (or `getByText("Eliquis")` on the console) before approving. Observed by running `apps/e2e/ui` against the screens mock gateway (`E2E_GATEWAY_PORT=18787`, Edge channel): home + console tests pass, board test fails on this. (X-03)
- [x] (fixed by integration: .first()) to integration: the board renders "The treating team makes every treatment decision." under every card's countdown (docs/06 §9), so with ≥ 2 alerts `getByText(...)` hits strict mode; add `.first()`. (X-03)

- [ ] to integration: W-12 acceptance asks for an X-03 step that clicks Play briefing under `pnpm dev:fake`; that needs `ALERT_DELIVERY=local` in the dev:fake/X-03 env (or a second project). Selectors: `[data-testid=send-button]`, `confirm-checkbox`, `modal-send`, then `play-briefing`; done when `[data-testid=alert-status][data-status=completed]`. (W-12)

## Blockers for humans
- [ ] W-08 · speak Card A into /mic on the gateway Mac (steps under blocked-keys); the automated fake-mic run through the real gateway passed · nothing else waits on it
- [ ] W-11 · presenter approval of the console/board look from 2 m (screenshots in `apps/web/screenshots/`) · nothing waits on it; polish continues on request
-

## Notes and small decisions
- The dev-only mock gateway (`apps/web/scripts/mock-gateway.ts`) and its devDependencies (`ws`, `@types/ws`, `tsx`) were removed once the real gateway covered every route; the web app is checked against `pnpm dev:fake` / the real gateway only.
- Snapshots (WS or poll) clear partial lines and keep any finals/newer state already held, so a poll racing the socket never moves the console backwards.
- Reasoning's request "drop the `.extend`": `alertDefaultTargetPhone` is now required (58b401b); the `.extend` remains only for `alertDelivery` (D-43) until core has it.
