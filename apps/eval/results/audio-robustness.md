# Audio robustness

Ran 2026-10-25T04:09:32.200Z. Pipeline: claude-haiku-5-5 + claude-sonnet-5-5 @medium. Caller lines generated with Sonic (phone audio, µ-law 8 kHz) and transcribed by Ink 2 on two tracks, profile `call`, as on a live call; `text` is the same scripts in text mode (no speech step). Scored exactly like text mode. Voices: dispatcher, calm and panicked use db6b0ed5-d5d3-463d-ae85-518a07d3c2b4 (calm: emotion calm, speed 1; panicked: emotion panicked, speed 1.3); accent uses "Aarav" 39d518b7-fd0b-4676-9b8b-29d64ff31e12 (Warm adult male voice with a slight Indian accent and a vintage tone for nostalgic storytelling, retro-style media, and ). Generated audio this run: 7.4 min (cached lines are reused).

Cell: highest level reached @ seconds to first flag · LKW correct · blood thinner correct (— = not in the script) · invented facts (shown only when > 0).

Seconds to first flag are on each call's own clock: audio calls run longer than the script's spacing (real speech durations, lines never overlap) and include Ink's end-of-turn delay, so compare them across the three voices, not against `text`.

| Script | text | calm | accent | panicked |
| --- | --- | --- | --- | --- |
| A01 | likely @11s · LKW ✓ · BT ✓ | likely @19s · LKW ✓ · BT ✓ | likely @17s · LKW ✓ · BT ✓ | likely @18s · LKW ✓ · BT ✓ |
| A03 | possible @12s · LKW ✓ · BT ✓ | possible @18s · LKW ✓ · BT ✓ | likely @17s · LKW ✓ · BT ✓ | possible @18s · LKW ✓ · BT ✓ |
| B01 | possible @3s · LKW ✓ · BT ✓ | possible @14s · LKW ✓ · BT ✓ | possible @12s · LKW ✓ · BT ✓ | possible @12s · LKW ✓ · BT ✓ |
| B02 | possible @11s · LKW ✓ · BT — | possible @17s · LKW ✓ · BT — | possible @16s · LKW ✓ · BT — | possible @16s · LKW ✓ · BT — |
| C01 | possible @17s · LKW ✓ · BT — | possible @21s · LKW ✓ · BT — | possible @21s · LKW ✓ · BT — | possible @21s · LKW ✓ · BT — |
| C03 | possible @12s · LKW ✓ · BT — | possible @18s · LKW ✓ · BT — | possible @17s · LKW ✓ · BT — | possible @18s · LKW ✓ · BT — |

- **text**: strokes flagged 4/4 (likely 1/4), median first flag 11 s, LKW 6/6, blood thinner 3/3, invented facts 0, level agreement 5/6.
- **calm**: strokes flagged 4/4 (likely 1/4), median first flag 18 s, LKW 6/6, blood thinner 3/3, invented facts 0, level agreement 5/6.
- **accent**: strokes flagged 4/4 (likely 2/4), median first flag 17 s, LKW 6/6, blood thinner 3/3, invented facts 0, level agreement 6/6.
- **panicked**: strokes flagged 4/4 (likely 1/4), median first flag 17 s, LKW 6/6, blood thinner 3/3, invented facts 0, level agreement 5/6.

Caveat for the slide: every voice here is Sonic-generated speech, which is cleaner than a real 911 caller (no line noise, no crosstalk, no crying). Ink's transcripts were near-verbatim in every variant (A01 calm heard "apartment 2" for "apartment 3"; B01 heard "Uloa" for "Ulloa"), so this shows the pipeline holds up across delivery styles, not real-world accuracy. The "accent" voice is Cartesia's "Aarav" (a slight Indian accent). Reproduce: `pnpm --filter @lastwell/eval audio:robustness` (cached lines cost nothing; `--plan` shows the voices without generating).
