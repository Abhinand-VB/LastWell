# 00 — Overview

## One sentence

A voice agent listens to a 911 medical call, flags a likely stroke with verbatim quotes as evidence, pins down when the patient was last seen normal, and — after one click from the dispatcher — calls the on-call stroke neurologist with a 20-second spoken briefing they can question out loud.

## Users

| User | Needs | Screen / channel |
| --- | --- | --- |
| 911 dispatcher | One suggested question at a time; evidence they can trust; one button to send | **Dispatcher console** (web) |
| On-call stroke neurologist | The two facts that decide treatment (last known well, blood thinners) in 20 seconds, hands-free | **Briefing phone call** (Sonic voice) + **Stroke-team board** (web) |
| Judge (demo) | To pick the case, watch LastWell decide, then check its answer | Draws a card from the deck (D-31); watches the console, the board and the medical professional's phone |
| Teammates (demo) | Caller, dispatcher and "medical professional" (plays the on-call neurologist) | Caller's phone dials in; `DISPATCHER_PHONE` answers; `ALERT_DEFAULT_TARGET_PHONE` receives the briefing (D-30, D-31) |

## Scope — what we build this weekend

1. Inbound phone call to a Twilio number, bridged to a human dispatcher's phone, with both sides transcribed live (Cartesia Ink 2).
2. Two-speed reasoning: Claude Haiku 5.5 extracts signs and facts from every caller utterance; Claude Sonnet 5.5 re-reads the whole transcript to set the level (none / possible / likely), list look-alikes and pick the next question.
3. Quote-or-drop validation of every model output; last-known-well (LKW) time computed by a parser, never by a model.
4. Dispatcher console with live transcript, stroke card, next-question prompt, look-alike check, facts panel and the single **Send stroke pre-alert** button.
5. Alert dispatch: an outbound call to the neurologist's phone (in the demo: a teammate playing the medical professional, D-30) with a Sonic 3.6 briefing; live Q&A grounded only in the call is built last, behind `FEATURE_QA_ENABLED` (D-32).
6. Stroke-team board: one card per alert with quotes, countdown to 4.5 h from LKW, and an EMS-confirmed toggle.
7. Scripted test set (20 calls in text mode, D-33; the other 18 of the original 38 are backlog) scored against a keyword baseline, numbers on the slide.
8. Browser-microphone fallback that feeds the same pipeline when the phone line fails.

## Non-goals (do not build, do not get tempted)

- No dispatching, no priority changes, no instructions to the caller, no "this is not a stroke".
- No real 911 audio, no PHI, no persistence of audio after the call.
- No authentication beyond a shared internal key (private demo). No multi-tenant anything.
- No SMS in the demo (US carriers block SMS from unregistered 10DLC numbers, and registration takes days; see `docs/09` gotcha G-02). The brief's gate 3 says "SMS + call"; we ship the call, and the SMS code path exists behind `ALERT_SMS_ENABLED=false` for a registered number later.
- Sonic **3.6**, not 3.5: it went GA in September 2026, is backwards compatible, and is the model Cartesia's own Twilio guide uses. The pitch can say "Sonic".
- No speech-feature analysis (slurring detection) — listed as future work.
- No mobile app, no native anything. Two web pages and two phone calls.

## The acceptance test (this defines "the product works")

From a phone that is **not** a verified number on our Twilio account, the caller teammate dials the demo number and reads Card A to our dispatcher (D-31; at the table the judge draws the card) (`{T}` is a clock time written on the card right before it is handed over: the half-hour mark roughly one hour earlier than now — see runbook §6; a time in the future would be parsed as yesterday):

> Say: "It's my father, he's 78. Since lunch his words come out all mixed up and his right hand is weak — he can't lift his coffee cup."
> If asked when he was last normal: "He was fine at about {T}."
> If asked about medicines: "He takes Eliquis."

Pass criteria, all observed in one run:

