# 09 — Decisions, gotchas, risks

## 1. Decision log

Append-only. A decision that changes a contract links the PR. Format: `D-nn · date · decision · why · consequence`.

| ID | Decision | Why | Consequence |
| --- | --- | --- | --- |
| D-01 | TypeScript only (Node 22, pnpm). No Python. | One toolchain, one test runner, shared zod contracts between gateway, web and eval. | Devpost "Built with" drops `python`. |
| D-02 | Sonic **3.6** (`sonic-3.6`), not 3.5. | GA since Sept 2026, backwards compatible, used in Cartesia's own Twilio guide, more natural pacing. | Pitch says "Sonic"; README says 3.6. |
| D-03 | SMS disabled by default (`ALERT_SMS_ENABLED=false`); the voice call is the alert. | US carriers block SMS from 10DLC numbers without A2P registration, which takes days; a silent block during judging is worse than no SMS. | Brief's gate 3 wording "SMS + call" becomes "call (+ SMS when registered)". |
| D-04 | Live UI updates over the gateway's own WebSocket (`/ws/ui`); Supabase is the store and initial-load source; Supabase Realtime unused. | Partials at 5–10 Hz would hammer Postgres; one fewer third-party hop on the demo path; the gateway already runs a WS server for Twilio. | Web app needs `NEXT_PUBLIC_GATEWAY_WS_URL`; polling fallback over REST. |
| D-05 | Models output quotes only; code attaches `utteranceId`/`tMs` by exact (normalized) substring match. | A model-written timestamp cannot be trusted and adds nothing; the match itself is the honesty check. | Brief's example JSON with `"t"` fields is superseded by docs/03 §4/§7. |
| D-06 | Level guard: `likely` needs ≥ 2 distinct validated sign kinds; 0 signs → `none`. | Precision / alert fatigue; the card never shows `likely` on one ambiguous phrase. | A03-type single-sign calls sit at `possible` until a second kind is quoted. `LIKELY_MIN_DISTINCT_SIGNS` env. |
| D-07 | A bare "Yes." never creates a sign. | Quotes must be the caller's words containing the sign. | Dispatcher asks open questions (runbook §4); canonical next-question texts invite description. |
| D-08 | Inbound call = `<Start><Stream both_tracks>` + `<Dial>` to the dispatcher's real phone. | Simplest real bridge; both sides transcribed; no browser softphone to debug. | Dispatcher needs a phone + headset; `DISPATCHER_PHONE` env. |
| D-09 | Briefing text is composed by code from validated state and pre-synthesized with TTS Bytes at approval time. | No invented facts possible in the briefing; first byte plays within 1.5 s of answer. | `composeBriefing` fixtures A/B/C are the spec for the voice. |
| D-10 | Q&A = Haiku 5.5 with `known` + evidence quotes; code enforces the fallback phrase. | ≤ 3 s answers; quote-or-drop extends to the voice. | Unknown answers are always exactly "That wasn't mentioned on the call." |
| D-11 | Fast pass: Haiku 5.5, effort `low`, thinking disabled, `max_tokens 1024`. Reasoner: Sonnet 5.5, effort `medium`, adaptive thinking, `max_tokens 8192`. | Latency vs judgment split from the brief; Sonnet 5.5 cannot disable thinking; thinking counts toward `max_tokens`. | `CLAUDE_REASONER_EFFORT=low` is the latency escape hatch. |
| D-12 | Next question: the reasoner proposes `{kind, text}` from a fixed menu; the code ladder (docs/03 §9) decides what is shown, with LKW at the top until it is established (exact/approx, no confirmation note). | Deterministic demo behavior: the LKW question is always the first banner once a sign is heard — including when the caller gave only a vague anchor like "since lunch" — while the model's judgment still drives look-alikes and sign checks. | Canonical wording lives in code, not prompts; `vague` and confirmation notes keep the question open. |
| D-13 | Browser-mic fallback is one track, speaker `mixed`. | One laptop mic hears both people; no diarization this weekend. | README states it; the fast pass still only quotes caller-style descriptions. |
| D-14 | Eval text mode runs the reasoner on triggers + every 3rd utterance + end of call (no wall timer). | Deterministic, comparable across runs. | Reported latencies come from model calls, not the cadence. |
| D-15 | ngrok static domain + phone hotspot. | Stable webhook URL across restarts; venue Wi-Fi unreliable. | `PUBLIC_BASE_URL` never changes during the event. |
| D-16 | Auth = one shared `INTERNAL_API_KEY`; no users. | Private demo; two laptops. | Never deploy this publicly as-is (README). |
| D-17 | The latest parseable LKW statement replaces earlier ones; unparseable later statements do not erase a parsed earlier one. | Callers refine ("since lunch… fine at about 2"). | docs/06 §8. |
| D-18 | The dispatcher ends the 911 call before clicking Send. | The judge's phone cannot ring with the briefing while it is still on the inbound call (call-waiting at best). | Runbook 0:50 row; console shows "caller still on the line" until `call.ended`. |
| D-19 | The Ink 2 client lives in `packages/stt` (`@lastwell/stt`), shared by the gateway and the eval runner. | The audio eval must stream to Ink 2 and cannot import from `apps/gateway`; one implementation, one set of tests. | CLAUDE.md's "all I/O in the gateway" rule has this one named exception. |
| D-20 | Card A's last-known-well time is written on the card by hand right before it is handed over (about one hour earlier than now, on the half hour). | Judging happens Sunday morning; the brief's "2 PM" would be in the future and the parser would read it as yesterday (board: "window passed"). | Runbook §4/§6; the eval script A01 keeps "about 2 PM" with its own virtual clock. |
| D-21 | A balance/eyes-only picture is `possible`, never `likely`; `likely` needs a focal sign (face, arms, speech) among the two kinds. | Matches the brief's Card B narrative (chameleon → Possible, prompts for face/arm checks) and keeps precision on dizziness calls. | Reasoner prompt (docs/04 §3); B01/B06 truths `possible`. |
| D-22 | The browser authenticates WebSockets with a short-lived token from `GET /api/ws-token`; `INTERNAL_API_KEY` never reaches the browser. | Next.js cannot proxy WebSockets and the key must not be in the bundle. | docs/03 §5–§6; W-01 acceptance. |
| D-23 | Facts and LKW are replaced by "said later" (utterance `seq`), never "processed later". | The reasoner re-reads the whole call after the fast pass and would otherwise flip the card back to an older phrase. | docs/03 §3, docs/06 §8, R-04 tests. |
| D-24 · 2026-10-24 (R-01) | Contracts in `packages/core/src/contracts` import `z` from `"zod/v4"` (the v4 API shipped inside zod 3.25). `UiClientMessage` is a `z.union`, not `discriminatedUnion("type")`. No shape changes. | `@anthropic-ai/sdk` 1.3's `zodOutputFormat` is built on `zod/v4`, so the model-output schemas must be v4 schemas to pass straight to `output_config.format`; zod rejects a discriminated union where two variants share `type:"subscribe"`. | Consumers import schemas from `@lastwell/core` and never build contract schemas themselves; `z.record` needs two arguments; code outside contracts (e.g. `env.ts`) may keep `"zod"`. |
| D-25 · 2026-10-24 (R-01) | `apps/web` runs `next dev` / `next build` on webpack with `resolve.extensionAlias` (`.js` → `.ts`), not Turbopack. | Core's NodeNext imports use `.js` specifiers for `.ts` files (G-34); Turbopack cannot alias extensions and returned 500 "Can't resolve './contracts/index.js'" once core had internal imports. | Slightly slower dev compiles; do not re-add `--turbopack`. |
| D-26 · 2026-10-24 (R-02) | The quote validator's `norm()` drops apostrophes as well (keeps `[a-z0-9 ]`), so "can't", "can’t" and "cant" compare equal. **Needs a human glance.** | docs/03 §7 step 1 lists `'` as kept, but its own required test "He can't lift his coffee cup." vs "he cant lift his coffee cup" can only match without it; the test list was taken as the intent. Matching is still exact substring after normalization — no fuzzy repair. | Also "its"/"it's", "hes"/"he's" compare equal. To restore the stricter reading, add `'` back to the kept set in `validate/quotes.ts` and flip test 2 to a drop. |

## 2. Gotchas (read before touching the vendor in question)

### Twilio
- **G-01 Trial accounts break the demo.** Trial: outbound calls only to verified numbers, inbound only from verified numbers, a trial announcement on every call, 10-minute cap. Upgrade the account (payment on file) **before** buying the number; verify by calling the number from a phone that is not verified.
- **G-02 SMS from a 10DLC number is blocked without A2P registration** (error 30034 or a silent drop). Voice is unaffected. Keep `ALERT_SMS_ENABLED=false`.
- **G-03 Signature validation needs the public URL.** `validateRequest(token, sig, "https://{ngrok}/twilio/voice", body)` — with `http://localhost` it always fails. Fastify: register `@fastify/formbody` so `req.body` is the parsed form; pass that object. Behind ngrok the `Host` header is the ngrok host, so building the URL from `PUBLIC_BASE_URL` is the reliable way.
- **G-04 TwiML ordering.** `<Start><Stream>` must be followed by another verb (`<Dial>`), or the call hangs up. `<Connect><Stream>` holds the call until the stream ends; anything after it is unreachable. Put nothing after `<Connect>`.
- **G-05 Stream URL and parameters.** Do not append `?x=y` to the stream URL; use `<Parameter name= value=>` (arrives in `start.customParameters`). Use path segments if you must.
- **G-06 Media payloads are raw µ-law base64, no WAV/file headers**; sending headers produces garbage audio. `mark`/`clear` only exist on bidirectional streams. `media.timestamp` and `sequenceNumber` are strings.
- **G-07 Ending calls.** A bidirectional stream only ends when the call ends: `client.calls(sid).update({status:"completed"})`.
- **G-08 The judge's phone may silence unknown callers** (iOS "Silence Unknown Callers", carrier spam labels, Live Voicemail). The presenter says: "Your phone will ring from a number it doesn't know — please answer it." If it goes to voicemail, "Call again" once.
- **G-09 Call-waiting.** If the inbound call is still up when the briefing call arrives, the judge hears a beep instead of a ring (D-18).
- **G-10 Caller ID.** `<Dial callerId>` must be the Twilio number or a verified caller ID; otherwise error 21210.

