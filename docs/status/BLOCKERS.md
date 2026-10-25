# Blockers for humans (aggregate)

Integration copies open blockers from the four lane files here at each merge, newest first, so humans have one place to look. Answer by editing the relevant doc or `.env`, then tick the line in the lane file.


## Shift note (integration, 2026-10-24 ~23:10 PT)
- Answered (Liang): D-49 and D-51 approved; live Test 1 passed (M-01…M-04, D-52); Q&A on for the demo; Sonic voice frozen; Card A recording closed.
- Morning (after 8 AM): chameleon card, look-alike card, Q&A rerun with D-49/D-51 → Q&A keep/kill. Still open: W-11 polish list → screens; card print; E-05 blind run (voice).
- Watch: voice idle since 22:03 (E-05 waits on it).

## Open (newest first)

- [ ] **humans · LKW parser gap found by the blind set (decision needed)** · The parser has no "N past H" form: "fine at ten past three" → **10:00 AM** shown as a confident time (truth 3:10 PM, script A11); "twenty past twelve" → "yesterday 8:00 PM? · confirm day" (B11). "quarter past" and "half past" work (docs/06 §3 R7). A live caller can say this. The E-05 protocol says no rule change based on the blind set, so: (a) **fix it** (reasoning adds "N past H" / "N to H" to docs/06 §3 R7 with new docs/06 §7 rows and tests; the blind run 1 numbers stay as reported, and the blind set is no longer blind for LKW), or (b) **leave it** and keep the slide line as is. Note: this is a post-freeze bug fix with a test if done after 2 AM.

- [ ] **humans · feature freeze at 2:00 AM PT (M-05)** · After it, only bug fixes with tests land (docs/10 §11). Tag `freeze` on version1 then; integration records it. Any exception is a human call.

- [ ] **humans + voice · morning tests (after 8 AM, D-52)** · chameleon card (B01 or B06), look-alike card (C01/C02/C04/C05), Q&A rerun with D-49/D-51 → decide Q&A keep or kill (`FEATURE_QA_ENABLED`). Runbook §7.

- [x] ~~IDLE · voice~~ resumed 00:16 PT (E-05 blind run done).

- [ ] **IDLE · reasoning** · No commit or status since 20:22 PT (re-checked 00:51 PT: 4 h 29). Build work is done; open: review voice's core LKW edit (007fc26, `lkw/widen.ts` + reducer line) and a prompt line asking for the whole time expression (test:live within §7.4). → nudge lw-reasoning to post the review.

