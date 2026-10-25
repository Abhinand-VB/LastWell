# 01 — Architecture

Everything below was checked against the vendors' current documentation on 2026-10-24. Where a doc URL is given, the agent implementing the task should open it before writing the integration code; the vendor page wins over this file if they disagree, and the disagreement goes into `docs/09` as a decision.

## 1. Components

```
                      ┌─────────────────────────────────────────────────────────────┐
  Caller phone ──────►│ Twilio Voice                                                │
  (teammate, D-31)    │  number → POST /twilio/voice → TwiML                        │
                      │  <Start><Stream track=both_tracks> + <Dial> dispatcher phone│──► Dispatcher phone
                      └───────────────┬─────────────────────────────────────────────┘    (teammate, headset)
                                      │ wss  media frames (µ-law 8 kHz, inbound+outbound)
                                      ▼
   ┌───────────────────────────────── apps/gateway (Node 22, Fastify, :8787) ─────────────────────────────────┐
   │  twilio/   media WS server  ──► stt/  two Cartesia Ink 2 sessions per call (caller track, dispatcher track)│
   │                                        turn.end ──► utterance ──► pipeline/                               │
   │  pipeline/  fast pass (Haiku 5.5) per caller utterance ──► validate quotes ──► CaseState                  │
   │             reasoner (Sonnet 5.5) every 10 s or on new sign ──► validate ──► level guard ──► CaseState    │
   │             lkw parser (code) ──► clock time + range                                                      │
   │  alerts/    approve ──► compose briefing (code) ──► Sonic 3.6 TTS bytes ──► Twilio outbound call          │
   │             <Connect><Stream> bidirectional ──► play briefing ──► Q&A loop (Ink 2 → Haiku → Sonic)        │
   │  ui/        WebSocket /ws/ui (console + board live events)   REST /api/*  (snapshots, actions)            │
   │  store/     Convex write-through (apps/gateway/convex): calls, utterances, caseStates, alerts, qaTurns    │
   └──────────────────────────────────────────┬────────────────────────────────────────────┬──────────────────┘
                                              │ wss /ws/ui + REST                           │ wss /ws/ui + REST
                                              ▼                                             ▼
                                   apps/web  /console/[callId]                       apps/web  /board
                                   (Next.js 15, :3000, laptop 1)                     (laptop 2 / tablet)
```

`packages/core` holds everything that is pure or only calls the Claude API: contracts (zod), prompts, the Claude wrappers, the quote validator, the LKW parser, the level guard, the briefing composer, the keyword baseline and the `CaseState` reducer. It reads only `ANTHROPIC_API_KEY` and `CLAUDE_TIMEOUT_MS` from the environment; models, effort levels, the timezone and the guard constants are passed in as a config object by whoever calls it. `packages/stt` holds the Ink 2 WebSocket client (`InkSession`) and the WAV pacing helper, shared by the gateway and the eval runner. `apps/gateway` holds every other I/O integration and reads the environment once in `env.ts`. `apps/eval` holds the scripted test set and the runner. `apps/web` holds the two screens.

## 2. Repository layout

