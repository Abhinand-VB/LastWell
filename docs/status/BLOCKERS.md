# Blockers for humans (aggregate)

Integration copies open blockers from the four lane files here at each merge, newest first, so humans have one place to look. Answer by editing the relevant doc or `.env`, then tick the line in the lane file.


## Shift note (integration, 2026-10-24 20:25 PT)
- Answered (D-47, BM): D-40 not adopted; append-only signs and pronoun-only sex are documented limits; R24 wake-up clause dropped from the compact guardrails. Reasoning's build work is done (R-03, R-08 done).
- Still open: voice idle 96 min (log evidence for the briefing call, V-10 live); W-11 approval; Card A recording; card print; S-05; inbound test call after 8 AM.
- Watch: nothing P0 is open in code; remaining risk is the live inbound call tomorrow.

## Open (newest first)

- [ ] **voice · D-49 needs a human yes/no** · Voice implemented Q&A utterance sorting (11eb6ef): fixed goodbye on "thank you", silence on "ok", a fixed reprompt, a fixed self-description, and **three rotating "not mentioned" phrasings**. That relaxes D-10 / docs/00 row 7, which say the unknown answer is *always exactly* "That wasn't mentioned on the call." Q&A ships off (D-32), so nothing on the demo path changes today. → approve (I mark D-49 approved) or reject (voice keeps the sorting but restores the single fixed phrase).
- [ ] **voice → reasoning · core edit to review** · Voice changed `packages/core` (reasoning's lane) in a human-directed LKW fix (007fc26: `lkw/widen.ts` + one line in `state/reducer.ts`): a truncated model phrase ("an hour ago" out of "about half an hour ago") put B01's LKW 30 min early on a live replay. Tests pass; reasoning is asked to review it and to consider a prompt line asking for the whole time expression.

- [x] ~~IDLE · reasoning~~ resumed 20:13 PT; D-40 closed by D-47 (not adopted); lane build work done.
- [ ] **IDLE · screens (maybe done)** · No commit or status since 19:10 (re-checked 21:08 PT: 2 h). Nothing P0/P1 open in the lane: W-11 waits on the presenter's approval (human), W-09 is P2/deferred. → a human can approve W-11 from docs/status/screens/ and apps/web/screenshots/, or give screens a polish list for the judging table.

- [x] ~~IDLE · voice~~ resumed 20:48 PT (LKW widen fix, D-49 Q&A sorting).

- [x] ~~IDLE · screens~~ resumed 19:00 PT (W-12, W-08 live check, W-11).
- [x] ~~IDLE · reasoning~~ resumed 18:55 PT (D-44, E-03 run 2, D-45, fake phrase table).

- [ ] voice + humans · M-01…M-04 · Gate 3 ring observed (~18:30 PT). Full inbound test call (Gates 0–2, Card A) tomorrow morning after 8 AM; no real calls 9 PM–8 AM.

- [x] humans · Twilio number (D-43) · **Done 2026-10-24 ~18:20 PT:** a number exists on the .env account, webhook set to `{PUBLIC_BASE_URL}/twilio/voice` and verified; phone path (docs/08 §3) is primary again, §0 is the fallback. ~~The upgraded Twilio account owns no number; buying one is blocked by Trust Hub verification (pending, may take days); the +1 737 number belongs to another account being located. Meanwhile the demo is phone-free (docs/08 §0: browser mic + briefing from the laptop speaker, `ALERT_DELIVERY=local`). When a number exists: set `TWILIO_PHONE_NUMBER`, its voice webhook → `{PUBLIC_BASE_URL}/twilio/voice`, start ngrok, `ALERT_DELIVERY=phone`, and switch back to docs/08 §3. Live gates M-01/M-02 wait on this.~~

- [x] humans · S-04 · Done (webhook set and verified, 2026-10-24 ~18:20 PT). ~~After Voice lands V-01: start `ngrok http 8787 --domain $NGROK_DOMAIN` on the gateway Mac and set the Twilio number's voice webhook to `{PUBLIC_BASE_URL}/twilio/voice`.~~

- [ ] voice · V-02 · Record a ~20 s 16 kHz mono WAV of someone reading Card A's caller lines → `apps/eval/audio/A01.wav` (gitignored; `ffmpeg -i in.m4a -ar 16000 -ac 1 -sample_fmt s16 A01.wav`) for the live Ink 2 spike; also needs the Cartesia key.
- [x] reasoning · R-06 · **Approved by BM (D-42)**, `reasoner-2` landed eb5e836: B01 now asks for the face check. ~~Reasoner prompt: on B01 it asks for an exact LKW clock time or a speech check instead of the face/arm check. Proposed docs/04 §3 wording (`reasoner-2`) in docs/status/reasoning.md. → approve/reject by editing docs/04.~~
- [ ] screens · W-11 · Presenter: approve the console/board look from 2 m (screenshots in apps/web/screenshots/).
- [x] reasoning · R-03 · **Approved (D-40)**: sex evidence is quoted as a phrase with context, never a bare pronoun; reasoning lands docs/04 §2 + the prompt together. ~~The fast-pass prompt makes the model quote "he" as sex evidence, which the validator drops (< 3 chars). Proposed docs/04 wording change (bump to `fast-2`) is in docs/status/reasoning.md. → approve or reject by editing docs/04 §2.~~

- [ ] integration · C-04 · Print `docs/cards/cards.html` duplex (flip on long edge), seal each back; marker for the LKW blanks (D-20); slide + two timed pitch dry runs. Regenerate with `pnpm cards` if a script changes.

- [x] integration · C-02 · Answered (D-41): B08 → likely; look-alike likely = false positive; A05 aspirin named, never "blood thinner". ~~Clinical glance at the 20 eval scripts (`apps/eval/scripts/*.json`): truth choices B08 (`possible` although face + speech), C02/C03 (signs counted on look-alikes), A05 (aspirin as the blood thinner). Non-blocking; scripts are landed. → edit the JSON or tick in docs/status/integration.md.~~
- [x] all · keys · Done: ~/lw-voice/.env has the Anthropic, Cartesia and Twilio keys, the three phone numbers and CONVEX_URL; LASTWELL_FAKES empty on the gateway Mac. Remaining human step: Twilio webhook + ngrok after V-01 lands. ~~Anthropic, Cartesia and Twilio keys plus `DISPATCHER_PHONE`, `ALERT_DEFAULT_TARGET_PHONE`, `ALERT_ALLOWED_NUMBERS` (docs/10 §9). Every lane builds against fakes meanwhile; live criteria are `blocked-keys`.~~
