# Blockers for humans (aggregate)

Integration copies open blockers from the four lane files here at each merge, newest first, so humans have one place to look. Answer by editing the relevant doc or `.env`, then tick the line in the lane file.


## Shift note (integration, 2026-10-25 05:20 PT) — morning order
version1 green all night (verify + e2e 23/0/0 every 20 min); tag `freeze` = c5b7f7b (02:00); no lane commits since. **Devpost closes 9:00 AM; plan everything to finish by 8:00 (check-in).**
1. **Decide the LKW parser gap** ("ten past three" → 10 AM; fix with a test, or leave) — reasoning can land a fix in ~30 min if yes.
2. ~~W-13~~ **done 05:40 PT** (3a9bae7; plus console auto-open c631968, post-freeze by human decision per screens).
3. **Morning tests** on the phone path (after 8 AM is too late for anything but rehearsal; start as early as allowed): a chameleon card (B01/B06), a look-alike card, a Q&A rerun → **Q&A keep or kill** (`FEATURE_QA_ENABLED`).
4. Print the deck (`docs/cards/cards.html`, duplex, seal backs); slide from docs/08 §3 (dev 20 + blind 8 + audio line); Devpost from docs/status/RELEASE.md (Inspiration, What we learned, Path to production, limits); backup video.
5. **Final merge** (D-50): integration runs the green check on the version1 tip, merges `version1 → main` once, tags `demo-ready` — tell integration when the code is final.

## Open (newest first)

