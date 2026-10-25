# Blockers for humans (aggregate)

Integration copies open blockers from the four lane files here at each merge, newest first, so humans have one place to look. Answer by editing the relevant doc or `.env`, then tick the line in the lane file.


## Shift note (integration, 2026-10-24 ~18:20 PT)
- Answered: Twilio number + webhook (phone path primary again, D-43 updated); PR #1 merged to main as a checkpoint (d341ae5).
- Still open: the live gates (real calls: M-01…M-04) now that the number exists; Card A recording (V-02 spike); card print; W-11 look approval; D-40 prompt landing by reasoning.
- Watch: the first real call through the gateway on the Mac; keep docs/08 §0 ready as the fallback.

## Open (newest first)

- [ ] voice + humans · M-01…M-04 · Run the live gates on the phone path now: call the number from an unverified phone (dispatcher answers), read Card A, approve to ALERT_DEFAULT_TARGET_PHONE. Real calls only to ALERT_ALLOWED_NUMBERS.

- [x] humans · Twilio number (D-43) · **Done 2026-10-24 ~18:20 PT:** a number exists on the .env account, webhook set to `{PUBLIC_BASE_URL}/twilio/voice` and verified; phone path (docs/08 §3) is primary again, §0 is the fallback. ~~The upgraded Twilio account owns no number; buying one is blocked by Trust Hub verification (pending, may take days); the +1 737 number belongs to another account being located. Meanwhile the demo is phone-free (docs/08 §0: browser mic + briefing from the laptop speaker, `ALERT_DELIVERY=local`). When a number exists: set `TWILIO_PHONE_NUMBER`, its voice webhook → `{PUBLIC_BASE_URL}/twilio/voice`, start ngrok, `ALERT_DELIVERY=phone`, and switch back to docs/08 §3. Live gates M-01/M-02 wait on this.~~

- [x] humans · S-04 · Done (webhook set and verified, 2026-10-24 ~18:20 PT). ~~After Voice lands V-01: start `ngrok http 8787 --domain $NGROK_DOMAIN` on the gateway Mac and set the Twilio number's voice webhook to `{PUBLIC_BASE_URL}/twilio/voice`.~~

- [ ] voice · V-02 · Record a ~20 s 16 kHz mono WAV of someone reading Card A's caller lines → `apps/eval/audio/A01.wav` (gitignored; `ffmpeg -i in.m4a -ar 16000 -ac 1 -sample_fmt s16 A01.wav`) for the live Ink 2 spike; also needs the Cartesia key.
- [x] reasoning · R-06 · **Approved by BM (D-42)**, `reasoner-2` landed eb5e836: B01 now asks for the face check. ~~Reasoner prompt: on B01 it asks for an exact LKW clock time or a speech check instead of the face/arm check. Proposed docs/04 §3 wording (`reasoner-2`) in docs/status/reasoning.md. → approve/reject by editing docs/04.~~
- [ ] screens · W-11 · Presenter: approve the console/board look from 2 m (screenshots in apps/web/screenshots/).
- [x] reasoning · R-03 · **Approved (D-40)**: sex evidence is quoted as a phrase with context, never a bare pronoun; reasoning lands docs/04 §2 + the prompt together. ~~The fast-pass prompt makes the model quote "he" as sex evidence, which the validator drops (< 3 chars). Proposed docs/04 wording change (bump to `fast-2`) is in docs/status/reasoning.md. → approve or reject by editing docs/04 §2.~~

- [ ] integration · C-04 · Print `docs/cards/cards.html` duplex (flip on long edge), seal each back; marker for the LKW blanks (D-20); slide + two timed pitch dry runs. Regenerate with `pnpm cards` if a script changes.

- [x] integration · C-02 · Answered (D-41): B08 → likely; look-alike likely = false positive; A05 aspirin named, never "blood thinner". ~~Clinical glance at the 20 eval scripts (`apps/eval/scripts/*.json`): truth choices B08 (`possible` although face + speech), C02/C03 (signs counted on look-alikes), A05 (aspirin as the blood thinner). Non-blocking; scripts are landed. → edit the JSON or tick in docs/status/integration.md.~~
- [x] all · keys · Done: ~/lw-voice/.env has the Anthropic, Cartesia and Twilio keys, the three phone numbers and CONVEX_URL; LASTWELL_FAKES empty on the gateway Mac. Remaining human step: Twilio webhook + ngrok after V-01 lands. ~~Anthropic, Cartesia and Twilio keys plus `DISPATCHER_PHONE`, `ALERT_DEFAULT_TARGET_PHONE`, `ALERT_ALLOWED_NUMBERS` (docs/10 §9). Every lane builds against fakes meanwhile; live criteria are `blocked-keys`.~~