### Cartesia
- **G-11 Realtime STT accepts audio at real-time pace only.** Streaming a file faster than 1× errors or desyncs. The eval audio mode paces 20 ms chunks every 20 ms.
- **G-12 Raw bytes only.** No WAV header on the STT socket; `encoding` and `sample_rate` must match the bytes or you get silent garbage — the server may not error. Twilio = `pcm_mulaw` 8000; browser = `pcm_s16le` 16000.
- **G-13 Transcripts are cumulative per turn.** Never concatenate `turn.update`s; read `turn.end` for the final text; join turns with a space.
- **G-14 No audio ≠ silence.** If you stop sending, the model waits forever. Send µ-law `0xFF` bytes (PCM zeros) when muted, or send `{"type":"close"}` and drain.
- **G-15 Version everywhere.** `cartesia_version=2026-08-14` as a query param on both WebSockets; `Cartesia-Version: 2026-08-14` header on HTTP. Auth: `X-API-Key` header on WebSockets; `Authorization: Bearer` on HTTP (both are accepted by the API; be consistent).
- **G-16 Credits.** Ink is billed per second per socket; two tracks per call doubles it. The free plan's 20 000 credits are gone after a handful of rehearsals plus the audio eval. Buy credits / get sponsor credits Friday; `STT_DISPATCHER_TRACK=false` halves usage.
- **G-17 Keyterms** are repeated `keyterm=` query params, URL-encoded, ≤ 100 terms / 1200 chars.
- **G-18 TTS websocket contexts.** Use a fresh `context_id` per utterance, `continue:false`; cancel with `{context_id, cancel:true}` on barge-in; `output_format` must be identical for every request on a context.
- **G-19 Concurrency.** The plan has a concurrent-connection limit; the eval runner's `--concurrency` must stay under it (default 2).