- [x] voice · D-51 · **Approved by Liang (~23:05 PT).** ~~Q&A answers common questions from the validated case state without a model call (0.9 s vs 2.1 s median), a "One moment." filler, and a gate that only lets question-shaped speech reach the answer path. Extends D-10; Q&A ships off. → approve with D-49, or ask voice to revert to model-only answers.~~
- [x] voice · D-49 · **Approved by Liang (~23:05 PT)**, incl. the three rotating phrasings; D-10 and docs/00 row 7 updated. ~~Voice implemented Q&A utterance sorting (11eb6ef): fixed goodbye on "thank you", silence on "ok", a fixed reprompt, a fixed self-description, and **three rotating "not mentioned" phrasings**. That relaxes D-10 / docs/00 row 7, which say the unknown answer is *always exactly* "That wasn't mentioned on the call." Q&A ships off (D-32), so nothing on the demo path changes today. → approve (I mark D-49 approved) or reject (voice keeps the sorting but restores the single fixed phrase).~~
- [ ] **voice → reasoning · core edit to review** · Voice changed `packages/core` (reasoning's lane) in a human-directed LKW fix (007fc26: `lkw/widen.ts` + one line in `state/reducer.ts`): a truncated model phrase ("an hour ago" out of "about half an hour ago") put B01's LKW 30 min early on a live replay. Tests pass; reasoning is asked to review it and to consider a prompt line asking for the whole time expression.

- [x] ~~IDLE · reasoning~~ resumed 20:13 PT; D-40 closed by D-47 (not adopted); lane build work done.
- [ ] **IDLE · screens (maybe done)** · No commit or status since 19:10 (re-checked 00:51 PT: 5 h 41). Nothing P0/P1 open in the lane: W-11 waits on the presenter's approval (human), W-09 is P2/deferred. → a human can approve W-11 from docs/status/screens/ and apps/web/screenshots/, or give screens a polish list for the judging table.

- [x] ~~IDLE · voice~~ resumed 20:48 PT (LKW widen fix, D-49 Q&A sorting).

- [x] ~~IDLE · screens~~ resumed 19:00 PT (W-12, W-08 live check, W-11).
- [x] ~~IDLE · reasoning~~ resumed 18:55 PT (D-44, E-03 run 2, D-45, fake phrase table).

- [x] voice + humans · M-01…M-04 · **Passed: Test 1, ~21:30–22:00 PT (D-52).** ~~Gate 3 ring observed (~18:30 PT). Full inbound test call (Gates 0–2, Card A) tomorrow morning after 8 AM; no real calls 9 PM–8 AM.~~

- [x] humans · Twilio number (D-43) · **Done 2026-10-24 ~18:20 PT:** a number exists on the .env account, webhook set to `{PUBLIC_BASE_URL}/twilio/voice` and verified; phone path (docs/08 §3) is primary again, §0 is the fallback. ~~The upgraded Twilio account owns no number; buying one is blocked by Trust Hub verification (pending, may take days); the +1 737 number belongs to another account being located. Meanwhile the demo is phone-free (docs/08 §0: browser mic + briefing from the laptop speaker, `ALERT_DELIVERY=local`). When a number exists: set `TWILIO_PHONE_NUMBER`, its voice webhook → `{PUBLIC_BASE_URL}/twilio/voice`, start ngrok, `ALERT_DELIVERY=phone`, and switch back to docs/08 §3. Live gates M-01/M-02 wait on this.~~

- [x] humans · S-04 · Done (webhook set and verified, 2026-10-24 ~18:20 PT). ~~After Voice lands V-01: start `ngrok http 8787 --domain $NGROK_DOMAIN` on the gateway Mac and set the Twilio number's voice webhook to `{PUBLIC_BASE_URL}/twilio/voice`.~~

- [x] voice · V-02 · **Closed by Liang (D-52):** superseded by the audio robustness run and the live call. ~~Record a ~20 s 16 kHz mono WAV of someone reading Card A's caller lines → `apps/eval/audio/A01.wav` (gitignored; `ffmpeg -i in.m4a -ar 16000 -ac 1 -sample_fmt s16 A01.wav`) for the live Ink 2 spike; also needs the Cartesia key.~~
- [x] reasoning · R-06 · **Approved by BM (D-42)**, `reasoner-2` landed eb5e836: B01 now asks for the face check. ~~Reasoner prompt: on B01 it asks for an exact LKW clock time or a speech check instead of the face/arm check. Proposed docs/04 §3 wording (`reasoner-2`) in docs/status/reasoning.md. → approve/reject by editing docs/04.~~
- [ ] screens · W-11 · Liang sends screens a polish list; approved once it lands. ~~Presenter: approve the console/board look from 2 m (screenshots in apps/web/screenshots/).~~
- [x] reasoning · R-03 · **Approved (D-40)**: sex evidence is quoted as a phrase with context, never a bare pronoun; reasoning lands docs/04 §2 + the prompt together. ~~The fast-pass prompt makes the model quote "he" as sex evidence, which the validator drops (< 3 chars). Proposed docs/04 wording change (bump to `fast-2`) is in docs/status/reasoning.md. → approve or reject by editing docs/04 §2.~~

- [ ] integration · C-04 · Print `docs/cards/cards.html` duplex (flip on long edge), seal each back; marker for the LKW blanks (D-20); slide + two timed pitch dry runs. Regenerate with `pnpm cards` if a script changes.

- [x] integration · C-02 · Answered (D-41): B08 → likely; look-alike likely = false positive; A05 aspirin named, never "blood thinner". ~~Clinical glance at the 20 eval scripts (`apps/eval/scripts/*.json`): truth choices B08 (`possible` although face + speech), C02/C03 (signs counted on look-alikes), A05 (aspirin as the blood thinner). Non-blocking; scripts are landed. → edit the JSON or tick in docs/status/integration.md.~~
- [x] all · keys · Done: ~/lw-voice/.env has the Anthropic, Cartesia and Twilio keys, the three phone numbers and CONVEX_URL; LASTWELL_FAKES empty on the gateway Mac. Remaining human step: Twilio webhook + ngrok after V-01 lands. ~~Anthropic, Cartesia and Twilio keys plus `DISPATCHER_PHONE`, `ALERT_DEFAULT_TARGET_PHONE`, `ALERT_ALLOWED_NUMBERS` (docs/10 §9). Every lane builds against fakes meanwhile; live criteria are `blocked-keys`.~~