- [ ] **humans · two branches diverged (08:57 PT)** · `main` (PR #6 from `version2`, 08:47) is **green** (verify + e2e 23/0/0) and has Benmath123's Convex features (default off) + DEVPOST-GUIDE.md that `version1` does not; `version1` has the 6 newest commits (demo media, status) that `main` does not. **D-number clash:** version2's "proposed D-57" (Convex features) vs the D-57 integration recorded on version1 (console auto-open). D-50 says the gateway runs from `version1`, which lacks the Convex code — fine while its flags are off. After submission: decide which branch is canonical; integration can merge `version1 → main` (6 commits) on a go and renumber one D-57.

- [ ] **humans · check the demo video files before the final merge to main (08:10 PT)** · voice committed `media/lastwell-video/` (644f07b, ~50 MB: two phone takes, a 20 MB console screen recording, voice-over WAVs). Since 06:41 the pre-alert board shows the caller number and phone takes can show caller IDs: **watch them for any real teammate phone number or other personal data.** If something must go, removing it from history needs a history rewrite, which no session may do (docs/10 §3) — a human decides (e.g. leave version1 as is but keep the files out of the public submission, or rewrite). Also consider linking the final video on Devpost instead of the repo copy. The final merge waits on this and on the go.

- [x] voice · D-53 wording · fixed 01:39 PT (exact opening sentence, `notes`). W-13 (screens UI) held until the morning.

- [ ] **humans · LKW parser gap found by the blind set (decision needed)** · The parser has no "N past H" form: "fine at ten past three" → **10:00 AM** shown as a confident time (truth 3:10 PM, script A11); "twenty past twelve" → "yesterday 8:00 PM? · confirm day" (B11). "quarter past" and "half past" work (docs/06 §3 R7). A live caller can say this. The E-05 protocol says no rule change based on the blind set, so: (a) **fix it** (reasoning adds "N past H" / "N to H" to docs/06 §3 R7 with new docs/06 §7 rows and tests; the blind run 1 numbers stay as reported, and the blind set is no longer blind for LKW), or (b) **leave it** and keep the slide line as is. Note: this is a post-freeze bug fix with a test if done after 2 AM.

- [x] humans · feature freeze (M-05) · **Done: tag `freeze` on version1 c5b7f7b at 02:00 PT** (green). Bug fixes only from here, each with a test. Still waiting on a human: W-13 in the morning (D-53 says hold), the LKW parser decision. ~~After it, only bug fixes with tests land (docs/10 §11). Tag `freeze` on version1 then; integration records it. Any exception is a human call.~~

- [ ] **humans + voice · morning tests (after 8 AM, D-52)** · chameleon card (B01 or B06), look-alike card (C01/C02/C04/C05), Q&A rerun with D-49/D-51 → decide Q&A keep or kill (`FEATURE_QA_ENABLED`). Runbook §7.

- [x] ~~IDLE · voice~~ resumed 00:16 PT (E-05 blind run done).


- [x] voice · D-51 · **Approved by Liang (~23:05 PT).** ~~Q&A answers common questions from the validated case state without a model call (0.9 s vs 2.1 s median), a "One moment." filler, and a gate that only lets question-shaped speech reach the answer path. Extends D-10; Q&A ships off. → approve with D-49, or ask voice to revert to model-only answers.~~
- [x] voice · D-49 · **Approved by Liang (~23:05 PT)**, incl. the three rotating phrasings; D-10 and docs/00 row 7 updated. ~~Voice implemented Q&A utterance sorting (11eb6ef): fixed goodbye on "thank you", silence on "ok", a fixed reprompt, a fixed self-description, and **three rotating "not mentioned" phrasings**. That relaxes D-10 / docs/00 row 7, which say the unknown answer is *always exactly* "That wasn't mentioned on the call." Q&A ships off (D-32), so nothing on the demo path changes today. → approve (I mark D-49 approved) or reject (voice keeps the sorting but restores the single fixed phrase).~~
- [ ] **voice → reasoning · core edit to review** · Voice changed `packages/core` (reasoning's lane) in a human-directed LKW fix (007fc26: `lkw/widen.ts` + one line in `state/reducer.ts`): a truncated model phrase ("an hour ago" out of "about half an hour ago") put B01's LKW 30 min early on a live replay. Tests pass; reasoning is asked to review it and to consider a prompt line asking for the whole time expression.

- [x] ~~IDLE · reasoning~~ resumed 20:13 PT; D-40 closed by D-47 (not adopted); lane build work done.

- [x] ~~IDLE · voice~~ resumed 20:48 PT (LKW widen fix, D-49 Q&A sorting).

- [x] ~~IDLE · screens~~ resumed 19:00 PT (W-12, W-08 live check, W-11).
- [x] ~~IDLE · reasoning~~ resumed 18:55 PT (D-44, E-03 run 2, D-45, fake phrase table).

- [x] voice + humans · M-01…M-04 · **Passed: Test 1, ~21:30–22:00 PT (D-52).** ~~Gate 3 ring observed (~18:30 PT). Full inbound test call (Gates 0–2, Card A) tomorrow morning after 8 AM; no real calls 9 PM–8 AM.~~

- [x] humans · Twilio number (D-43) · **Done 2026-10-24 ~18:20 PT:** a number exists on the .env account, webhook set to `{PUBLIC_BASE_URL}/twilio/voice` and verified; phone path (docs/08 §3) is primary again, §0 is the fallback. ~~The upgraded Twilio account owns no number; buying one is blocked by Trust Hub verification (pending, may take days); the +1 737 number belongs to another account being located. Meanwhile the demo is phone-free (docs/08 §0: browser mic + briefing from the laptop speaker, `ALERT_DELIVERY=local`). When a number exists: set `TWILIO_PHONE_NUMBER`, its voice webhook → `{PUBLIC_BASE_URL}/twilio/voice`, start ngrok, `ALERT_DELIVERY=phone`, and switch back to docs/08 §3. Live gates M-01/M-02 wait on this.~~

- [x] humans · S-04 · Done (webhook set and verified, 2026-10-24 ~18:20 PT). ~~After Voice lands V-01: start `ngrok http 8787 --domain $NGROK_DOMAIN` on the gateway Mac and set the Twilio number's voice webhook to `{PUBLIC_BASE_URL}/twilio/voice`.~~

- [x] voice · V-02 · **Closed by Liang (D-52):** superseded by the audio robustness run and the live call. ~~Record a ~20 s 16 kHz mono WAV of someone reading Card A's caller lines → `apps/eval/audio/A01.wav` (gitignored; `ffmpeg -i in.m4a -ar 16000 -ac 1 -sample_fmt s16 A01.wav`) for the live Ink 2 spike; also needs the Cartesia key.~~
- [x] reasoning · R-06 · **Approved by BM (D-42)**, `reasoner-2` landed eb5e836: B01 now asks for the face check. ~~Reasoner prompt: on B01 it asks for an exact LKW clock time or a speech check instead of the face/arm check. Proposed docs/04 §3 wording (`reasoner-2`) in docs/status/reasoning.md. → approve/reject by editing docs/04.~~
- [x] screens · W-11 · Polish landed (10c46e5, D-54…D-56) → approved per Liang. ~~Liang sends screens a polish list; approved once it lands. ~~Presenter: approve the console/board look from 2 m (screenshots in apps/web/screenshots/).~~~~
- [x] reasoning · R-03 · **Approved (D-40)**: sex evidence is quoted as a phrase with context, never a bare pronoun; reasoning lands docs/04 §2 + the prompt together. ~~The fast-pass prompt makes the model quote "he" as sex evidence, which the validator drops (< 3 chars). Proposed docs/04 wording change (bump to `fast-2`) is in docs/status/reasoning.md. → approve or reject by editing docs/04 §2.~~

- [ ] integration · C-04 · Print `docs/cards/cards.html` duplex (flip on long edge), seal each back; marker for the LKW blanks (D-20); slide + two timed pitch dry runs. Regenerate with `pnpm cards` if a script changes.

- [x] integration · C-02 · Answered (D-41): B08 → likely; look-alike likely = false positive; A05 aspirin named, never "blood thinner". ~~Clinical glance at the 20 eval scripts (`apps/eval/scripts/*.json`): truth choices B08 (`possible` although face + speech), C02/C03 (signs counted on look-alikes), A05 (aspirin as the blood thinner). Non-blocking; scripts are landed. → edit the JSON or tick in docs/status/integration.md.~~
- [x] all · keys · Done: ~/lw-voice/.env has the Anthropic, Cartesia and Twilio keys, the three phone numbers and CONVEX_URL; LASTWELL_FAKES empty on the gateway Mac. Remaining human step: Twilio webhook + ngrok after V-01 lands. ~~Anthropic, Cartesia and Twilio keys plus `DISPATCHER_PHONE`, `ALERT_DEFAULT_TARGET_PHONE`, `ALERT_ALLOWED_NUMBERS` (docs/10 §9). Every lane builds against fakes meanwhile; live criteria are `blocked-keys`.~~