### Claude API
- **G-20 SDK v1 / API 2026-10-21.** `temperature`, `top_p`, `top_k` → 400. The SDK sends `Authorization: Bearer`; a proxy that expects `x-api-key` needs a header override. `MessageParam` is a union per role (type-only change).
- **G-21 Structured outputs** live under `output_config.format` (`zodOutputFormat`); the old `output_format` needs a beta header and is deprecated. Limits per request: ≤ 24 optional properties, ≤ 16 union-typed properties, `additionalProperties:false`, no numeric/string constraints, no recursive schemas. First use of a schema compiles a grammar (extra latency once, cached 24 h) — warm it at boot with a tiny call (task R-03).
- **G-22 Enum casing is not guaranteed** (`"Possible"` can come back for `"possible"`); lowercase-compare and map before zod parsing if the SDK validation complains — or keep enums single-word lowercase (we do).
- **G-23 `stop_reason` can be `refusal` or `max_tokens`** with a 200; `parsed_output` is then unusable. Handle both as "no output".
- **G-24 Thinking counts toward `max_tokens`.** Sonnet 5.5 at medium effort with `max_tokens: 1024` will truncate. Use 8192 for the reasoner.
- **G-25 Thinking cannot be disabled on Sonnet 5.5** (`between_tools` is the floor); Haiku 5.5 allows `disabled` at effort ≤ high only.
- **G-26 Field names that look like reasoning** (`rationale`, `reasoning`, `thinking`) can trigger a `reasoning_extraction` refusal. Use `summary`.
- **G-27 Prompt cache invalidation.** Changing `output_config.format` or top-level `effort` between requests starts the cache over; keep both constant per call type.
- **G-28 Rate limits** on a new org are low; parallel eval runs hit 429. `EVAL_CONCURRENCY=2`, SDK retries once, runner backs off 10 s on 429.

