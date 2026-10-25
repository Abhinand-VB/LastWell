# LastWell: stroke pre-alerts that start on the 911 call

LastWell listens to a 911 medical call. It flags a possible stroke and backs every flag with the caller's exact words. It works out when the patient was last seen normal, which is the clock that decides clot-busting treatment. Once the dispatcher clicks a button, it phones the on-call stroke team with a 20-second spoken briefing.

Built at Cal Hacks 13.0 (Oct 24–25, 2026). All code was written during the hacking window; the planning documents in [`docs/`](./docs) are the spec it was built from.

## What happens on a call

1. A caller dials our Twilio number. The call is bridged to a human dispatcher's phone, and both sides are transcribed live by **Cartesia Ink 2**.
2. On every caller utterance, **Claude Haiku 5.5** pulls out stroke signs (BE-FAST) and key facts. Each item must come with a verbatim quote.
3. Code checks every quote against the transcript. Anything the caller did not actually say is dropped (**quote or drop**). Validated quotes are linked to their timestamps.
4. **Claude Sonnet 5.5** re-reads the whole call. It sets the level (none / possible / likely), names look-alikes (low blood sugar, seizure, migraine…) and proposes the next question. A code guard holds `likely` until two distinct sign kinds, one of them face, arm or speech, have been quoted.
5. The caller says something like "fine at about 9:30". A deterministic parser turns that phrase into a clock time with a range. **The time is computed by code, never by the model.**
6. The dispatcher clicks **Send stroke pre-alert**. Code composes the briefing from validated facts only, and **Cartesia Sonic 3.6** voices it. The stroke team's phone rings and the briefing plays as soon as they answer. A board shows the alert with a countdown to the 4.5-hour treatment window.

LastWell never says "not a stroke", never dispatches units or changes call priority, and never instructs the caller. The dispatcher approves every alert.

## Architecture

```
caller phone ──Twilio──► <Start><Stream both_tracks> ──wss──┐            ┌──► dispatcher phone (<Dial>)
                                                            ▼            │
                     apps/gateway (Node 22, Fastify)  ──────────────────┘
                       Ink 2 ×2 (caller, dispatcher) ─► utterances
                       fast pass (Haiku) ─► quote validator ─► CaseState ◄─ reasoner (Sonnet) + level guard
                       LKW parser (code) ─► clock time + range
                       approve ─► briefing composer (code) ─► Sonic bytes ─► Twilio outbound call
                       /ws/ui + REST ─────────────┐                         (bidirectional media stream)
                       Convex (write-through store)│
                                                  ▼
                       apps/web (Next.js 15): /console/[callId] dispatcher console · /board stroke-team board
```

| Package | What it holds |
| --- | --- |
| `packages/core` | Contracts (zod), prompts, Claude wrappers, quote validator, level guard, LKW parser, briefing composer, keyword baseline, CaseState reducer. Pure apart from the Claude API. |
| `packages/stt` | The Cartesia Ink 2 WebSocket client, shared by the gateway and the eval runner |
| `apps/gateway` | Twilio webhooks and media streams, STT sessions, call pipeline, alerts, UI WebSocket and REST, Convex functions |
| `apps/web` | Dispatcher console, stroke-team board, browser-microphone fallback |
| `apps/eval` | 20 scripted calls and the scoring runner (LastWell vs a keyword baseline) |
| `apps/e2e` | Offline end-to-end test of the demo path against a gateway with every vendor faked |

## Cartesia features used

- **Ink 2 streaming STT with turn detection** (`/stt/turns/websocket`): `turn.start` / `turn.update` / `turn.end` drive the live transcript and the per-utterance reasoning, with no VAD of our own. Turn detection is tuned per use: a `call` profile on the 911 call and a `qa` profile on the briefing call. A dropped Ink socket reconnects once; a second drop puts a "transcription degraded" banner on the console.
- **Keyterms**: drug names (Eliquis, Xarelto, warfarin, Plavix…) and stroke vocabulary are passed as `keyterm=` on every session by default (`STT_KEYTERMS`), because a misheard blood thinner is the costliest error in a briefing.
- **Native telephony audio**: Ink 2 takes Twilio's µ-law 8 kHz frames as is (`encoding=pcm_mulaw&sample_rate=8000`). There is no resampling code in the repo.
- **Two concurrent Ink sessions per call**, one per Twilio track, so the transcript is speaker-labelled (caller / dispatcher) without diarization.
- **Sonic 3.6 TTS Bytes**: the briefing is synthesized as raw `pcm_mulaw` 8 kHz when the alert is approved and streamed into a Twilio bidirectional media stream as soon as the stroke team answers, so no synthesis happens while they wait. The same cached bytes, decoded to a WAV, feed the laptop-speaker fallback (`ALERT_DELIVERY=local`).
- **Sonic WebSocket** with per-answer `context_id` and cancel for barge-in, for spoken Q&A on the briefing call. Q&A ships **off** (`FEATURE_QA_ENABLED=false`, decision D-32) until it passes rehearsals. When on, common questions (last seen normal, blood thinners, age, signs, address) are answered from the validated case state with no model call: about 0.9 s from the end of the question to the first answer audio (bench median, no phone network), against 2.1 s through the model.

