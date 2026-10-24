# 05 — Voice pipeline (Twilio ↔ Cartesia ↔ gateway)

Owner: Voice lane. Everything here lives in `apps/gateway/src/{twilio,stt,tts,alerts,browser}` except the Ink 2 client, which lives in `packages/stt` (`@lastwell/stt`) because the eval runner needs it too. Vendor facts were verified on 2026-10-24 (docs/01 §4); open the linked vendor page before coding each section. The TwiML in §2 is canonical (docs/01 §4.1 shows an abbreviated form).

## 1. Topology

```
inbound call  : caller ──Twilio──► <Start><Stream both_tracks> ──wss──► gateway ──► Ink 2 ×2 ──► utterances
                        └─<Dial>──► dispatcher phone (real bridge; the dispatcher talks normally)
briefing call : gateway ──Twilio REST──► neurologist phone ◄──<Connect><Stream> bidirectional──► gateway
                        gateway ──media(µ-law)──► phone      phone ──inbound audio──► Ink 2 ──► Haiku Q&A ──► Sonic ──► media
browser mode  : laptop mic ──pcm_s16le 16k──wss──► gateway ──► Ink 2 ──► utterances (same pipeline)
```

All audio on the phone paths is **µ-law, 8 kHz, mono** end to end (Twilio ↔ Cartesia both support it natively). No resampling code exists in the repo.

## 2. Inbound call — `twilio/voiceWebhook.ts`

1. Route `POST /twilio/voice` (formbody). Validate: `twilio.validateRequest(TWILIO_AUTH_TOKEN, req.headers["x-twilio-signature"], PUBLIC_BASE_URL + "/twilio/voice", req.body)`. On failure → 403 and log `event:"twilio.bad_signature"`. Skip only when `TWILIO_VALIDATE_SIGNATURE=false`.
2. Parse body with zod: `{CallSid, From, To, CallStatus, Direction}` (extra fields passthrough).
3. `callId = randomUUID()`; `CallRegistry.create({callId, mode:"phone", callerNumber: From, twilioCallSid: CallSid, startedAt: new Date()})`; `repo.insertCall` (not awaited).
4. Respond `text/xml`:
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <Response>
     <Start>
       <Stream url="wss://{host}/twilio/media" track="both_tracks">
         <Parameter name="callId" value="{callId}"/>
       </Stream>
     </Start>
     <Dial callerId="{TWILIO_PHONE_NUMBER}" timeout="25" answerOnBridge="true">
       <Number>{DISPATCHER_PHONE}</Number>
     </Dial>
     <Say>The dispatcher could not be reached. Goodbye.</Say>
   </Response>
   ```
   Build it with `twilio.twiml.VoiceResponse` (escaping is handled). `{host}` = `PUBLIC_BASE_URL` without scheme.
5. The `<Say>` only plays if `<Dial>` fails; it is the only thing LastWell ever says to a caller, and it is not medical.

Twilio Console configuration (task S-04): number → Voice → "A call comes in" → Webhook `POST {PUBLIC_BASE_URL}/twilio/voice`. Nothing else.

Demo note (D-31): the caller is a teammate dialing from their own phone; the judge only draws the card. The path above is unchanged. With `LASTWELL_FAKES` containing `twilio` or `stt`, the dev route `POST /api/dev/calls` creates a call as if this webhook had run, and `POST /api/dev/calls/:callId/utterances` injects finals where the utterance assembler would (docs/10 §4.1).

## 3. Media stream handler — `twilio/mediaStream.ts`

Route `WS /twilio/media`. State per socket: `{callId, streamSid, sessions: {inbound?: InkSession, outbound?: InkSession}, lastTs: {inbound: 0, outbound: 0}, framesIn: 0}`.

| Twilio event | Action |
| --- | --- |
| `connected` | log |
| `start` | parse (docs/03 §12). `callId = start.customParameters.callId`. Reject (close 1008, log) if `start.accountSid !== TWILIO_ACCOUNT_SID` or `CallRegistry.get(callId)` is missing. Store `streamSid`. Create `InkSession("caller", "pcm_mulaw", 8000)` for `inbound`; if `STT_DISPATCHER_TRACK`, `InkSession("dispatcher", ...)` for `outbound`. Set `call.streamStartedAt = now` (also written to `calls.streamStartedAt`); this is the zero point for every `tStartMs` and for LKW `saidAt`. |
| `media` | `ts = Number(media.timestamp)`; `track = media.track ?? "inbound"`; `lastTs[track] = ts`; `sessions[track]?.sendAudio(Buffer.from(media.payload, "base64"))`. Drop frames for a track with no session. Count frames; log every 500. |
| `mark`, `dtmf` | ignore (log debug) |
| `stop` | `sessions.*.close()` (sends `{"type":"close"}` and waits ≤ 2 s for remaining `turn.end`s), `CallRegistry.end(callId)`, `repo.endCall`, broadcast `call.ended`. |
| socket `close`/`error` | same as `stop` if not already ended. |

Every handler is wrapped in `try/catch`; an exception logs `event:"media.handler_error"` with the stack and never rethrows.

Backpressure: `ws` buffers; if `inkSocket.bufferedAmount > 64 KiB` drop the frame and log `event:"stt.backpressure_drop"` once per second (audio arrives at 8 KiB/s per track, so this only triggers on a stalled connection).

## 4. Ink 2 session — `packages/stt/src/inkSession.ts` (`@lastwell/stt`)

```ts
class InkSession extends EventEmitter {
  constructor(opts: { apiKey: string; cartesiaVersion: string; model: string; keyterms: string[];
                      baseUrl?: string /* default wss://api.cartesia.ai */;
                      speaker: Speaker; encoding: "pcm_mulaw" | "pcm_s16le"; sampleRate: 8000 | 16000;
                      profile: "call" | "qa"; getTs: () => number /* current track ms */ })
  // The package reads no environment; callers (gateway env.ts, eval env.ts, the spike script) pass these in.
  sendAudio(buf: Buffer): void            // binary frame; no-op if closed
  close(): Promise<void>                   // sends {"type":"close"}, resolves on server close or 2 s
  // events:
  //  "partial" { text, tStartMs }                       from turn.update / turn.eager_end
  //  "final"   { text, tStartMs, tEndMs, sttMs }        from turn.end
  //  "error"   { message, statusCode }                  from error event or socket error
  //  "closed"
}
```

URL built with `URLSearchParams`:

```
wss://api.cartesia.ai/stt/turns/websocket
  ?model=ink-2&encoding=pcm_mulaw&sample_rate=8000&cartesia_version=2026-08-14
  &turn_start_threshold=0.8&turn_eager_end_threshold=0.6&turn_end_threshold=0.3&turn_end_timeout_ms=2400
  &keyterm=Eliquis&keyterm=apixaban&... (one param per STT_KEYTERMS entry)
