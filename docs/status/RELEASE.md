# Release: `version1 → main`

Maintained by the integration session (task X-05).

- **Checkpoint merge:** PR #1 (https://github.com/Abhinand-VB/LastWell/pull/1) was merged into `main` on 2026-10-24 at ~18:10 PT by human decision, as merge commit d341ae5 (version1 at 830e196: `pnpm verify` green, `pnpm e2e` 23/0/0). It is **not** tagged `demo-ready`: the live gates have not run (no Twilio number, D-43).
- **Sync merges (D-48, ended by D-50):** PRs #2–#5 synced `main` to a green `version1`; the last was #5 (dcc4d93, 21:20 PT). Since D-50 everything runs from `version1` and `main` is not touched until the end.
- **Final release (D-50):** one PR `version1 → main` at the end, after the final green check on the tip, merged with a regular merge, then tagged `demo-ready`. The title and body below are reused for it.

## Devpost draft (C-05; humans finalize)

**Inspiration.** An EMT we spoke with was intrigued by the idea of catching strokes that nobody on the call recognizes and getting the stroke team alerted early. They were also skeptical: classic strokes are usually obvious, and public education may matter more.

**What we learned.** That skepticism changed our focus. A clear-cut stroke usually gets recognized; the ones that slip through are strokes that don't look like strokes: dizziness and double vision, "he sounds drunk", "maybe it's her glasses". We put those chameleons first: in our scripted set LastWell flagged all 5 (a keyword alert caught 1), and the demo opens with one.

**Path to production (Microsoft "Built for the Real World").** Three stages, each with numbers set in advance and a stop-or-go. (1) **Retrospective:** run on a 911 center's archived calls matched to stroke-registry outcomes, as the Copenhagen and Bergen studies did; measure sensitivity, precision, seconds to flag, LKW accuracy and invented facts, broken down by caller group. (2) **Shadow mode:** live, with dispatchers seeing nothing, flags compared afterwards. (3) **Supervised pilot:** one 911 center and one stroke center, the dispatcher approves every pre-alert; adds door-to-CT time. Already built: a per-call audit trail, dispatcher approval on every alert, quote-or-drop (0 invented facts so far), a first audio robustness check with synthetic voices. Open: regulatory review, 911 security requirements, performance on real audio. Full text in the README.

**Honest limits to keep in the submission.** Scripted calls written by us; the clinical truth labels for A05 (aspirin case) and B08 (migraine-history case) were not reviewed by a clinician; the EMT interview did not cover last-known-well reliability or antiplatelets.

## PR title

LastWell v1: live 911 stroke flagging with quotes, LKW parser, dispatcher-approved Sonic briefing call

## PR body

### What this is

The whole demo path, built during Cal Hacks 13.0 by four parallel lanes landing on `version1`:

- A caller dials the Twilio number and is bridged to the dispatcher. Both tracks are transcribed by Cartesia Ink 2.
- The Haiku 5.5 fast pass and the Sonnet 5.5 reasoner run behind the quote validator and the level guard. The LKW parser computes the clock time in code.
- The dispatcher console approves the alert, the code composes the briefing, Sonic 3.6 voices it, and the outbound call goes to the allowlisted medical professional's phone.
- A stroke-team board, a browser-mic fallback, the replay endpoint, and a scripted eval against a keyword baseline.

### State for the final merge (2026-10-25 07:12 PT, version1 7d3c12e)

- `pnpm verify` green: scan:secrets clean (399 tracked files + history); typecheck all packages; tests core 234 (+3 live-only skipped), gateway 143, eval 58, web 57, stt 14; eval scripts valid: 20 development + 8 blind.
- `pnpm e2e`: **23 passed, 0 failed, 0 pending** (strict). Offline black-box run of the gateway with every vendor faked: Card A reaches Likely with quoted chips, LKW = card time ±15 min, banner order, allowlist 409, alert reaches `briefed`, board lists it; Card B stays Possible with a face/arm banner; Card C shows "low blood sugar — answered".
- `pnpm e2e:ui`: **5 passed** (strict, Playwright against `pnpm dev:fake`): home, console (A01), board, Send → Play briefing → completed, the empty "No stroke signs heard yet." state.
- **Live (D-52):** Test 1 passed on real phones, 2026-10-24 ~21:30–22:00 PT (inbound call → Likely with quotes → LKW + Eliquis → Send → briefing call → Q&A with an interruption).
- **Eval, live Claude:** 20 development scripts (E-03 run 2 + two consistency runs, identical per script): strokes flagged 12/12 vs keyword 3/12, precision @likely 7/7, LKW 16/16, blood thinner 8/8, invented 0, level agreement 20/20. 8 blind scripts (E-05, run once): strokes 4/4 vs keyword 3/4, level 8/8, invented 0, LKW 3/6 (parser gap on "ten past three"). Audio robustness (synthetic voices through Ink 2): strokes 4/4, LKW 6/6, invented 0 in every voice.
- **Tags:** `freeze` = c5b7f7b (02:00 PT). Post-freeze changes by human decision: W-13 (D-53), console auto-open (D-57), allowed-number picker (D-58), board/home polish (W-11 list).

### No Twilio number yet (D-43)

The account owns no number (Trust Hub pending). The primary demo is phone-free: browser mic in, briefing played from the laptop speaker (`ALERT_DELIVERY=local`, tasks V-12/W-12, docs/08 §0). The phone path stays intact behind its flags.

### Live gates (D-52)

Test 1 passed on real phones, 2026-10-24 ~21:30–22:00 PT: inbound call → transcript → Likely with quotes → LKW + Eliquis → Send pre-alert → briefing call rang the medical phone → Q&A answered and handled an interruption (M-01…M-04). Morning tests: chameleon, look-alike, Q&A rerun.

### Originally not verified live (now covered by Test 1 except where noted)

| What | Command / step once unblocked |
| --- | --- |
| Gate 0/1: real call → transcript (V-01, V-03, V-04) | `ngrok http 8787 --domain $NGROK_DOMAIN`, Twilio webhook → `{PUBLIC_BASE_URL}/twilio/voice`, `pnpm dev:gateway` with `LASTWELL_FAKES=` empty, call from an unverified phone |
| Gate 2: Card A live → Likely ≤ 12 s (V-05) | same setup, read Card A |
| Gate 3: approve → briefing call (V-06, V-07) | Send on the console to `ALERT_DEFAULT_TARGET_PHONE` |
| Ink 2 spike (V-02) | record `apps/eval/audio/A01.wav`, `pnpm --filter @lastwell/stt spike apps/eval/audio/A01.wav` |
| Prompt fixes D-40 (fast pass) and R-06 wording | reasoning lane, docs/04 §6 protocol |

### Deliberately not in v1

- Spoken Q&A on the briefing call (V-08, D-49, D-51) is on for the demo (D-52) after the live Test 1; off by default in code; keep/kill after the morning rehearsals.
- Audio-mode eval (D-33).
- SMS (D-03).

### Human checklist before merging (docs/10 §9)

- [ ] Gates 0–3 observed live (rows above)
- [ ] Demo `.env`: `DEMO_MODE=true`, `LASTWELL_FAKES=` empty, no red fakes banner in the gateway log
- [ ] Deck printed (`docs/cards/cards.html`), backs sealed; slide uses the E-03 table with the "20 scripted calls" footnote
- [ ] Ten rehearsals (M-06); backup video recorded
- [ ] Merge this PR, tag `demo-ready`, submit Devpost by 8:00 AM

🤖 Generated with [Claude Code](https://claude.com/claude-code)