```
lastwell/
├── CLAUDE.md                     agent operating manual (read first)
├── README.md                     for judges: setup, Cartesia features used, known limits (task C-06)
├── .env.example                  every variable, commented (§8). `.env` is gitignored
├── package.json                  pnpm workspace root: scripts typecheck/test/dev
├── pnpm-workspace.yaml           packages/* apps/*
├── tsconfig.base.json            strict, ESM, NodeNext, target ES2022
├── docs/                         source of truth (this folder)
├── packages/core/                @lastwell/core
│   └── src/
│       ├── contracts/            zod schemas from docs/03 incl. twilio.ts, cartesia.ts, eval.ts (index.ts re-exports all)
│       ├── prompts/              system prompts from docs/04 as template literals
│       ├── claude/               client.ts (SDK init), fastPass.ts, reasoner.ts, qa.ts, warmup.ts
│       ├── validate/             quotes.ts (quote validator), levelGuard.ts
│       ├── lkw/                  parser.ts, grammar.ts, format.ts, parser.test.ts (docs/06)
│       ├── state/                reducer.ts (CaseState transitions), nextQuestion.ts
│       ├── briefing/             compose.ts (deterministic text), compose.test.ts
│       ├── baseline/             keywordBaseline.ts
│       ├── eval/                 validateScript.ts (cross-field rules, docs/03 §14), loadScripts.ts
│       ├── fixtures/             caseState.{A01,B01,C01,TEST}.json
│       └── index.ts
├── packages/stt/                 @lastwell/stt
│   ├── src/inkSession.ts         one Ink 2 socket (docs/05 §4), reconnect policy
│   ├── src/wav.ts                parse a 16 kHz mono WAV, stream samples at real-time pace
│   └── scripts/spike.ts          `pnpm --filter @lastwell/stt spike file.wav`
├── apps/gateway/                 @lastwell/gateway
│   ├── convex/                   schema.ts, store.ts (Convex functions), lib.ts; _generated/ from `npx convex dev`
│   └── src/
│       ├── server.ts             Fastify app, plugins, routes, boot validation, warmup call
│       ├── env.ts                zod-validated process.env (the only place the gateway reads env)
│       ├── log.ts                pino
│       ├── twilio/               voiceWebhook.ts, mediaStream.ts, alertStream.ts, alertStatus.ts, client.ts, twiml.ts
│       ├── stt/                  utteranceAssembler.ts (uses @lastwell/stt)
│       ├── tts/                  sonic.ts (bytes + websocket), audioChunks.ts
│       ├── pipeline/             callRegistry.ts, callRunner.ts (per-call orchestrator), triggers.ts, replay.ts
│       ├── alerts/               alertRegistry.ts, approve.ts, briefingCall.ts, qaLoop.ts
│       ├── ui/                   wsHub.ts (/ws/ui, tokens, Origin allowlist), rest.ts (/api/*)
│       ├── store/                convex.ts (ConvexHttpClient), convexApi.ts (typed refs), repo.ts
│       └── browser/              browserMedia.ts (mic fallback WS)
├── apps/web/                     @lastwell/web (Next.js 15 App Router, Tailwind 4)
│   └── app/
│       ├── page.tsx              list of live/recent calls → links; start browser call; replay buttons
│       ├── console/[callId]/     dispatcher console
│       ├── board/                stroke-team board
│       ├── mic/                  browser-microphone fallback page
│       └── api/gateway/[...path] server-side proxy adding x-internal-key
├── apps/e2e/                     @lastwell/e2e: `pnpm e2e`, black-box offline test of the demo path against a gateway with `LASTWELL_FAKES=all` (docs/10 X-02)
├── scripts/                      root Node scripts: scan-secrets.mjs (`pnpm scan:secrets`), dev-fake.mjs (`pnpm dev:fake`)
└── apps/eval/                    @lastwell/eval
    ├── scripts/                  scripted calls (JSON, docs/07 §3; 20 in the text eval per D-33)
    ├── audio/                    recordings (WAV 16 kHz mono) — gitignored if > 50 MB total
    ├── results/                  run outputs (gitignored except the Saturday-evening summary)
    └── src/                      run.ts, scriptedRunner.ts, score.ts, report.ts, validate.ts
```

Package names: `@lastwell/core`, `@lastwell/stt`, `@lastwell/gateway`, `@lastwell/web`, `@lastwell/eval`.

## 3. Runtime dependencies (pinned majors)

| Package | Version | Why |
| --- | --- | --- |
| `node` | 22 LTS | native `fetch`, `WebSocket` client is still experimental → use `ws` |
| `typescript` | ^5.6 | |
| `pnpm` | ^9 | workspaces |
| `@anthropic-ai/sdk` | ^1.0.0 | sends API version `2026-10-21`; `messages.parse` + `zodOutputFormat` for structured outputs |
| `zod` | ^3.25 | contracts; also the SDK's `helpers/zod`. If `zodOutputFormat` rejects your zod version, pass `jsonSchemaOutputFormat(zodToJsonSchema(schema))` instead (`zod-to-json-schema` is a core devDependency for that case) |
| `twilio` | ^5 | REST client (`calls.create`), `validateRequest`, TwiML builder |
| `ws` | ^8 | WebSocket client (Cartesia) and server (Twilio media, UI) |
| `fastify` | ^5 | HTTP server |
| `@fastify/websocket` | ^11 | WS routes |
| `@fastify/formbody` | ^8 | Twilio webhooks are `application/x-www-form-urlencoded` |
| `pino`, `pino-pretty` | ^9 | logging |
| `luxon` | ^3 | timezone-aware clock math in the LKW parser |
| `convex` | ^1.48 | store: Convex functions in `apps/gateway/convex/` + `ConvexHttpClient` in the gateway (the web app has no database client) |
| `convex-test` | ^0.0 | dev: runs the Convex functions in memory in vitest |
| `next` / `react` | 15 / 19 | web app |
| `tailwindcss` | ^4 | styling |
| `vitest` | ^3 | tests in every package |
| `tsx` | ^4 | run TS directly in dev and eval |

