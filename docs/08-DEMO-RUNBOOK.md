# 08 — Demo runbook

Owner: Clinical & pitch lane, with the Voice lane on standby. The judging table demo is two minutes. Everything here exists so that the medical professional's phone rings with the briefing every time.

Since D-30/D-31 (docs/09): **teammates play every phone role.** The judge draws a card, watches LastWell decide, then flips the card to check it. No judge's phone is ever dialed, and the judge never has to perform a script.

## 0. Fallback flow without the phone line (D-43)

**§3 (the phone call) is the primary script** now that the Twilio number exists (2026-10-24 ~18:20 PT). Use this section only when the phone path fails at the table (no inbound transcript, no briefing call, ngrok or carrier down): set `ALERT_DELIVERY=local` and restart the gateway with `start`, then run the script below. Everything after the microphone is the same pipeline: Ink 2 transcription, Haiku/Sonnet with quote-or-drop, the LKW parser, code-composed briefing, Sonic voice.

Setup (gateway Mac, port 8787; no ngrok needed in this mode):
- [ ] `.env`: `DEMO_MODE=true`, `LASTWELL_FAKES=` (empty), `ALERT_DELIVERY=local`, `FEATURE_BROWSER_MIC=true`, `FEATURE_QA_ENABLED=false`. Gateway: `pnpm --filter @lastwell/gateway start`; `curl -s localhost:8787/healthz` → `{"ok":true,…}` with no `fakes`.
- [ ] Web on the same Mac (`pnpm --filter @lastwell/web dev`); `/` loads; `/api/config` shows `alertDelivery: "local"`.
- [ ] Laptop speaker volume up; a USB/table mic (or the laptop mic) placed between the caller and the dispatcher; the room is as quiet as you can make it.
- [ ] Smoke test: open `/mic`, press Start, say "test one two three" → the console shows the utterance within 3 s. Then "Test briefing call" → a `TEST` alert appears → **Play briefing** plays the canned briefing from the speaker; "Clear test alerts" removes it.

Roles: **Presenter** (deck, slide). **Caller** (teammate, sits at the mic and acts the drawn card). **Dispatcher** (teammate, at the console, asks the questions aloud into the same mic). **Medical professional / Runner** (teammate, runs `/board` and the fallback switches; "receives" the briefing from the speaker).

| Time | What happens | Who | Cue / fallback |
| --- | --- | --- | --- |
| 0:00 | Copenhagen hook (same words as §3). | Presenter | — |
| 0:10 | The judge draws from the **full deck**; for a stroke card the presenter writes the LKW time in the blank (D-20) and hands it to the caller. | Presenter + judge | — |
| 0:15 | Runner opens `/mic` → **Start** (a new browser call opens on the console). "Our phone line just dropped, so this call comes through this microphone — the pipeline after it is identical." | Runner + presenter | No transcript within 4 s → check the mic level meter, then restart `/mic`. |
| 0:20 | Dispatcher: "911, what is the address of your emergency?" … "Tell me exactly what happened." The caller acts the card. Console: transcript (speaker `mixed`), quotes underline, Possible → Likely, the "what time exactly" banner. | Caller + dispatcher | The dispatcher asks open questions so the caller's own words carry the signs. |
| 0:50 | Dispatcher follows the banner (LKW, blood thinners, face/arm check). If the card shows Possible or Likely and the dispatcher judges it a stroke: **Send stroke pre-alert** → confirm. | Dispatcher | Never send at None. |
| 1:00 | The alert status shows the briefing is ready → Runner (as the medical professional) clicks **Play briefing**: Sonic reads the briefing from the laptop speaker. "This is what the on-call stroke neurologist hears when they pick up." | Runner | No audio → check volume; replay once; else backup video from 1:00. |
| 1:15 | The judge flips the card; presenter points at the board (quotes, countdown, "Dispatcher pre-alert"). | Judge + presenter | — |
| 1:25 | Not a stroke on the first card → one draw from the **stroke pile**, short form; otherwise the B01/C01 replays (`/`). | Presenter | — |
| 1:45 | Slide (§3 numbers). | Presenter | — |

Honest line for judges who ask: "Normally the briefing is a phone call to the stroke team; that path is built and you can see it in the code and the tests."

## 1. Roles at the table