## Claude models

| Call | Model | Settings |
| --- | --- | --- |
| Fast pass (per caller utterance) | `claude-haiku-5-5` | effort `low`, thinking disabled, structured output |
| Reasoner (whole transcript, on new evidence or every 10 s) | `claude-sonnet-5-5` | effort `medium`, adaptive thinking, structured output |
| Q&A on the briefing call (optional) | `claude-haiku-5-5` | effort `low`, answers only from the call, fixed fallback phrase |

No sampling parameters are set. Every model output is schema-validated, then quote-validated.

## Run it

Requirements: Node 22+, pnpm 9 (`corepack enable`), and for the live phone path: an **upgraded** Twilio account with a number, a Cartesia API key, an Anthropic API key, a Convex account and an ngrok static domain.

```bash
git clone https://github.com/Abhinand-VB/LastWell.git && cd LastWell
corepack enable && pnpm install
cp .env.example .env                       # fill in keys and phone numbers (comments explain each)
(cd apps/gateway && npx convex dev --once) # creates the Convex deployment; copy CONVEX_URL into .env
ngrok http 8787 --domain $NGROK_DOMAIN     # public URL for Twilio; set the number's voice webhook to $PUBLIC_BASE_URL/twilio/voice
pnpm --filter @lastwell/gateway start      # gateway on :8787 (use `pnpm dev:gateway` only while editing: it restarts on save)
pnpm dev:web                               # console and board on :3000
```

No keys? `pnpm dev:fake` runs the gateway with every vendor faked (Claude, STT, TTS, Twilio, store) plus the web app, and replays the Card A call every 90 seconds. Outbound calls only ever go to numbers listed in `ALERT_ALLOWED_NUMBERS`.

Checks:

```bash
pnpm verify                                   # secret scan, typecheck, unit tests, eval-script validation
pnpm e2e                                      # offline end-to-end test of the demo path (faked vendors)
pnpm --filter @lastwell/eval eval --mode text # scripted eval: LastWell vs keyword baseline (needs ANTHROPIC_API_KEY)
```

## Results

The scripted eval (20 calls written by the team: 12 strokes including chameleons, 5 stroke look-alikes, 3 other emergencies) compares LastWell with a keyword alert of the kind general 911 tools ship ("stroke", "droop", "slur", "numb", …). Numbers below are copied from the eval run's own output (E-03 run 2, the final allowed full run, `apps/eval/results/E-03-run2-table.md`), not typed by hand:

| Metric | LastWell (Haiku 5.5 + Sonnet 5.5) | Keyword baseline |
| --- | --- | --- |
| Sensitivity @possible (n=12 strokes) | 12/12 (100%) | 3/12 (25%) |
| Sensitivity @likely | 7/12 (58%) | — |
| Precision @possible (flags=17) | 12/17 (71%) | 3/6 (50%) |
| Precision @likely | 7/7 (100%) | — |
| Median seconds to first flag | 12 s | 12 s |
| Last-known-well correct (n=16) | 16/16 | — |
| Blood thinner correct (n=8) | 8/8 | — |
| Invented facts shown | 0 | — |
| Dropped by the quote validator | 0 items | — |

20 scripted calls (text mode), written by the team; real-world precision will be lower. The 5 non-stroke flags at Possible are the 5 look-alike scripts, each shown with its look-alike panel (e.g. "low blood sugar"); the 3 other emergencies stayed at None. The keyword baseline caught only 3 of 12 strokes, which is why its time to first flag ties ours. **Through real speech recognition:** the same pipeline on 6 scripts spoken by Sonic in three deliveries (calm, accented, panicked), sent as phone audio through Ink 2, flagged 4/4 strokes in every voice, with LKW 6/6, blood thinner 3/3 and 0 invented facts (`apps/eval/results/audio-robustness.md`). Synthetic speech is cleaner than a real 911 caller (no line noise, crosstalk or crying), so treat this as a transcription check, not a field result.

Every script ended at its expected level (20/20). Run 2 used prompt versions `fast-3`/`reasoner-3`; the later guardrail revisions (`fast-5`/`reasoner-5`) were spot-checked live on fixture calls and 5 scripts with the same results. Median model latency in the run: fast pass 1.3 s, reasoner 2.9 s.

## Honest limits

