# Release: `version1 → main`

Maintained by the integration session (task X-05). A **draft** PR was opened at the P0 milestone (docs/10 §8); it tracks `version1` and is updated by every landing. A human reviews and merges it after the human gates (docs/10 §9); then tag `demo-ready` on the merge commit.

## PR title

LastWell v1: live 911 stroke flagging with quotes, LKW parser, dispatcher-approved Sonic briefing call

## PR body

### What this is

The whole demo path, built during Cal Hacks 13.0 by four parallel lanes landing on `version1`:

- A caller dials the Twilio number and is bridged to the dispatcher. Both tracks are transcribed by Cartesia Ink 2.
- The Haiku 5.5 fast pass and the Sonnet 5.5 reasoner run behind the quote validator and the level guard. The LKW parser computes the clock time in code.
- The dispatcher console approves the alert, the code composes the briefing, Sonic 3.6 voices it, and the outbound call goes to the allowlisted medical professional's phone.
- A stroke-team board, a browser-mic fallback, the replay endpoint, and a scripted eval against a keyword baseline.

### State at the P0 milestone (2026-10-24 ~16:55 PT)

- `pnpm verify` green: scan:secrets clean, typecheck all packages, tests core 216 (+2 live-only skipped), gateway 39, eval 51, web 37, stt 13; 20 eval scripts valid.
- `pnpm e2e`: **23 passed, 0 failed, 0 pending** (also with `E2E_STRICT=1`). Offline black-box run of the gateway with every vendor faked: Card A reaches Likely with quoted chips, the LKW is the card time ±15 min, the banner order is right, the allowlist refuses other numbers (409), and the alert reaches `briefed` and is listed on the board. Card B stays Possible with a face/arm banner; Card C shows "low blood sugar — answered".
- `pnpm e2e:ui`: **4 passed** (Playwright against `pnpm dev:fake`): home, console, board and the empty "No stroke signs heard yet." state. Screenshots: `docs/status/screens/`.
- Scripted eval, live Claude (E-03 run 1, 20 calls): sensitivity @possible 12/12 vs keyword baseline 3/12; precision @likely 6/7; LKW correct 16/16; blood thinner correct 8/8; invented facts 0.

### Not yet verified live (needs people, phones or ngrok)

| What | Command / step once unblocked |
| --- | --- |
| Gate 0/1: real call → transcript (V-01, V-03, V-04) | `ngrok http 8787 --domain $NGROK_DOMAIN`, Twilio webhook → `{PUBLIC_BASE_URL}/twilio/voice`, `pnpm dev:gateway` with `LASTWELL_FAKES=` empty, call from an unverified phone |
| Gate 2: Card A live → Likely ≤ 12 s (V-05) | same setup, read Card A |
| Gate 3: approve → briefing call (V-06, V-07) | Send on the console to `ALERT_DEFAULT_TARGET_PHONE` |
| Ink 2 spike (V-02) | record `apps/eval/audio/A01.wav`, `pnpm --filter @lastwell/stt spike apps/eval/audio/A01.wav` |
| Prompt fixes D-40 (fast pass) and R-06 wording | reasoning lane, docs/04 §6 protocol |

### Deliberately not in v1

- Spoken Q&A on the briefing call. It is built last (D-32) and stays behind `FEATURE_QA_ENABLED=false`.
- Audio-mode eval (D-33).
- SMS (D-03).

### Human checklist before merging (docs/10 §9)

- [ ] Gates 0–3 observed live (rows above)
- [ ] Demo `.env`: `DEMO_MODE=true`, `LASTWELL_FAKES=` empty, no red fakes banner in the gateway log
- [ ] Deck printed (`docs/cards/cards.html`), backs sealed; slide uses the E-03 table with the "20 scripted calls" footnote
- [ ] Ten rehearsals (M-06); backup video recorded
- [ ] Merge this PR, tag `demo-ready`, submit Devpost by 8:00 AM

🤖 Generated with [Claude Code](https://claude.com/claude-code)