| Role | Person | Has |
| --- | --- | --- |
| Presenter | pitch lead | the full deck (12 cards) and the stroke pile (4 cards), a marker for the LKW blank, the slide, the backup video cued |
| Caller | teammate 2 | their own phone (not verified on the Twilio account), the demo number saved as a contact; reads the drawn card's front |
| Dispatcher | voice lead | headset on the dispatcher phone (`DISPATCHER_PHONE`), laptop 1 with the console open |
| Medical professional | teammate 4 (also the Runner) | the phone at `ALERT_DEFAULT_TARGET_PHONE` (in `ALERT_ALLOWED_NUMBERS`), on speaker so the judge hears the briefing; gateway logs in a terminal, ready to flip the fallback switch; laptop 2 / tablet with `/board` open, the hotspot phone |

With four people, the medical professional also runs the board and the fallback switch; the presenter can take the board if a fifth pair of hands is missing.

## 2. Pre-flight checklist (run it before every rehearsal and 20 minutes before judging)

**Code on the gateway Mac comes from `main` (D-48).** Integration merges a green `version1` into `main` at every 20-minute loop. To pick up the latest: `git checkout main && git pull`, then `pnpm install` and restart the gateway with `pnpm --filter @lastwell/gateway start`. Do this only between rehearsals, never during a demo, and check `curl -s localhost:8787/healthz` afterwards.


Infrastructure
- [ ] Gateway laptop on the hotspot (not venue Wi-Fi) — Cal Hacks venues have had unreliable Wi-Fi; a phone hotspot carried every test on Friday night, so it carries the demo.
- [ ] `ngrok http 8787 --domain $NGROK_DOMAIN` running; `curl -s $PUBLIC_BASE_URL/healthz` → `{"ok":true,…,"cartesia":"ok"}`.
- [ ] `pnpm --filter @lastwell/gateway start` running (plain `tsx`, reads the repo-root `.env`, `LASTWELL_FAKES` empty, `DEMO_MODE=true`, `LOG_LEVEL=info`); no red lines in the last 60 s. **Never `dev` on the demo laptop:** `dev` is `tsx watch` and restarts the gateway on any file save, dropping live calls and in-memory alerts.
- [ ] Twilio number webhook = `$PUBLIC_BASE_URL/twilio/voice` (Console → Phone Numbers → the number → Voice); the number is `TWILIO_PHONE_NUMBER` in `.env` (set 2026-10-24) and `ALERT_DELIVERY=phone`.
- [ ] Twilio account is **upgraded** (balance ≥ $10), not trial; otherwise the caller's phone cannot call in and the medical professional's phone cannot be called.
- [ ] Cartesia credits ≥ 100 000 (Playground → Billing).
- [ ] Anthropic console shows no rate-limit warnings; `ANTHROPIC_API_KEY` is the team's funded key.
- [ ] Web app running on laptop 1 (`pnpm --filter @lastwell/web dev`); `/` lists calls. Laptop 2 runs its **own** web app pointed at the public gateway (`GATEWAY_URL=https://<ngrok>`, `NEXT_PUBLIC_GATEWAY_WS_URL=wss://<ngrok>/ws/ui`, docs/01 §7) and shows `/board`; the web app is never served through ngrok.
- [ ] Dispatcher phone charged, on Do Not Disturb exceptions for the Twilio number, ringer on, headset paired.
- [ ] Medical professional's phone charged, ringer on, Do Not Disturb off, "Silence Unknown Callers" off, the Twilio number saved as a contact.
- [ ] `.env` on the gateway laptop: `DEMO_MODE=true`, `LASTWELL_FAKES=` (empty), and the gateway log shows **no red fakes banner**; `FEATURE_QA_ENABLED=false` unless Q&A passed two clean rehearsals (D-32).
- [ ] Hotspot phone charged; backup battery on the table.
- [ ] Backup video (`demo-backup.mp4`, 90 s) open in a player, paused at 0:00, volume checked.

Content
- [ ] The full deck (12 cards) and the stroke pile (4 cards) printed (§6, task C-04), backs sealed, plus the demo number in 48 pt.
- [ ] Slide with the eval table (docs/07 §5 output) and the "scripted calls" footnote.
- [ ] `.env` has `DEMO_ALERT_TO_CALLER=false`, `ALERT_DEFAULT_TARGET_PHONE` = the medical professional's phone, and `ALERT_ALLOWED_NUMBERS` containing that number and the dispatcher's (D-30, D-35); the Send modal prefills it.
- [ ] Every stroke card's time blank is **empty** (it is written in right before the card is handed to the caller, §6, D-20); a marker pen is on the table.