```

Header: `X-API-Key: {CARTESIA_API_KEY}`.

Profiles:

| profile | start | eager_end | end | end_timeout_ms | why |
| --- | --- | --- | --- | --- | --- |
| `call` (caller and dispatcher tracks) | 0.8 | 0.6 | 0.3 | 2400 | finals ≤ 2.5 s after the speaker stops (acceptance #1) while keeping sentences whole |
| `qa` (neurologist) | 0.8 | 0.5 | 0.2 | 1600 | questions are short and the 3 s answer budget (acceptance #7) starts when the question ends, so the turn must close fast |

Event handling: `turn.start` → `turnStartTs = getTs()`; `turn.update` / `turn.eager_end` → emit `partial` with the cumulative transcript and record `lastChangeWall = now` when the transcript text changed; `turn.resume` → nothing (the next update continues); `turn.end` → emit `final {text: transcript.trim(), tStartMs: turnStartTs, tEndMs: getTs(), sttMs: now − lastChangeWall}`; empty transcripts are ignored. `sttMs` approximates "speaker stopped → final" (the last transcript change is the last word heard). `error` → emit `error`, then reconnect policy (§9).

Transcript joining: finals are separate utterances; never concatenate partials (they are cumulative).

Keep-alive: Ink expects continuous audio. On the phone paths Twilio delivers a frame every 20 ms including silence. In browser mode the AudioWorklet also sends continuously. The session therefore never synthesizes silence, except `InkSession.sendSilence(ms)` used by tests and the Q&A loop while our own audio plays (so the model's clock keeps running): µ-law silence byte is **0xFF**, pcm_s16le silence is zeros.

## 5. Utterance assembly — `stt/utteranceAssembler.ts`

On `final` from a session: `seq = ++call.seq`; build `Utterance {id, callId, seq, speaker, text, tStartMs, tEndMs}`; `repo.insertUtterance` (not awaited); `hub.broadcast(callId, {type:"utterance.final", …})`; `callRunner.onUtterance(utterance)`.

On `partial`: `hub.broadcast(callId, {type:"utterance.partial", speaker, text, tStartMs})` (throttled to one per 150 ms per speaker).

`tStartMs` semantics: milliseconds since `call.streamStartedAt` (the Twilio `start` message; the first mic frame in browser mode; the replay start for replays). Twilio's `media.timestamp` counts from the same moment, so it is used directly. In browser mode `getTs()` = bytes received so far ÷ 32 (16 kHz × 2 bytes = 32 bytes per ms). The absolute time of an utterance, used for LKW `saidAt`, is `streamStartedAt + tStartMs`. The console shows `mm:ss`.

## 6. Feeding the reasoning lane — `pipeline/callRunner.ts`

Per call: a FIFO of caller utterances for the fast pass (one in flight), a reasoner scheduler (interval timer + immediate trigger, one in flight, `dirty` flag), the `CaseState`, and the `hub`.

```
onUtterance(u):
  transcript.push(u); dirty = true
  if u.speaker is caller|mixed: fastQueue.push(u); pumpFast()