No Python anywhere. No LangChain/Vercel AI SDK; the vendor SDKs are enough and have fewer moving parts.

## 4. External services — verified facts

### 4.1 Twilio Programmable Voice + Media Streams

- Inbound call → Twilio POSTs the number's Voice webhook (`POST {PUBLIC_BASE_URL}/twilio/voice`, form-encoded: `CallSid`, `From`, `To`, `CallStatus`, …). Validate `X-Twilio-Signature` with `twilio.validateRequest(authToken, signature, fullPublicUrl, params)`. The URL passed to the validator must be the **public** URL Twilio called (ngrok host, https), not `localhost`.
- We answer with TwiML (abbreviated; the canonical document, with the `<Say>` fallback after `<Dial>`, is docs/05 §2 and is what the snapshot test asserts):

  ```xml
  <Response>
    <Start>
      <Stream url="wss://{PUBLIC_HOST}/twilio/media" track="both_tracks">
        <Parameter name="callId" value="{uuid}"/>
      </Stream>
    </Start>
    <Dial callerId="{TWILIO_PHONE_NUMBER}" timeout="25" answerOnBridge="true">
      <Number>{DISPATCHER_PHONE}</Number>
    </Dial>
  </Response>
  ```

  `<Start><Stream>` is unidirectional and forks audio while the call continues to the next verb; it **must** be followed by another verb or the call drops. `track="both_tracks"` delivers `media.track = "inbound"` (caller) and `"outbound"` (what Twilio plays to the caller = dispatcher's voice). Custom `<Parameter>`s arrive in the `start` message under `start.customParameters`. Do not put query strings on the stream URL; use path segments and `<Parameter>`. Doc: https://www.twilio.com/docs/voice/twiml/stream
- Media WebSocket messages from Twilio: `connected` → `start` (has `streamSid`, `callSid`, `accountSid`, `tracks`, `customParameters`, `mediaFormat {encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1}`) → many `media` (`media.track`, `media.chunk`, `media.timestamp` ms from stream start, `media.payload` base64 µ-law) → `stop`. Doc: https://www.twilio.com/docs/voice/media-streams/websocket-messages
- Outbound briefing call: `client.calls.create({ to, from: TWILIO_PHONE_NUMBER, timeout: 25, twiml, statusCallback, statusCallbackEvent: ["initiated","ringing","answered","completed"] })` with

  ```xml
  <Response>
    <Connect>
      <Stream url="wss://{PUBLIC_HOST}/twilio/alert-media">
        <Parameter name="alertId" value="{uuid}"/>
      </Stream>
    </Connect>
  </Response>
  ```

  `<Connect><Stream>` is **bidirectional**: we receive `inbound` only, and we can send `{event:"media", streamSid, media:{payload}}` (raw µ-law 8 kHz base64, **no file headers**), `{event:"mark", streamSid, mark:{name}}` (Twilio echoes it when that audio has finished playing) and `{event:"clear", streamSid}` (empties the play buffer — barge-in). The only way to end a bidirectional stream is to end the call (`client.calls(sid).update({status:"completed"})`).
- **Trial accounts cannot do this demo**: outbound calls only reach verified numbers, inbound calls are only accepted from verified numbers, and every call starts with a trial announcement. The account must be **upgraded (paid)** before the Twilio number is bought (task S-04). Verified-caller-ID rules then stop applying for voice.
- SMS from a US local number requires A2P 10DLC brand+campaign registration (days). Not in the demo (gotcha G-02).

### 4.2 Cartesia Ink 2 (streaming STT with turn detection)

- Endpoint: `wss://api.cartesia.ai/stt/turns/websocket?model=ink-2&encoding=pcm_mulaw&sample_rate=8000&cartesia_version=2026-08-14` with header `X-API-Key: {CARTESIA_API_KEY}`. Optional query params: `turn_start_threshold` (0.5–0.9, default 0.8), `turn_eager_end_threshold` (0.3–0.8, default 0.6), `turn_end_threshold` (0.05–0.5, default 0.3), `turn_end_timeout_ms` (640–11200, default 5600), repeated `keyterm=` (≤ 100 terms, ≤ 1200 chars). Doc: https://docs.cartesia.ai/api-reference/stt/turns/websocket
- Send raw audio as **binary** WebSocket frames in ~20–100 ms chunks at real-time pace (the realtime endpoint accepts about one second of audio per second). Twilio's 20 ms frames can be forwarded one-to-one after base64 decoding.
- Server events (JSON text frames): `connected {request_id}`, `turn.start`, `turn.update {transcript}`, `turn.eager_end {transcript}`, `turn.resume`, `turn.end {transcript}`, `error {status_code,title,message,error_code}`. `transcript` is **cumulative within a turn** and never revised. Join finished turns with a space. To close: send `{"type":"close"}` as text and keep reading until the server closes.
- The model expects continuous audio; when a source is muted, send silence. For `pcm_mulaw`, silence is byte `0xFF`, not `0x00` (for `pcm_s16le` it is zeros). Twilio sends frames continuously during a live call, so this only matters for the browser fallback and tests.
- `ink-2` supports en, fr, hi, ja, es with automatic language detection. We do not set a language.
- Pricing/limits: Ink 2 is billed per second of audio (3 credits/s at the time of writing); the free plan's 20 000 credits/month is **not enough** for two tracks × rehearsals × the audio eval. Confirm credits at the Cartesia booth / upgrade on Friday (task S-05). `STT_DISPATCHER_TRACK=false` halves usage if needed.

### 4.3 Cartesia Sonic 3.6 (TTS)

- Briefing audio is **pre-generated** at approval time with the HTTP Bytes endpoint so it starts playing within 1.5 s of the neurologist answering: `POST https://api.cartesia.ai/tts/bytes`, headers `Authorization: Bearer {CARTESIA_API_KEY}`, `Cartesia-Version: 2026-08-14`, `Content-Type: application/json`; body `{model_id:"sonic-3.6", transcript, voice:"{CARTESIA_VOICE_ID}", language:"en", output_format:{container:"raw", encoding:"pcm_mulaw", sample_rate:8000}}` → response body is raw µ-law bytes. Doc: https://docs.cartesia.ai/api-reference/tts/bytes
- Q&A answers use the TTS WebSocket for lowest latency: `wss://api.cartesia.ai/tts/websocket?cartesia_version=2026-08-14`, header `X-API-Key`. Send `{model_id:"sonic-3.6", transcript, voice:"{id}", language:"en", output_format:{container:"raw",encoding:"pcm_mulaw",sample_rate:8000}, context_id:"{uuid}", continue:false}`; receive `{type:"chunk", data:<base64>, done, context_id}` … `{type:"done"}` or `{type:"error"}`. Cancel a context with `{context_id, cancel:true}`. Doc: https://docs.cartesia.ai/api-reference/tts/websocket
- Voice: default `CARTESIA_VOICE_ID=db6b0ed5-d5d3-463d-ae85-518a07d3c2b4` (Skylar, en-US, recommended for agents). Alternative `47c38ca4-5f35-497b-b1a3-415245fb35e1` (Daniel). Listen to both on Friday and pick one; do not change it after Saturday 6 PM.
- Sonic 3.6 handles numbers and times natively; write times as "2:10 PM" and drug names as plain words.

### 4.4 Claude API

- SDK `@anthropic-ai/sdk` v1 sends `anthropic-version: 2026-10-21` and `Authorization: Bearer <key>` (not `x-api-key`). The API version **rejects `temperature`, `top_p`, `top_k`** with a 400. Never set them. Doc: https://platform.claude.com/docs/en/api/migration-2026-10-21
- Models: fast pass and Q&A `claude-haiku-5-5`; reasoner `claude-sonnet-5-5`. Both: 1M context, 128K max output, structured outputs, effort parameter. Doc: https://platform.claude.com/docs/en/models/overview
- Structured outputs are GA: `client.messages.parse({..., output_config: { format: zodOutputFormat(Schema) } })` → `response.parsed_output` (typed, validated). Schema rules: `additionalProperties:false` on every object (helper adds it), no `minLength`/`maximum` style constraints (helper strips them), ≤ 24 optional properties and ≤ 16 union-typed properties per request, enums lowercase and compared case-insensitively. Avoid property names like `reasoning`/`rationale` (can trigger a `reasoning_extraction` refusal); use `summary`. Doc: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- Effort: `output_config.effort`. Haiku 5.5 defaults to `medium`; we run the fast pass and Q&A at `low` with `thinking: {type:"disabled"}` (allowed at `high` or below on Haiku 5.5). Sonnet 5.5 defaults to `high`; we run the reasoner at `medium` with adaptive thinking (omit `thinking`). Thinking tokens count toward `max_tokens`, so the reasoner uses `max_tokens: 8192`; the fast pass `1024`; Q&A `512`. Doc: https://platform.claude.com/docs/en/build-with-claude/effort
- `stop_reason === "refusal"` or `"max_tokens"` → treat as "no output this round", log, keep the previous state. Prompt caching: `cache_control: {type:"ephemeral"}` on the static system block from day one (docs/04 §1); task R-10 measures its effect and tunes effort.
- Rate limits at a fresh tier are low (tens of requests per minute per model). The eval runner uses `EVAL_CONCURRENCY=2` and backs off on 429.

### 4.5 Convex

- Tables and functions in `apps/gateway/convex/` (docs/02, decision D-29). `npx convex dev` (run in `apps/gateway`) logs in, creates the project, pushes the schema and functions, writes `convex/_generated/`, and writes `CONVEX_DEPLOYMENT` and `CONVEX_URL` to `apps/gateway/.env.local`; leave it running while editing `convex/`. The gateway calls functions over HTTPS with `ConvexHttpClient(CONVEX_URL)`. Functions are public on the deployment URL, so each one checks a `secret` argument against the deployment's `INTERNAL_API_KEY` (`npx convex env set INTERNAL_API_KEY …`). The web app has no Convex client and no Convex keys. Doc: https://docs.convex.dev/client/javascript/node
- Live updates do **not** go through Convex reactive queries (decision D-04): partial transcripts at 5–10 Hz would mean a database write per partial and add a venue-network hop on the demo path. The web app subscribes to the gateway's `/ws/ui`.

### 4.6 Public URL

- ngrok with a reserved static domain (free plan includes one): `ngrok http 8787 --domain {your}.ngrok-free.app`. `PUBLIC_BASE_URL=https://{your}.ngrok-free.app`; the gateway derives `wss://` for stream URLs. If venue Wi-Fi blocks WebSockets, the gateway laptop tethers to a phone hotspot (runbook §2).

## 5. Data flow, step by step (phone mode)

1. **Webhook** `POST /twilio/voice` → validate signature → create `callId` (uuid v4) → insert the `calls` record (`mode: "phone"`, `callerNumber: From`, `twilioCallSid: CallSid`, `startedAt: now`) → register the call in `CallRegistry` (in-memory) → return TwiML (§4.1). Latency budget 200 ms.
2. **Media stream** connects to `wss://…/twilio/media`. On `start`: read `customParameters.callId`, verify `accountSid === TWILIO_ACCOUNT_SID` and the callId is registered (else close 1008). Create two `InkSession`s: `caller` (inbound) and `dispatcher` (outbound; skipped when `STT_DISPATCHER_TRACK=false`). Record `streamStartedAt = now`.
3. Each `media` frame: base64-decode → forward bytes to the session for its track. Keep `lastFrameTs[track] = media.timestamp`.
4. `InkSession` emits `turn.start` (capture `tStartMs = lastFrameTs[track]`), `turn.update` (broadcast `utterance.partial` to the UI, not stored), `turn.end` (build `Utterance {id, callId, seq, speaker, text, tStartMs, tEndMs=lastFrameTs}` → store → broadcast `utterance.final` → enqueue for the pipeline).
5. **Pipeline** (`callRunner`): caller utterances go through the fast pass FIFO (one in flight per call). Output → quote validator (docs/03 §7) → `reducer.applyFastPass` → LKW parser on any `last_known_well` fact → `nextQuestion` → state version++ → store `caseStates` → broadcast `state.updated`. A new validated sign or a new LKW/blood-thinner fact triggers the reasoner immediately; otherwise the reasoner runs every `REASONER_INTERVAL_MS` if the transcript changed since its last run. The reasoner reads the full transcript (both speakers) and the current state; output → validator → level guard → `reducer.applyReasoner` → store → broadcast.
6. **Console** renders from `state.updated` + utterances; shows `fastPassMs` / `reasonerMs`.
7. **Approve** `POST /api/calls/:callId/alert {targetPhone}` → snapshot the state → `composeBriefing(snapshot)` (code) → Sonic bytes → cache µ-law in memory → insert `alerts` (status `queued`) → `calls.create` (status `calling`) → broadcast `alert.updated`. Budget: Sonic bytes ≈ 1 s; Twilio create ≈ 1 s.
8. **Alert stream** connects to `wss://…/twilio/alert-media`; on `start`, look up `alertId` → status `answered` → send 300 ms of µ-law silence, then the briefing in 1280-byte media messages, then `mark {name:"briefing"}`. When Twilio echoes the mark → status `briefed`, then `qa` → open an Ink 2 session on the inbound track (Q&A mode, `qa` profile). On `turn.end` → `qa()` (Haiku, docs/04 §4) → validate evidence → TTS websocket → forward chunks as media → `mark {name:"answer-N"}`. On `turn.start` while an answer is playing → send `clear` and cancel the TTS context (barge-in). On `stop` → status `completed`.
9. **Board** subscribes to the board scope and renders alert cards with countdown; `POST /api/alerts/:id/ems-confirm` toggles the status label.
10. **Call end**: Twilio `stop` on the media stream → close Ink sessions with `{"type":"close"}` → mark `calls.endedAt` → broadcast `call.ended`. The in-memory call stays for 30 minutes for snapshots, then is evicted.

Browser mode (docs/05 §10) replaces steps 1–3 with `POST /api/calls/browser` and a mic WebSocket carrying `pcm_s16le` 16 kHz; everything from step 4 on is identical.

## 6. Processes and ports

| Process | Port | Started by |
| --- | --- | --- |
| gateway | 8787 | `pnpm --filter @lastwell/gateway dev` |
| web | 3000 | `pnpm --filter @lastwell/web dev` |
| ngrok | — | `ngrok http 8787 --domain $NGROK_DOMAIN` |

One gateway process serves Twilio, the UI and the alert calls. There is no queue, no worker, no cron.

## 7. Web app

Routes:

Every page is light (D-54/D-56) and shares one nav bar: LastWell + icon tabs **Calls** and **Pre-alert board** (`/board`). `/mic` has no tab (reachable by URL); the WebSocket badge shows only when the link is not live.

- `/` — recent calls (from `GET /api/calls`, pre-alert status from `GET /api/alerts?sinceHours=24`) as one table: time, call (source icon phone/replay/mic + label), duration, stroke level, pre-alert status, call status; live calls pinned on top; each row opens its console. The table footer replays a scripted call (docs/05 §13): A01 classic, B01 chameleon, C01 look-alike, D01 other. There is no `/console` index route.
- `/console/[callId]` — the dispatcher console (D-54). Layout (desktop, **light theme**, sized for 1920×1080, works from 1440 px; Figma design and theme: [LastWell — Screens](https://www.figma.com/design/uijhd1gyfCg693qBeXo1zs), page "Console", variables "LastWell light"): header with LastWell, the call state ("On the line" / "Call ended") and the call timer — the link badge shows only when the WebSocket is not live. Left 40 % live transcript (speaker-labelled, mm:ss, partial line in grey italics, validated quotes underlined in amber); right 60 %: **Ask next** banner (one sentence, large) on top while the call is live — once the call has ended the same box shows a **Summary** built by code from validated items only (signs heard, LKW, blood thinner, age · sex; never the reasoner's free-text `summary`, D-55) — then two columns — the **Signs** card (level pill none/possible/likely; BE-FAST chips B E F A S T — a chip lights when a validated sign of that kind exists, T lights when LKW is established in the docs/03 §9 sense and is outlined (half-lit) when a phrase exists but is vague or unconfirmed; under the chips, one row per sign kind with each quote + mm:ss, click → scroll/highlight the utterance) with the **Look-alike check** (name + "Ask: …") under it, and **Facts** (LKW clock time large + minutes ago + range + quote; blood thinner; age · sex on one row; diabetes; seizure history; medications; address) — and the **Send stroke pre-alert** bar at the bottom ("Calls the on-call stroke team (phone ending 0100)" from `ALERT_DEFAULT_TARGET_PHONE`; while a pre-alert is in progress its status strip replaces the send row). The latency readout (`fast 820 ms · reason 3.1 s`) and the pre-flight test links appear only with `?debug` on the console URL; the test links also live on `/preflight`. The **Send stroke pre-alert** button is enabled at every level (D-53: below Possible the briefing opens with the dispatcher-initiated sentence; one optional notes field, ≤ 200 characters, read verbatim); it opens a confirm modal with the target phone prefilled from `ALERT_DEFAULT_TARGET_PHONE` (the medical professional, D-30), or with the caller number only when `DEMO_ALERT_TO_CALLER=true`; Send is enabled while the call is live; a 409 for a number outside `ALERT_ALLOWED_NUMBERS` (D-35) is shown clearly).
- `/board` — one card per alert: level, age/sex, signs with quotes, LKW + countdown to 4.5 h ("3 h 42 m left in the 4.5 h window from LKW 2:00 PM"; "LKW unknown"; "window passed"), blood thinner, status pill ("Dispatcher pre-alert" / "Paramedic-confirmed" toggle), call status (calling/ringing/answered/briefed/Q&A/completed), footnote "The treating team makes every treatment decision."
- `/mic` — browser microphone fallback: start button, level meter, opens the console for the created call in a new tab.
- `/preflight` — not linked from any page (D-54): "Test briefing call" (or "Test briefing" + Play in local delivery) and "Clear test alerts" for the docs/08 pre-flight checks.

Data access: the browser talks to the Next.js app for REST. `app/api/gateway/[...path]/route.ts` proxies to `GATEWAY_URL` adding `x-internal-key`; the key never reaches the browser. The live WebSocket connects directly to `NEXT_PUBLIC_GATEWAY_WS_URL` (`/ws/ui`), because Next.js route handlers cannot proxy WebSockets; it authenticates with a short-lived token from `GET /api/gateway/ws-token` (docs/03 §5). Feature flags the browser needs (`demoAlertToCaller`, `featureBrowserMic`, `featureQa`, `callTimezone`) come from `GET /api/config`, not from env.

When the WebSocket is down, the console polls `GET /api/calls/:id` every 1.5 s (status badge turns yellow). This is the degraded mode, never the default.

Two-laptop setup for the demo: laptop 1 runs gateway + ngrok + web (`GATEWAY_URL=http://localhost:8787`, `NEXT_PUBLIC_GATEWAY_WS_URL=ws://localhost:8787/ws/ui`). Laptop 2 runs **its own** web app (`pnpm --filter @lastwell/web dev`) against the public gateway (`GATEWAY_URL=https://{ngrok}`, `NEXT_PUBLIC_GATEWAY_WS_URL=wss://{ngrok}/ws/ui`, same `INTERNAL_API_KEY`). The web app is never served through ngrok (one tunnel, one port; and the free tier's browser interstitial — gotcha G-31). The gateway's WebSocket `Origin` allowlist therefore contains only `http://localhost:3000`, and the hub also accepts upgrades with no `Origin` (Twilio).

## 8. Environment variables

Each process reads its own variables once at boot and validates them with zod (`apps/gateway/src/env.ts`, `apps/eval/src/env.ts`, Next.js `next.config.ts` + `lib/env.ts`). A missing required variable stops that process with the variable name in the message. "Used by" names the process that reads the variable; `packages/core` reads only `ANTHROPIC_API_KEY` and `CLAUDE_TIMEOUT_MS` (docs/04 §1) and receives everything else as a config object. "req" = required for that process; "opt" = has a default or may be empty.

| Variable | Used by | Example / default | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | all (opt) | `development` | |
| `PORT` | gateway (opt) | `8787` | |
| `PUBLIC_BASE_URL` | gateway (req) | `https://lastwell.ngrok-free.app` | no trailing slash; wss derived |
| `NGROK_DOMAIN` | shell only | `lastwell.ngrok-free.app` | host part of `PUBLIC_BASE_URL`; used by the `ngrok` command, not read by code |
| `INTERNAL_API_KEY` | gateway (req), web server (req) | long random string | `x-internal-key` header on REST; WebSockets use short-lived tokens issued by `GET /api/ws-token` (docs/03 §5); also set as `INTERNAL_API_KEY` in the Convex deployment (docs/02 §1) |
| `TWILIO_ACCOUNT_SID` | gateway (req) | `AC…` | |
| `TWILIO_AUTH_TOKEN` | gateway (req) | | signature validation + REST |
| `TWILIO_PHONE_NUMBER` | gateway (req) | `+1415…` E.164 | the demo number |
| `DISPATCHER_PHONE` | gateway (req) | `+1408…` E.164 | teammate's phone, `<Dial>` target |
| `TWILIO_VALIDATE_SIGNATURE` | gateway (opt) | `true` | set `false` only for local curl tests |
| `CARTESIA_API_KEY` | gateway (req), eval (req for audio mode) | `sk_car_…` | |
| `CARTESIA_VERSION` | gateway, eval (opt) | `2026-08-14` | header + query param |
| `CARTESIA_STT_MODEL` | gateway, eval (opt) | `ink-2` | |
| `CARTESIA_TTS_MODEL` | gateway (opt) | `sonic-3.6` | |
| `CARTESIA_VOICE_ID` | gateway (opt) | `db6b0ed5-d5d3-463d-ae85-518a07d3c2b4` | |
| `STT_DISPATCHER_TRACK` | gateway (opt) | `true` | `false` halves STT usage |
| `STT_KEYTERMS` | gateway, eval (opt) | list in docs/04 §5 | comma-separated |
| `ANTHROPIC_API_KEY` | core via gateway/eval (req) | | the one secret core reads itself |
| `CLAUDE_FAST_MODEL` | gateway, eval (opt) → core config | `claude-haiku-5-5` | |
| `CLAUDE_REASONER_MODEL` | gateway, eval (opt) → core config | `claude-sonnet-5-5` | |
| `CLAUDE_QA_MODEL` | gateway (opt) → core config | `claude-haiku-5-5` | |
| `CLAUDE_FAST_EFFORT` | gateway, eval (opt) → core config | `low` | |
| `CLAUDE_REASONER_EFFORT` | gateway, eval (opt) → core config | `medium` | `low` if latency > 6 s |
| `CLAUDE_TIMEOUT_MS` | core (opt) | `8000` | one retry |
| `REASONER_INTERVAL_MS` | gateway (opt) | `10000` | |
| `LIKELY_MIN_DISTINCT_SIGNS` | gateway, eval (opt) → core config | `2` | level guard |
| `CALL_TIMEZONE` | gateway, eval (opt) → core config | `America/Los_Angeles` | LKW clock math |
| `EVAL_SCRIPTS_DIR` | gateway (opt) | `../eval/scripts` | replay scripts (docs/05 §13) |
| `CONVEX_URL` | gateway (req) | `https://happy-animal-123.convex.cloud` | written to `apps/gateway/.env.local` by `npx convex dev`; copy it into `.env`. The Convex functions authenticate the gateway with `INTERNAL_API_KEY` (same value set in the Convex deployment) |
| `CONVEX_DEPLOYMENT` | Convex CLI only | `dev:happy-animal-123` | written by `npx convex dev` to `apps/gateway/.env.local`; not read by our code |
| `GATEWAY_URL` | web server (req) | `http://localhost:8787` | proxy target |
| `NEXT_PUBLIC_GATEWAY_WS_URL` | web browser (req) | `ws://localhost:8787/ws/ui` or `wss://…ngrok…/ws/ui` | |
| `ALERT_SMS_ENABLED` | gateway (opt) | `false` | needs 10DLC-registered number |
| `DEMO_ALERT_TO_CALLER` | gateway (opt) → `/api/config` | `false` | `true` prefills the target with the caller number; off since D-30 |
| `ALERT_DEFAULT_TARGET_PHONE` | gateway (opt) | E.164 | the medical professional's phone; prefills the Send modal (D-30) |
| `ALERT_ALLOWED_NUMBERS` | gateway (req when `twilio` is not faked) | `+1415…,+1408…` | comma-separated E.164; outbound calls to any other number get 409 (D-35) |
| `FEATURE_QA_ENABLED` | gateway (opt) → `/api/config` | `false` | `false` = one-way briefing then hang up; Q&A is built last (D-32) |
| `LASTWELL_FAKES` | gateway (opt) | empty | comma-separated from `claude, stt, tts, twilio, store`, or `all` (D-34, docs/10 §4); never read by core |
| `DEMO_MODE` | gateway (opt) | `false` | `true` refuses to boot with any fake active and disables the `/api/dev/*` routes (D-34) |
| `FEATURE_BROWSER_MIC` | gateway (opt) → `/api/config` | `true` | |
| `EVAL_CONCURRENCY` | eval (opt) | `2` | |
| `LOG_LEVEL` | gateway (opt) | `info` | |

## 9. Security and privacy (demo scope)

- Twilio webhooks (`/twilio/voice`, `/twilio/alert-status`) signature-validated; media and alert streams verify `accountSid` and a registered id; REST requires `INTERNAL_API_KEY`; the UI and mic WebSockets require a token from `GET /api/ws-token`.
- Convex functions check a shared secret (the deployment's `INTERNAL_API_KEY`) on every call; only the gateway holds it, and the web app has no database access (docs/02 §1).
- No audio is written to disk or database in phone mode. Transcripts and states are stored in Convex for the demo and deleted after the event (task M-07 wipes the tables).
- The repo contains no keys. `.env.example` only.

## 10. Observability

- pino JSON to stdout, `pino-pretty` in dev. Every line: `callId`, optional `alertId`, `event`, `ms` (integer) for timings: `stt.turn_end`, `fastpass.done`, `reasoner.done`, `validator.dropped`, `alert.created`, `alert.answered`, `alert.briefing_done`, `qa.answer`.
- `GET /healthz` → `{ok:true, uptimeS, liveCalls, cartesia:"ok|degraded", version}`.
- The console's latency readout comes from `state.updated.latency`.