- **Clinical truth labels are partly unverified.** An EMT gave us feedback on the idea, but the expected answers for scripts A05 (an aspirin case) and B08 (a migraine-history case) have not been reviewed by a clinician.
- **Scripted calls, not real 911 audio.** The test calls were written by us, so our numbers will look better than reality. For a real-world reference: in a Copenhagen study, an AI model recognized 63.0% of strokes with 24.9% precision, against 52.7% / 17.1% for human call handlers.
- **Fallback without the phone line.** If the phone path fails at the table, the caller speaks into the browser microphone and the Sonic briefing plays from the laptop speaker (`ALERT_DELIVERY=local`); the rest of the pipeline is identical.
- **The demo phones belong to teammates.** At the judging table, teammates play the caller, the dispatcher and the on-call clinician. The judge draws the case card and checks the sealed answer.
- **Browser-microphone fallback is one mixed track.** One laptop mic hears both people, so that mode has no speaker labels.
- **No SMS.** US carriers block SMS from unregistered 10DLC numbers, so the alert is a voice call. The SMS path exists behind `ALERT_SMS_ENABLED=false`.
- **Demo-grade auth.** A single shared internal key, short-lived WebSocket tokens, signature-checked Twilio webhooks. Do not deploy this publicly as is.
- **Not a medical device.** LastWell suggests and quotes; the dispatcher decides whether to send, and the treating team makes every treatment decision. The time-savings estimate (7–23 minutes earlier than a scene pre-alert) comes from national EMS chest-pain medians.
- **Signs are append-only.** If the caller corrects themselves after a sign was quoted ("no wait, his arm is fine"), the earlier sign stays on the card with its quote; the dispatcher sees both sentences in the transcript.
- **Sex from a bare pronoun is not extracted.** "He" or "she" alone does not set the patient's sex; words like "my father" or "my wife" do.
- No audio is stored in phone mode. Transcripts live in the demo database only for the event and are wiped afterwards.

## Path to production

LastWell is a hackathon prototype tested on scripted calls. Getting it near a real 911 floor takes three stages, each with numbers fixed in advance and a clear stop-or-go. The measures are the ones our eval already computes, plus one only a hospital can provide:

- **Sensitivity**: strokes flagged ÷ all strokes; **precision**: strokes ÷ all flags.
- **Seconds to flag** from the start of the call.
- **LKW accuracy**: last-known-well time within tolerance of the chart.
- **Invented facts**: anything shown that the caller did not say. Must stay 0.
- **Door-to-CT time** at the stroke center (stage 3 only).

**Stage 1: retrospective, on archived calls.** Run LastWell offline over a 911 center's recorded calls, matched to stroke-registry outcomes, the design the Copenhagen and Bergen studies used. Nobody is affected; it answers "does it work on real audio?"
- Measure: sensitivity, precision, seconds to flag, LKW accuracy against the chart, invented facts, and results broken down by caller accent, language and call quality.
- Exit: agreed in advance with the center's medical director. For example: sensitivity at least the center's own call-handler rate (Copenhagen's call handlers recognized 52.7% of strokes), precision no worse than the Copenhagen AI model's 24.9%, invented facts 0, and no caller group doing clearly worse than the rest.

**Stage 2: shadow mode, live.** LastWell listens to live calls, but dispatchers see nothing; its flags are compared with outcomes afterwards.
- Measure: the same numbers on live audio, plus uptime and latency under real load and how often it would have pre-alerted a call that turned out not to be a stroke.
- Exit: stage 1 numbers hold on live calls for a pre-agreed period, and the center's security review passes.

**Stage 3: supervised pilot.** One 911 center and one stroke center. Dispatchers see the console and **approve every pre-alert**, as they do in the demo.
- Measure: everything above, plus door-to-CT time for pre-alerted patients against the center's baseline, and dispatcher feedback (alert fatigue, trust).
- Exit: a door-to-CT improvement the stroke team considers worthwhile, no safety events attributable to LastWell, and the go-ahead of both centers' clinical leads.

**What is already built for this.**
- **An audit trail per call** (`GET /api/calls/:callId/audit`): the transcript with timestamps, every quoted sign and fact, each level change with its reason, and who approved, retried or confirmed what, with phone numbers masked.
- **Dispatcher approval on every alert.** LastWell never dispatches, changes call priority or speaks to the caller.
- **Quote-or-drop:** 0 invented facts in every eval run so far.
- **A first bias check** (`apps/eval/results/audio-robustness.md`): 6 scripts in calm, accented and panicked synthetic voices through real speech recognition gave the same results. Synthetic voices are not real callers; stage 1 is where this check becomes real.

**Open questions we cannot answer yet.**
- **Regulatory review:** whether decision support on a 911 call needs clearance as a medical device, and under which rules.
- **911 security requirements:** call audio and transcripts leaving the center's network, vendor access, data retention.
- **Real-audio performance:** every number we have comes from scripted calls written by our team, so we don't know how it performs on real 911 audio. Stage 1 exists to find out.

## For contributors and coding agents

Start at [`CLAUDE.md`](./CLAUDE.md). The source of truth is [`docs/`](./docs), and [`docs/10-BUILD-SPEC.md`](./docs/10-BUILD-SPEC.md) describes how the four parallel sessions build and land work. `.env.example` lists every variable; keys never go into git (`pnpm scan:secrets` runs inside `pnpm verify`).
