# Blockers for humans (aggregate)

Integration copies open blockers from the four lane files here at each merge, newest first, so humans have one place to look. Answer by editing the relevant doc or `.env`, then tick the line in the lane file.


## Shift note (integration, 2026-10-24 15:55 PT)
- Answered: nothing yet. Landed: X-04, X-00, C-02, C-06, the C-04 deck, the X-02/X-03 harnesses; reasoning landed X-01a, R-03/R-06 code, E-01; screens landed W-01…W-05.
- **Watch: the Voice session has landed nothing and its status file is empty.** The gateway (X-01b, V-01…V-11) is the whole demo path; please check the lw-voice terminal.
- Still open: keys, the R-03 prompt wording, the card print.

## Open (newest first)

- [ ] **voice · session stalled?** · No voice commits on version1 or origin and docs/status/voice.md is still the template at 15:55 PT. X-02 (e2e), X-03 (UI smoke) and the whole demo path wait on X-01b, V-01…V-07, V-11. → look at the lw-voice session; restart it with its prompt from docs/SESSION-PROMPTS.md if it is stuck.
- [ ] reasoning · R-03 · The fast-pass prompt makes the model quote "he" as sex evidence, which the validator drops (< 3 chars). Proposed docs/04 wording change (bump to `fast-2`) is in docs/status/reasoning.md. → approve or reject by editing docs/04 §2.

- [ ] integration · C-04 · Print `docs/cards/cards.html` duplex (flip on long edge), seal each back; marker for the LKW blanks (D-20); slide + two timed pitch dry runs. Regenerate with `pnpm cards` if a script changes.

- [ ] integration · C-02 · Clinical glance at the 20 eval scripts (`apps/eval/scripts/*.json`): truth choices B08 (`possible` although face + speech), C02/C03 (signs counted on look-alikes), A05 (aspirin as the blood thinner). Non-blocking; scripts are landed. → edit the JSON or tick in docs/status/integration.md.
- [ ] all · keys · Anthropic, Cartesia and Twilio keys plus `DISPATCHER_PHONE`, `ALERT_DEFAULT_TARGET_PHONE`, `ALERT_ALLOWED_NUMBERS` (docs/10 §9). Every lane builds against fakes meanwhile; live criteria are `blocked-keys`.