### Supabase / Next.js / Node
- **G-29 Service-role key only in the gateway**; the web app gets the anon key and read-only RLS policies. Never ship the service key to the browser (`NEXT_PUBLIC_` is inlined into client bundles at build time).
- **G-30 Next.js route handlers cannot proxy WebSockets**; the browser connects to the gateway WS directly (`NEXT_PUBLIC_GATEWAY_WS_URL`). CORS is not involved for WebSockets, but the gateway checks the `Origin` of the web app: allowlist `http://localhost:3000` only (both laptops run the web app locally; docs/01 §7).
- **G-31 ngrok exposes one port (the gateway) and its free tier shows a browser interstitial** on the first page load of anything served through it. The web app is therefore never served through ngrok: laptop 2 runs its own `pnpm --filter @lastwell/web dev` pointed at the public gateway (docs/01 §7). Webhooks and WebSockets through ngrok are unaffected by the interstitial.
- **G-32 Timezones.** San Francisco is PDT (UTC−7) until Nov 1 2026. Never `new Date("2026-10-25T14:00:00")` (interpreted as local time of the server). Use luxon with the explicit zone everywhere in the LKW parser and the briefing composer.
- **G-33 `ws` and Fastify.** Use `@fastify/websocket`; in the handler the socket is `connection` (v11: `socket`), check the plugin's current README. Binary frames arrive as `Buffer`; text frames as `Buffer` too unless you call `toString()`.
- **G-34 Node 22 and ESM.** `"type":"module"`, `"module":"NodeNext"`; relative imports need `.js` extensions in TS source; `tsx` for dev; vitest handles both. Workspace packages export their `src/*.ts` directly, so Next.js needs `transpilePackages: ["@lastwell/core"]` in `next.config.ts`.
- **G-35 Clock times before the time of day they name.** A caller saying "about 2 PM" at 11 AM gets `yesterday_assumed`; a bare "at 3" at 2:47 PM becomes 3 AM with `ampm_assumed`. Both keep the LKW question open (docs/06 §4–§5). Demo cards therefore carry a time written just before use, and replay scripts use relative phrases.

## 3. Risk register

| Risk | Likelihood | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- |
| Venue network blocks or drops WebSockets | medium | demo dead | hotspot for the gateway laptop; static ngrok domain; backup video | Voice |
| Judge's phone silences the briefing call (G-08) | medium | climax lost | presenter's line; "Call again"; backup video from 1:00 | Pitch |
| Loud hall → poor STT on the judge's call | medium | flag late/missing | judge speaks into their own phone (close mic); dispatcher repeats key phrases ("so his right hand is weak?") which the caller then confirms descriptively; browser-mic fallback | Voice |
| Model misreads an improvised judge | medium | wrong card | cards keep it on script; quotes on screen show exactly what was heard; presenter: "it only shows what it can quote" | Reasoning |
| Twilio/Cartesia/Anthropic limits or credits | medium | pipeline stalls | upgrade accounts Friday; `STT_DISPATCHER_TRACK=false`; eval concurrency 2; check balances in pre-flight | Voice |
| Reasoner too slow (> 8 s) | medium | card lags | `CLAUDE_REASONER_EFFORT=low`; fast pass already moves the card to Possible | Reasoning |
| Looks like DispatchAI | medium | creativity score | stroke-first pitch; hospital briefing as the climax; no general triage UI | Pitch |
| Clinician judge doubts the time savings | medium | credibility | call it an estimate from EMS chest-pain medians; lean on LKW + blood thinner arriving intact | Pitch |
| Running out of time | high | partial product | cut list below; gates in TASKS.md; feature freeze Sunday 2 AM | All |
| Key leaked to git | low | disqualification risk | `.env` gitignored from the first commit; secret scan before pushing public | All |

## 4. Cut list (in order; from the brief §10)

1. Slurred-speech audio cue — not built (future work).
2. Q&A on the briefing call (`FEATURE_QA_ENABLED=false` → one-way briefing then hang up).
3. Stroke-team board (the console's alert status line carries the demo).
4. The real phone line for the caller (browser mic; the briefing call stays).

**Never cut:** the judge's phone ringing with the briefing.

## 5. Open questions (write answers here as they are found)

- ~~Is there an Anthropic prize on Devpost?~~ **Answered 2026-10-24: no.** Anthropic is a presenting sponsor but lists no prize; the track list is in docs/08 §9.
- ~~Cartesia prize details.~~ **Answered 2026-10-24:** "[Cartesia] Best Use of Cartesia", $1,516 value, Meta glasses (still marked TBD on Devpost).
- ~~Submission deadline.~~ **Answered 2026-10-24:** Devpost hard deadline Sun Oct 25, 9:00 AM; venue check-in by 8:00 AM.
- Judging slot time and table assignment.
- Interviewee for the "lived experience" quote (brief §4).
