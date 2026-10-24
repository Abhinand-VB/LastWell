# 08 — Demo runbook

Owner: Clinical & pitch lane, with the Voice lane on standby. The judging table demo is two minutes. Everything here exists so that the judge's phone rings every time.

## 1. Roles at the table

| Role | Person | Has |
| --- | --- | --- |
| Presenter | pitch lead | the three cards, the slide, the backup video cued |
| Dispatcher | voice lead | headset on the dispatcher phone (`DISPATCHER_PHONE`), laptop 1 with the console open |
| Board | screens lead | laptop 2 / tablet with `/board` open, the hotspot phone |
| Runner | reasoning lead | gateway logs in a terminal, ready to flip the fallback switch |

## 2. Pre-flight checklist (run it before every rehearsal and 20 minutes before judging)

Infrastructure
- [ ] Gateway laptop on the hotspot (not venue Wi-Fi) — Cal Hacks venues have had unreliable Wi-Fi; a phone hotspot carried every test on Friday night, so it carries the demo.
- [ ] `ngrok http 8787 --domain $NGROK_DOMAIN` running; `curl -s $PUBLIC_BASE_URL/healthz` → `{"ok":true,…,"cartesia":"ok"}`.
- [ ] `pnpm --filter @lastwell/gateway dev` running with `LOG_LEVEL=info`; no red lines in the last 60 s.
- [ ] Twilio number webhook = `$PUBLIC_BASE_URL/twilio/voice` (Console → Phone Numbers → the number → Voice).
- [ ] Twilio account is **upgraded** (balance ≥ $10), not trial; otherwise the judge's phone can neither call in nor be called.
- [ ] Cartesia credits ≥ 100 000 (Playground → Billing).
- [ ] Anthropic console shows no rate-limit warnings; `ANTHROPIC_API_KEY` is the team's funded key.
- [ ] Web app running on laptop 1 (`pnpm --filter @lastwell/web dev`); `/` lists calls. Laptop 2 runs its **own** web app pointed at the public gateway (`GATEWAY_URL=https://<ngrok>`, `NEXT_PUBLIC_GATEWAY_WS_URL=wss://<ngrok>/ws/ui`, docs/01 §7) and shows `/board`; the web app is never served through ngrok.
- [ ] Dispatcher phone charged, on Do Not Disturb exceptions for the Twilio number, ringer on, headset paired.
- [ ] Hotspot phone charged; backup battery on the table.
- [ ] Backup video (`demo-backup.mp4`, 90 s) open in a player, paused at 0:00, volume checked.

Content
- [ ] Cards A, B, C printed (text in §6), plus the demo number in 48 pt.
- [ ] Slide with the eval table (docs/07 §5 output) and the "scripted calls" footnote.
- [ ] `.env` has `DEMO_ALERT_TO_CALLER=true` so the alert modal prefills the judge's number. If the judge's caller ID is withheld, the dispatcher types the number the judge reads out.
- [ ] Card A's time blank is **empty** (it is written in right before handing the card over, §6); a marker pen is on the table.

