# Blockers for humans (aggregate)

Integration copies open blockers from the four lane files here at each merge, newest first, so humans have one place to look. Answer by editing the relevant doc or `.env`, then tick the line in the lane file.


## Shift note (integration, 2026-10-24 16:20 PT)
- Answered: nothing yet. Voice is alive again (V-02 landed 4cafd7c); the gateway (X-01b, V-01, V-03…V-07, V-11) is still the critical path.
- Landed since last note: R-10, E-03 run 1 (numbers now in README + docs/08), W-06…W-11, V-02 offline.
- Watch: the R-03 and R-06 prompt-wording decisions, the Card A recording for V-02, keys.

## Open (newest first)

- [x] ~~voice · session stalled?~~ It landed V-02 (4cafd7c) at ~16:15 PT.
- [ ] voice · V-02 · Record a ~20 s 16 kHz mono WAV of someone reading Card A's caller lines → `apps/eval/audio/A01.wav` (gitignored; `ffmpeg -i in.m4a -ar 16000 -ac 1 -sample_fmt s16 A01.wav`) for the live Ink 2 spike; also needs the Cartesia key.
- [ ] reasoning · R-06 · Reasoner prompt: on B01 it asks for an exact LKW clock time or a speech check instead of the face/arm check. Proposed docs/04 §3 wording (`reasoner-2`) in docs/status/reasoning.md. → approve/reject by editing docs/04.
- [ ] screens · W-11 · Presenter: approve the console/board look from 2 m (screenshots in apps/web/screenshots/).
- [ ] reasoning · R-03 · The fast-pass prompt makes the model quote "he" as sex evidence, which the validator drops (< 3 chars). Proposed docs/04 wording change (bump to `fast-2`) is in docs/status/reasoning.md. → approve or reject by editing docs/04 §2.

- [ ] integration · C-04 · Print `docs/cards/cards.html` duplex (flip on long edge), seal each back; marker for the LKW blanks (D-20); slide + two timed pitch dry runs. Regenerate with `pnpm cards` if a script changes.

- [ ] integration · C-02 · Clinical glance at the 20 eval scripts (`apps/eval/scripts/*.json`): truth choices B08 (`possible` although face + speech), C02/C03 (signs counted on look-alikes), A05 (aspirin as the blood thinner). Non-blocking; scripts are landed. → edit the JSON or tick in docs/status/integration.md.
- [ ] all · keys · Anthropic, Cartesia and Twilio keys plus `DISPATCHER_PHONE`, `ALERT_DEFAULT_TARGET_PHONE`, `ALERT_ALLOWED_NUMBERS` (docs/10 §9). Every lane builds against fakes meanwhile; live criteria are `blocked-keys`.