pumpFast():
  while not inFlight and queue not empty:
    u = queue.shift(); inFlight = true
    out = await fastPass(u, prevDispatcherUtterance)        // docs/04 §2
    validated = validateFastPass(out, [u])                  // docs/03 §7
    state = reducer.applyFastPass(state, validated)         // adds signs/facts; runs LKW parser; level guard; next question
    if newSignOrKeyFact: scheduleReasoner("immediate") else nothing
    publish(state); inFlight = false
scheduleReasoner(reason):
  if reasonerInFlight: rerunAfter = true; return      // an immediate trigger during a run → run again right after it finishes
  runReasoner()
runReasoner():
  reasonerInFlight = true; dirty = false
  out = await reasoner(transcript, state)              // docs/04 §3
  merge (below); publish(state)
  reasonerInFlight = false
  if rerunAfter: rerunAfter = false; runReasoner()     // once; signs added by the reasoner itself never retrigger it
interval tick (every REASONER_INTERVAL_MS while the call is live):
  if dirty and not reasonerInFlight: runReasoner()
```

`publish(state)`: `state.version++`, `updatedAt`, `repo.upsertState` (not awaited), `hub.broadcast(state.updated)`.

Reasoner input: the full `transcript` (both speakers) and the current state (docs/04 §3). Its output is validated against the full transcript, passed through the level guard (§8 of docs/03), merged by `reducer.applyReasoner`: signs union (deduplicated by kind + utteranceId), facts and `lkw` by the replacement rule in docs/03 §3 (later utterance `seq` wins, never processing order), `lookalikes` replaced, `summary` replaced, `reasonerQuestion` set to the raw `next_question`, `nextQuestion` via the ladder (docs/03 §9). The reducer receives the utterance list so it can compare `seq`.

On call end: stop the interval timer, wait for the fast-pass queue to drain, run the reasoner once more (so the summary covers the whole call), publish, then keep the runner resident for 30 min for snapshots and approvals. Approving an alert does not wait for that final run; it snapshots whatever state is current.

## 7. Briefing composition and pre-synthesis — `alerts/approve.ts`, `core/briefing/compose.ts`

`composeBriefing(snapshot, now, tz)` builds the text from the **validated** state only. Sentence rules (omit a sentence when its data is absent; never invent):

1. `"Stroke pre-alert from nine one one, approved by the dispatcher."`
2. Patient: age and sex → `"{age}-year-old {man|woman}."`; age only → `"{age}-year-old patient."`; sex only → `"Adult {man|woman}."`; neither → `"Adult patient."`
3. Signs: `"Signs heard: {labels joined with ' and '}."` — one label per **distinct kind**, in BE-FAST order: balance→"balance trouble", eyes→"vision change", face→"facial droop", arms→"one-sided weakness", speech→"speech trouble". Then up to two quotes: `"The caller said: '{quote1}' and '{quote2}'."` — the shortest quotes by word count, **distinct by text**, caller's words, ≤ 12 words each (longer quotes are cut at the last word boundary before 12 words, no ellipsis spoken).
4. LKW (the same sentence feeds the Q&A `spokenLkw`): confidence exact/approx with no note or with note `clipped_to_now` → `"Last known well: {h:mm AM/PM}, {N} minutes ago."`; vague with `clipped_to_now` → the vague form below; vague → `"Last known well: between {start} and {end}, roughly {N} minutes ago."` where N uses the point estimate; note `ampm_assumed` or `yesterday_assumed` → `"Last known well: possibly {h:mm AM/PM}, unconfirmed."`; note `older_than_24h` → `"Last known well: {weekday} {h:mm AM/PM}, more than a day ago."`; unknown/null → `"Last known well time was not established on the call."` Then `"Caller's words: '{phrase}'."` when not unknown. Minutes > 180 → say `"{h} hours {m} minutes ago"`. Spoken times use `h:mm AM/PM` with no parentheses or dashes.
5. Blood thinner: fact present and value ≠ "none" → `"Blood thinner: {value}, per the caller."`; value "none" → `"The caller says no blood thinners."`; absent → `"Blood thinners were not mentioned."`
6. Look-alike (only if `lookalikes[0]` exists and level is `possible`): `"Could also be {name}; not yet ruled out."`
7. Close: `"Not yet confirmed by paramedics. You can ask me about the call now."` when `opts.qaEnabled` (the gateway passes `FEATURE_QA_ENABLED`; core reads no env) else `"Not yet confirmed by paramedics. Goodbye."`

Length control: target 45–70 words. If the text exceeds 70 words, drop in this order until it fits: quote 2 → the "Caller's words" sentence → the look-alike sentence. Sentences 1, 2, 3 (labels), 4 (time), 5 and 7 are never dropped. `compose.test.ts` asserts the word count for fixtures A/B/C, the trim order on an oversized fixture, and that no sentence contains text absent from the snapshot (every quoted fragment must be a substring of a validated quote).

Approval snapshots both `state` (→ `alerts.caseSnapshot`) and the utterance list (→ `alerts.transcriptSnapshot`); the Q&A and the test-briefing path read from the alert, never from the live registry.

Pre-synthesis: `POST https://api.cartesia.ai/tts/bytes` with `{model_id: CARTESIA_TTS_MODEL, transcript, voice: CARTESIA_VOICE_ID, language: "en", output_format: {container:"raw", encoding:"pcm_mulaw", sample_rate: 8000}}`, headers `Authorization: Bearer`, `Cartesia-Version`, `Content-Type: application/json`. Store the bytes on the alert record in memory (`alert.audio`; re-synthesized from `alerts.briefingText` on retry after a restart). Expected: ~8 KB per second of speech; a 20 s briefing ≈ 160 KB, ~1 s to generate. Timeout 10 s; failure → alert `failed`, `lastError`, UI shows "Briefing synthesis failed — retry".