Smoke test (two minutes, every time)
1. A teammate other than the dispatcher calls the demo number (the dispatcher's phone is the `<Dial>` target and must be free to answer), says "test one two three", hangs up. Console shows the utterance within 3 s.
2. Runner opens any console page and clicks the **"Test briefing call"** footer link, enters the dispatcher's number. The phone rings, the canned briefing plays, "Is he on blood thinners?" gets "That wasn't mentioned on the call." (docs/03 §6 `test-briefing`).
3. `/board` on laptop 2 shows the test alert (label `TEST`); the Runner removes it with the console footer's "Clear test alerts" link.

## 3. The two-minute script (from the brief §8, with cues)

| Time | What happens | Who | Cue / fallback |
| --- | --- | --- | --- |
| 0:00 | "In a big Copenhagen study, call handlers caught about half of strokes on the 911 call. And the hospital usually hears only once paramedics are with the patient." | Presenter | — |
| 0:15 | Hand the judge Card A. "Call this number and tell our dispatcher what's happening." | Presenter | If the judge hesitates, offer to dial for them on their phone; never dial from a team phone. |
| 0:20 | Judge reads Card A; dispatcher answers "911, what is the address of your emergency?" then "Tell me exactly what happened." Console: words underline, card moves to Possible then Likely, banner "Ask: what time exactly was he last seen completely normal?" ("since lunch" is vague, so the ladder asks for the clock time) | Judge + dispatcher | If no transcript within 4 s of the judge's first sentence → Runner says "switching to the table mic" and opens `/mic` (§5). |
| 0:50 | Dispatcher asks the banner question; judge reads the time written on the card ("fine at about 9:30"). Card shows that time with its range (9:30 AM (9:15–9:45 AM)) beside the words. Dispatcher asks about blood thinners; judge: "He takes Eliquis." Dispatcher: "Help is on the way — I'm going to let you go now, please hang up." Judge hangs up. **Then** the dispatcher clicks **Send stroke pre-alert** and confirms the prefilled number (the judge's). | Dispatcher | If LKW didn't parse, the dispatcher asks "so about 9:30 this morning?" to get a clean phrase. The judge must be off the 911 call before the click, or the briefing arrives as call-waiting (gotcha G-09). |
| 1:00 | Judge's phone rings. Presenter, before it rings: "Your phone is about to ring from a number it doesn't know — please answer it." Sonic reads the briefing. Presenter: "Ask it something — try 'Is he on blood thinners?'" | Judge | If no ring within 20 s → Runner clicks "Call again" once (allowed while the status pill says calling/ringing: it ends the first attempt and re-dials); if still nothing → play the backup video from 1:00. |
| 1:25 | Presenter points at the board: card, quotes, countdown, "Dispatcher pre-alert" status. Then 15 s on Card B (chameleon → **Possible**: two quoted signs, balance and eyes, and the banner asks for a face check — "no keyword would have fired") and Card C (look-alike → held at Possible with the panel "low blood sugar — answered: diabetic, skipped dinner") using the replays (`/` → "Replay B01" / "Replay C01" buttons, task W-10). | Presenter | Replays depend on nothing but Claude; their LKW reads relative to the real clock (docs/05 §13). |
| 1:45 | One slide: test-set results vs keyword baseline, labelled scripted. "What's next: shadow mode with a 911 center." | Presenter | — |

Say these words somewhere in the two minutes: "quote or drop", "the time is computed by code, not by the model", "the dispatcher approves every alert", "we never say not a stroke".

## 4. Dispatcher coaching (the person on the headset)

- Keep to the protocol order: address → "tell me exactly what happened" → awake/breathing → the banner question → blood thinners → "help is on the way".
- Ask open questions ("describe it for me", "what does his face look like") rather than yes/no; the system needs the caller's words to quote.
- If the judge improvises off-card, follow the banner. The system handles new facts; the dispatcher does not need to steer back.
- Never read the card's result out loud; let the judge see it on the console.
- Clicking Send: confirm the number shown is the judge's; press once; do not click again while the modal shows "calling" — "Call again" is the Runner's call after 20 s.
- Before handing over Card A, write the time: the half-hour mark about one hour before now (at 10:40 write "9:30"). A future time would be parsed as yesterday and the board would say "window passed".

## 5. Failure switches

| Symptom | Switch | How |
| --- | --- | --- |
| Judge's call does not reach the console | Table mic | Runner opens `/mic`, presses Start, slides the laptop toward the judge; dispatcher continues on their own phone normally. The briefing call still goes out (needs ngrok up). |
| ngrok or hotspot dead | Backup video | Presenter: "Our line just dropped — here is the recording from this morning's rehearsal." Play from 0:00. Keep the pitch lines. |
| Phone rings but no audio, or no ring within 20 s | Call again | Runner clicks "Call again" (works from calling/ringing/failed); Sonic bytes are cached, so it is only Twilio. Second failure → video from 1:00. |
| Q&A does not answer within 5 s | Presenter bridges | "It answers only from the call; let me show the board while it thinks." Then move on; the briefing itself was the climax. |
| Console shows Possible but not Likely for Card A | Keep going | Presenter: "It stays at Possible until two signs are quoted." Click Send anyway (enabled at Possible). |
| Claude errors in the log | Keep going | The transcript still shows; the briefing uses whatever was validated. Never restart the gateway during the demo. |

## 6. Cards (print at 20 pt)

**Card A — classic** (the time blank is filled in by hand right before the card is handed over: the half-hour mark about one hour before now, e.g. "9:30" at 10:40)
> Say: "It's my father, he's 78. Since lunch his words come out all mixed up and his right hand is weak — he can't lift his coffee cup."
> If asked when he was last normal: "He was fine at about ______."
> If asked about medicines: "He takes Eliquis."

**Card B — chameleon**
> Your wife is dizzy, keeps bumping into the wall and says she sees double. You think she's just tired.

**Card C — look-alike**
> Your husband is diabetic, skipped dinner, is sweaty and confused.

Tell the judge: "Our dispatcher will ask you questions — answer however you like." Cards B and C can be live if there is time; the replays exist for when there is not.

## 7. Rehearsal protocol (Sunday morning, ten runs)

1. Runs 1–3: team members as the judge, phone on venue Wi-Fi off, hotspot on. Fix anything that fails before continuing.
2. Runs 4–7: a stranger from another team as the judge (buy them coffee). Note every place they diverge from the card and how the system responded.
3. Runs 8–10: full script with the presenter talking over it, timed. Every run must hit the ring within 20 s of the click; if any run fails, find the cause before the next.
4. Record run 9 as the backup video (`demo-backup.mp4`): screen recording of the console + phone audio via the headset mic; 90 s; trimmed.
5. Log the latencies (`fastpass.done`, `reasoner.done`, `qa.answer`) from run 10 for the corner readout and the Devpost "challenges" paragraph.

## 8. Timeline reality check

The brief's hour-by-hour plan (Fri 6 PM → Sun 9 AM) assumed a Friday start. If the build starts later, the gates in `docs/TASKS.md` keep their order and the fallbacks below; compress the clock, not the gates. The thing never cut is the judge's phone ringing with the briefing.

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
- [ ] Tracks selected (exact Devpost names, verified 2026-10-24 — there is **no Anthropic prize** on Devpost):
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