| # | Observation | Budget |
| --- | --- | --- |
| 1 | Each caller utterance appears as final text on the console | ≤ 2.5 s after the speaker stops |
| 2 | Card shows **Likely** with at least two BE-FAST chips, each with a verbatim quote that is clickable | ≤ 12 s after "coffee cup" |
| 3 | Facts panel shows LKW as the card's time with a ±15 min range (e.g. `9:30 AM (9:15–9:45 AM)` for `{T}` = 9:30) beside the words `fine at about {T}`, and blood thinner `Eliquis` beside `takes Eliquis` | ≤ 5 s after each answer |
| 4 | Next-question banner has shown "Ask: what time exactly was he last seen completely normal?" (the "Since lunch" phrase parses as vague) before the clock time was given, then moved on to blood thinners | — |
| 5 | Dispatcher clicks **Send stroke pre-alert** (allowed while the 911 call is still live, D-30), confirms the prefilled target number (`ALERT_DEFAULT_TARGET_PHONE`, the medical professional's phone; it must be in `ALERT_ALLOWED_NUMBERS`, D-35) | — |
| 6 | The medical professional's phone rings; a Sonic voice reads the briefing with the LKW time and Eliquis | rings ≤ 20 s after click; speech starts ≤ 1.5 s after answer |
| 7 | *On for the demo since D-52 (`FEATURE_QA_ENABLED=true`; keep/kill after the morning rehearsals).* The medical professional asks "Is he on blood thinners?" and hears that the caller said he takes Eliquis. Asks "Any seizure before this?" and hears one of the three fixed "not mentioned" phrasings, e.g. "That wasn't mentioned on the call." (D-49). A "thank you" ends the call politely (D-49). | first audio of each answer ≤ 3 s after Ink's `turn.end` (≈ ≤ 4.5 s after the speaker stops; stopwatch in rehearsal) |
| 8 | Board shows the alert card with the countdown from LKW and the quotes | within 3 s of click |
| 9 | Card B (chameleon) yields **Possible** with balance + eyes chips and a banner asking for a face or arm check; Card C (hypoglycemia look-alike) stays at **Possible** or lower and the look-alike panel shows `low blood sugar — answered: {the diabetes fact's value}` (its question is already answered by the caller's first sentence) | — |
| 10 | `pnpm --filter @lastwell/eval eval --mode text` prints a results table with sensitivity, precision, seconds-to-first-flag, LKW accuracy, blood-thinner accuracy and dropped-quote count for LastWell and the keyword baseline | — |

## Honest limits we state on the slide and in the Devpost

- Scripted calls, recorded by us, not real 911 audio. Our numbers will look better than reality; the Copenhagen study (63.0% recall / 24.9% precision for the AI vs 52.7% / 17.1% for call handlers) is the reference for a real-world number.
- The dispatcher approves every alert. Pre-alerts are labeled as dispatcher pre-alerts until EMS confirms.
- Time-savings estimate (7–23 minutes earlier than a scene pre-alert) is derived from national EMS chest-pain medians; stroke-specific numbers are on our list to verify.

## Glossary

| Term | Meaning |
| --- | --- |
| BE-FAST | Stroke sign mnemonic: Balance, Eyes, Face, Arms, Speech, Time |
| LKW | Last known well — the last time the patient was seen completely normal; the tPA 4.5 h window counts from here |
| Chameleon | A stroke that presents atypically (dizziness, confusion, "he sounds drunk") |
| Look-alike (mimic) | A non-stroke condition that presents like a stroke (hypoglycemia, seizure, intoxication, migraine, Bell's palsy) |
| Fast pass | Claude Haiku 5.5 extraction run on each caller utterance |
| Reasoner | Claude Sonnet 5.5 pass over the whole transcript, every ~10 s or on a new sign |
| Pre-alert | The dispatcher-approved notification to the stroke team (call + board card) |
| Level | `none` / `possible` / `likely` — never "not a stroke" |
| Gateway | Our Node service that talks to Twilio, Cartesia, Claude and Convex |
| Console | Dispatcher web page; Board = stroke-team web page |

## Key numbers to keep straight (sources are in the project brief, `docs/brief/LastWell_Project_Brief.pdf`, §14)

- Copenhagen: human call handlers recognized 52.7% of strokes; the AI model 63.0% (precision 24.9%); strokes ≈ 4 per 1,000 calls.
- US registry (371,988 patients): paramedic pre-notification reached the hospital for 67.0% of EMS-transported stroke patients.
- EMS survey (n = 301): 39.5% named information lost in dispatch as a barrier; 11.0% knew the 4.5 h window is measured from LKW.
- National EMS chest-pain medians: response 7 min, on-scene 16 min, transport 13 min.