Smoke test (two minutes, every time)
1. A teammate other than the dispatcher calls the demo number (the dispatcher's phone is the `<Dial>` target and must be free to answer), says "test one two three", hangs up. Console shows the utterance within 3 s.
2. Runner opens any console page and clicks the **"Test briefing call"** footer link, enters the dispatcher's number. The phone rings, the canned briefing plays and ends with "Goodbye." (with `FEATURE_QA_ENABLED=true`: "Is he on blood thinners?" gets "That wasn't mentioned on the call.") (docs/03 §6 `test-briefing`). Repeat once with the medical professional's number.
3. `/board` on laptop 2 shows the test alert (label `TEST`); the Runner removes it with the console footer's "Clear test alerts" link.

## 3. The two-minute script (from the brief §8, adapted to D-30/D-31)

| Time | What happens | Who | Cue / fallback |
| --- | --- | --- | --- |
| 0:00 | "In a big Copenhagen study, call handlers caught about half of strokes on the 911 call. And the hospital usually hears only once paramedics are with the patient." | Presenter | — |
| 0:10 | Presenter fans the **full deck** face down: "Pick any case — some are strokes, some only look like one. The answer is sealed on the back." The judge draws one. If it is a stroke card, the presenter writes the LKW time in the blank (the half-hour mark about one hour before now, D-20) and hands it to the caller; the judge keeps sight of the sealed back. | Presenter + judge | Never let the caller see the back. |
| 0:20 | The caller dials the demo number from their own phone and acts the card's front in their own words; the dispatcher answers "911, what is the address of your emergency?" then "Tell me exactly what happened." Console: words underline, the card moves to Possible (and Likely when two quoted signs include a focal one), banner "Ask: what time exactly was he last seen completely normal?" when the time is vague. | Caller + dispatcher | No transcript within 4 s of the first sentence → Runner says "switching to the table mic" and opens `/mic` (§5). |
| 0:50 | Dispatcher follows the banner (last known well, blood thinners, the face/arm check the card asks for). If the card shows Possible or Likely and the dispatcher judges it a stroke, they click **Send stroke pre-alert** — the caller may still be on the line (D-30) — and confirm the prefilled number (the medical professional's). For a look-alike, the presenter points at the look-alike panel: LastWell names the alternative instead of escalating. | Dispatcher | If LKW didn't parse, the dispatcher asks "so about 9:30 this morning?" to get a clean phrase. Never send for a card the console holds at None. |
| 1:00 | The medical professional's phone rings (on speaker); Sonic reads the briefing with the LKW time and the blood thinner. | Medical professional | No ring within 20 s → Runner clicks "Call again" once; still nothing → backup video from 1:00. |
| 1:15 | **The judge flips the card**: the sealed answer (stroke or not, expected level, LKW, blood thinner) next to what LastWell showed. Presenter points at the board: card, quotes, countdown, "Dispatcher pre-alert" status. | Judge + presenter | — |
| 1:25 | If the first card was not a stroke (no briefing yet), the judge draws again from the **stroke pile** (4 cards) and 0:20–1:15 repeats in short form; otherwise 15 s on the replays ("Replay B01" / "Replay C01" on `/`, task W-10): the chameleon held at **Possible** with two quoted signs and a face-check banner ("no keyword would have fired"), the look-alike held at Possible with "low blood sugar — answered". | Presenter | Replays depend on nothing but Claude; their LKW reads relative to the real clock (docs/05 §13). |
| 1:45 | One slide: test-set results vs keyword baseline, labelled "20 scripted calls" (D-33). "What's next: shadow mode with a 911 center." | Presenter | — |

Say these words somewhere in the two minutes: "quote or drop", "the time is computed by code, not by the model", "the dispatcher approves every alert", "we never say not a stroke".

### Slide numbers (E-03 run 2, the final allowed full run; copied from `apps/eval/results/E-03-run2-table.md`)

LastWell vs keyword baseline: sensitivity @possible 12/12 vs 3/12 · sensitivity @likely 7/12 · precision @possible 12/17 vs 3/6 · precision @likely 7/7 · LKW correct 16/16 · blood thinner correct 8/8 · invented facts 0. Footnote: "20 scripted calls (text mode), written by the team; real-world precision will be lower — the Copenhagen model was right about one time in four (63.0% recall, 24.9% precision)." Level agreement 20/20; median fast pass 1.3 s, reasoner 2.9 s. (Run on prompts fast-3/reasoner-3; fast-5/reasoner-5 spot-checked with the same results on A01, B01, C01, C02, D01.) Audio line for the slide (copied from `apps/eval/results/audio-robustness.md`): 6 scripts × Sonic calm / accent / panicked through Ink 2 → strokes flagged 4/4, LKW 6/6, blood thinner 3/3, invented facts 0 in every voice; caveat on the slide: "synthetic speech, cleaner than a real 911 caller". Never type numbers by hand.

## 4. Dispatcher coaching (the person on the headset)

- Keep to the protocol order: address → "tell me exactly what happened" → awake/breathing → the banner question → blood thinners → "help is on the way".
- Ask open questions ("describe it for me", "what does his face look like") rather than yes/no; the system needs the caller's words to quote.
- If the caller improvises off-card, follow the banner. The system handles new facts; the dispatcher does not need to steer back.
- Never read the card's result out loud; let the judge see it on the console, then flip the card.
- Clicking Send: confirm the number shown is the medical professional's; press once; do not click again while the modal shows "calling" — "Call again" is the Runner's call after 20 s.
- Before a stroke card goes to the caller, write the time: the half-hour mark about one hour before now (at 10:40 write "9:30"). A future time would be parsed as yesterday and the board would say "window passed".

## 5. Failure switches

| Symptom | Switch | How |
| --- | --- | --- |
| The caller's call does not reach the console | Table mic | Runner opens `/mic`, presses Start, slides the laptop toward the caller; dispatcher continues on their own phone normally. The briefing call still goes out (needs ngrok up). |
| ngrok or hotspot dead | Backup video | Presenter: "Our line just dropped — here is the recording from this morning's rehearsal." Play from 0:00. Keep the pitch lines. |
| Phone rings but no audio, or no ring within 20 s | Call again | Runner clicks "Call again" (works from calling/ringing/failed); Sonic bytes are cached, so it is only Twilio. Second failure → video from 1:00. |
| Phone path dead (Twilio, carrier or ngrok) for the rest of the slot | §0 fallback | Runner sets `ALERT_DELIVERY=local`, restarts the gateway with `start`, and the demo continues with `/mic` and **Play briefing** (D-43). |
| Q&A does not answer within 5 s (only if `FEATURE_QA_ENABLED=true`) | Presenter bridges | "It answers only from the call; let me show the board while it thinks." Then move on; the briefing itself was the climax. |
| Console shows Possible but not Likely for a stroke card | Keep going | Presenter: "It stays at Possible until two signs are quoted." Click Send anyway (enabled at Possible). |
| Claude errors in the log | Keep going | The transcript still shows; the briefing uses whatever was validated. Never restart the gateway during the demo. |

## 6. Cards (print at 20 pt; task C-04)

The **full deck** has 12 cards (strokes, chameleons, look-alikes); the **stroke pile** has 4 stroke cards. Each card is built only from a script that passes the X-02-style checks. **Front:** the facts for the caller in lay words, plus the LKW blank on stroke cards (D-20). **Back (sealed):** the answer (stroke or not, the script id) and the expected LastWell result (level, chips, LKW, blood thinner, look-alike). The printable file and the card list live with task C-04 (`docs/cards/`). Three cards keep the brief's wording:

**Card A — classic** (the time blank is filled in by hand right before the card is handed over: the half-hour mark about one hour before now, e.g. "9:30" at 10:40)
> Say: "It's my father, he's 78. Since lunch his words come out all mixed up and his right hand is weak — he can't lift his coffee cup."
> If asked when he was last normal: "He was fine at about ______."
> If asked about medicines: "He takes Eliquis."

**Card B — chameleon**
> Your wife is dizzy, keeps bumping into the wall and says she sees double. You think she's just tired.

**Card C — look-alike**
> Your husband is diabetic, skipped dinner, is sweaty and confused.

The caller acts the front in their own words; the dispatcher asks questions as on a real call.

## 7. Rehearsal protocol (Sunday morning, ten runs)

1. Runs 1–3: a team member draws the cards as the judge, phone on venue Wi-Fi off, hotspot on. Fix anything that fails before continuing.
2. Runs 4–7: a stranger from another team draws the cards and flips them (buy them coffee). Ask whether the flip convinced them; note every card where LastWell disagreed with the sealed answer.
3. Runs 8–10: full script with the presenter talking over it, timed. Every run must hit the ring within 20 s of the click; if any run fails, find the cause before the next.
4. Record run 9 as the backup video (`demo-backup.mp4`): screen recording of the console + the medical professional's phone audio; 90 s; trimmed.
5. Log the latencies (`fastpass.done`, `reasoner.done`, and `qa.answer` if Q&A is on) from run 10 for the corner readout and the Devpost "challenges" paragraph.

## 8. Timeline reality check

The brief's hour-by-hour plan (Fri 6 PM → Sun 9 AM) assumed a Friday start. If the build starts later, the gates in `docs/TASKS.md` keep their order and the fallbacks below; compress the clock, not the gates. The thing never cut is the medical professional's phone ringing with the briefing.

| Gate (TASKS.md) | Brief's deadline | Milestone | If it fails |
| --- | --- | --- | --- |
| M-01 Gate 0 | Fri 9 PM | Phone call audio reaches Cartesia and prints a transcript | Keep trying until gate 1 |
| M-02 Gate 1 | Fri 11 PM | Live transcript from a real phone call on screen | Switch the demo to browser-microphone audio; keep the phone for the briefing only |
| M-03 Gate 2 | Sat 4 AM | Haiku pass returns valid JSON with quotes on 5 test scripts | Simplify the schema; drop look-alikes to v2 |
| — | Sat 10 AM | Dispatcher console live with card, quotes, next question; interview done by noon | — |
| M-04 Gate 3 | Sat 2 PM | Approve button places the Sonic briefing call | One-way briefing without Q&A |
| — | Sat 6 PM | Stroke-team board; Sonnet pass; LKW parser | Board can be cut; the call carries the demo |
| — | Sat 9 PM | Test runner scores all scripts; numbers go on the slide | Run on a subset; say so |
| — | Sat 11 PM | Devpost draft submitted; backup video recorded | — |
| M-05 | Sun 2 AM | Feature freeze; only bug fixes after this | — |
| M-06 | Sun 6–8 AM | Ten full rehearsals on the real line; final Devpost edits | — |
| — | Sun 9 AM | Submission (aim for 8:00); 10:30 whole team at the table | — |

## 9. Submission (brief §13, Hacker Guide)

- [ ] Devpost draft live Saturday night; every teammate added.
- [ ] Repo public; README (task C-06) lists setup, Cartesia features used (Ink 2 streaming with turn detection, keyterms, Sonic 3.6 bytes + websocket, µ-law telephony formats), known limits; `.env.example` only, no keys (`git log -p | grep -i "sk_car\|AC[0-9a-f]\{32\}\|sk-ant"` returns nothing).
- [ ] Devpost hard requirements (checked 2026-10-24): **project image**, **GitHub repo link**, **live or pre-recorded demo**; submit by **Sun 9:00 AM** (venue check-in by 8:00 AM). Pitch slot is 3 min pitch + 2 min judge Q&A — the two-minute script in §3 leaves one minute for the numbers slide.
- [ ] Tracks selected (exact Devpost names, verified 2026-10-24 — there is **no Anthropic prize** on Devpost). D-37: the pitch leads with Microsoft, Cartesia and the Cal Hacks general prizes; the Convex track is skipped (Convex is only a write-through store here, D-04):
  - Cal Hacks: Most Technically Advanced Hack · Best People-First Social Impact Hack · Most Creative Project · Hacker's Choice (Overall 1st/2nd/3rd are judged from the same submission).
  - [Cartesia] Best Use of Cartesia.
  - [Microsoft] 1st Place Built for the Real World · [Microsoft] 2nd Place Microsoft Customer Impact Award (ask the booth whether Microsoft tech is required; if so, the Claude client can route through Microsoft Foundry behind an env flag — core/claude/client.ts only, default stays direct).
  - [Meta] Bringing People Closer Together with AI (Round 2 invite; eligibility rules apply).
  - [MLH] Commit Fellowship Prize Category (opt in **and** file the supplemental form linked on Devpost).
  - [MLH] Best Domain Name from GoDaddy Registry — only if someone registers a domain (≤ 15 min; point it at the web app, never at the gateway/ngrok).
  - [Figma] Best Design — only if the console/board were actually mocked in Figma; attach the file link. Do not opt in otherwise.
- [ ] Backup video uploaded.
- [ ] Interview quote in the Devpost "Inspiration" line.
- [ ] Whole team at the table for the full judging window.