Target number (D-30, D-35): `targetPhone` must be in `ALERT_ALLOWED_NUMBERS`, otherwise the approve route returns 409 and places no call; the web modal prefills `ALERT_DEFAULT_TARGET_PHONE` (the medical professional's phone). Approval is allowed while the 911 call is still live, because the target is a different phone (D-18 relaxed). `opts.qaEnabled` follows `FEATURE_QA_ENABLED`, `false` by default (D-32), so the default close is "Goodbye." With `twilio` faked, `FakeTelephony` drives the same status transitions without dialing (docs/10 §4).

Then `twilio.calls.create({ to: targetPhone, from: TWILIO_PHONE_NUMBER, timeout: 25, twiml: "<Response><Connect><Stream url=\"wss://{host}/twilio/alert-media\"><Parameter name=\"alertId\" value=\"{alertId}\"/></Stream></Connect></Response>", statusCallback: PUBLIC_BASE_URL + "/twilio/alert-status", statusCallbackEvent: ["initiated","ringing","answered","completed"], statusCallbackMethod: "POST" })`. Status → `calling`; `ringing` and `completed` come from the status callback; `answered` is set when the media stream's `start` arrives (more precise than the callback).

## 8. Briefing call stream and Q&A loop — `twilio/alertStream.ts`, `alerts/qaLoop.ts`

Route `WS /twilio/alert-media`. Per socket: `{alertId, streamSid, phase: "briefing"|"qa"|"answering", ink?: InkSession, tts?: SonicWs, currentContextId?, answerSeq}`.

```
start:
  alert = AlertRegistry.get(start.customParameters.alertId)  (close 1008 if missing / accountSid mismatch)
  status = answered
  sendSilence(300 ms)                                      // 2400 bytes of 0xFF in one media message
  for chunk of slice(alert.audio, 1280 bytes): send {event:"media", streamSid, media:{payload: base64(chunk)}}
  send {event:"mark", streamSid, mark:{name:"briefing"}}
  status = briefed (when the briefing mark echoes back)
mark "briefing":
  if !FEATURE_QA_ENABLED: hangup(); return
  phase = qa; status = qa
  ink = new InkSession("caller", "pcm_mulaw", 8000, profile "qa")   // speaker label irrelevant here
  ink.on("final", onQuestion)
media (inbound): if phase == briefing: drop (no session yet) else ink.sendAudio(bytes)
onQuestion({text}):
  if phase == answering: cancelAnswer()                     // barge-in handled on turn.start below as well
  phase = answering; seq = ++answerSeq
  {answer, known, evidence, ms} = await qa(text, alert.caseSnapshot, alert.transcriptSnapshot)   // docs/04 §4, with fallback
  speak(answer, contextId = `a-${seq}`)                     // Sonic websocket, chunks → media messages as they arrive
  send mark `answer-${seq}`
  repo.insertQaTurn(...)
mark `answer-N`: phase = qa
ink "turn.start" while phase == answering: send {event:"clear", streamSid}; tts.cancel(currentContextId); phase = qa
stop / close: ink.close(); tts.close(); status = completed (or failed if before "answered")
```

`speak()` uses one Sonic WebSocket per alert (`tts/sonic.ts`, opened at `start` so the handshake is not on the answer path): send `{model_id, transcript, voice, language:"en", output_format:{container:"raw",encoding:"pcm_mulaw",sample_rate:8000}, context_id, continue:false}`; forward every `chunk.data` (already base64) straight into a Twilio `media` message; on `done` send the mark. Cancel: `{context_id, cancel:true}`.

Silence while we speak: the Q&A Ink session receives the neurologist's inbound audio continuously from Twilio anyway (our playback is on the outbound side), so no synthetic silence is needed.

Hang-up: when the neurologist hangs up, Twilio sends `stop`. Timeout: if no question arrives for 60 s after the last answer, `hangup()` (`calls(sid).update({status:"completed"})`) to save credits.

## 9. Failure handling and degradation

| Failure | Detection | Response |
| --- | --- | --- |
| Ink socket error/close mid-call | `error`/`close` event | reconnect **once** after 500 ms with the same params; frames during the gap are dropped (≤ 1 s of audio). Second failure → session marked `degraded`, `state.warnings` gains `stt_degraded` (published; the console renders "Transcription degraded — switch to the table mic"), log `event:"stt.degraded"`; the call continues (dispatcher still bridged). |
| Ink returns `error` 401/403 | event | no reconnect; degraded immediately; `healthz.cartesia = "degraded"` |
| Twilio media socket drops | `close` without `stop` | treat as call end; the phone bridge continues independently (Twilio keeps the `<Dial>` up) |
| Claude timeout/429 on fast pass | exception | skip that utterance's fast pass; log; the reasoner catches up on the next tick |
| Claude timeout on reasoner | exception | keep previous state; retry on the next tick; after 3 consecutive failures add `reasoner_delayed` to `state.warnings` (cleared on the next success) |
| Sonic bytes fails at approval | HTTP ≠ 200 or timeout | alert `failed`, retry button; the dispatcher can retry without re-approving |
| Sonic websocket fails during Q&A | error/close | reopen once; if the answer cannot be spoken within 6 s, speak nothing and log; the next question gets a fresh socket |
| Outbound call not answered | status callback `no-answer`/`busy`/`failed` | alert `failed` with reason; "Call again" button |
| Convex down | any store error | log only; nothing on the demo path awaits the store |
| ngrok down | Twilio webhook 502 | the phone line is dead → runbook §5: browser mic + the phone for the briefing only (requires ngrok for the briefing stream too, so really: fix ngrok/hotspot) |

Every per-socket handler is wrapped; an exception in one call never reaches the process. `process.on("uncaughtException")` and `unhandledRejection` log and keep the process alive (last line of defense, not a strategy).

## 10. Browser microphone fallback — `browser/browserMedia.ts`, `apps/web/app/mic`

- `POST /api/calls/browser` → `{callId, micWsUrl: wss://{host}/browser/media/{callId}?token=…}` (`mode:"browser"`, `speaker` for all utterances = `mixed`, because one laptop mic hears both people at the table). The token is a `/api/ws-token` token (docs/03 §5); `streamStartedAt` is set when the first binary frame arrives.
- The page uses `getUserMedia({audio: {channelCount:1, echoCancellation:true, noiseSuppression:true}})` + an `AudioWorklet` that downsamples the float32 stream (device rate, usually 48 kHz) to 16 kHz by averaging and converts to int16 little-endian, posting 320-sample (20 ms) chunks. Send them as binary frames. No `MediaRecorder` (compressed, not raw).
- Gateway: one `InkSession("mixed", "pcm_s16le", 16000, "call")` per socket; everything after `final` is identical to phone mode. `{"type":"end"}` text frame or socket close → call end.
- The console for a browser call is the same page; `callerNumberMasked` is null, so the alert modal requires typing the target number.
- Because the dispatcher's own questions are transcribed on the same track, the fast pass receives `speaker:"mixed"` utterances; the prompt's "caller only" rule still holds textually (the dispatcher's words are usually questions, which do not produce signs). This is a known limitation stated in the README.

## 11. Latency budget (phone mode, measured in rehearsal, logged as `ms`)

| Stage | Target | Where measured |
| --- | --- | --- |
| speaker stops → `turn.end` | ≤ 1.2 s typical, ≤ 2.5 s cap | `stt.turn_end` (sttMs) |
| fast pass | ≤ 1.5 s | `fastpass.done` |
| reasoner | ≤ 6 s | `reasoner.done` |
| approve click → Twilio `calls.create` returned | ≤ 2.5 s (Sonic bytes + REST) | `alert.created` |
| phone rings | ≤ 20 s after click | `alert.ringing` |
| answer → first briefing byte sent | ≤ 0.5 s | `alert.answered` → first media |
| question `turn.end` → first answer chunk | ≤ 3 s | `qa.answer` |

## 12. Test procedure for this lane

1. `pnpm --filter @lastwell/stt test` and `pnpm --filter @lastwell/gateway test` — unit tests: TwiML output snapshot, Twilio message parsing, µ-law chunking, InkSession event mapping with a mock WebSocket server (`ws` in-process), briefing media/mark sequencing with a mock Twilio socket.
2. `pnpm --filter @lastwell/stt spike apps/eval/audio/A01.wav` — streams a WAV at real-time pace to Ink 2 and prints turn events (task V-02's acceptance evidence).
3. Real call: dial the number from a non-team phone, read Card A, watch the gateway log for `utterance.final` lines with `speaker:"caller"` and `speaker:"dispatcher"`.
4. Real briefing: approve on the console; watch for `alert.answered`, `alert.briefing_done`, `qa.answer` with `ms`.

## 13. Replay calls (demo Cards B and C) — `pipeline/replay.ts`

`POST /api/calls/replay {scriptId, speed = 2}` loads `apps/eval/scripts/{scriptId}.json` (through `@lastwell/core`'s `EvalScript` parser; the gateway reads the file from `EVAL_SCRIPTS_DIR`, default `../eval/scripts` relative to `apps/gateway`), creates a call with `mode:"replay"`, `label: scriptId`, `startedAt = streamStartedAt = now`, and emits each turn as an `utterance.final` at `atMs / speed` after start with `tStartMs = atMs / speed`, `tEndMs = tStartMs + 1500`. Turns go through the normal pipeline (fast pass for caller turns, reasoner triggers), so the console behaves exactly as for a live call, including the latency readout. After the last turn plus 3 s the call ends like a phone call (`call.ended`, final reasoner run).

Consequences the runbook relies on: LKW phrases are parsed relative to the **real** clock, so replay scripts must use relative or anchor phrases, not clock times (B01 says "about half an hour ago"; C01 says "about an hour ago"); the alert modal has no caller number, so the operator types one; the countdown on the board is real-time from the parsed LKW.
