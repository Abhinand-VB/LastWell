# 06 — Last-known-well parser

Owner: Reasoning lane. Files: `packages/core/src/lkw/{parser,grammar,format}.ts`, `parser.test.ts`. Pure function, no I/O, no model. Input/output contract: docs/03 §10.

The model's only job is to hand over the caller's time phrase verbatim (`last_known_well.phrase`, already quote-validated). This parser turns it into a clock time, a range and a confidence, using the absolute time the phrase was spoken (`saidAt` = `call.streamStartedAt + utterance.tStartMs`) and the call's IANA timezone. Vague phrases stay ranges. Unparseable phrases stay unknown and keep the "ask when last seen normal" prompt alive.

## 1. Signature

```ts
export function parseLkw(input: { phrase: string; saidAt: string; timezone: string }): LkwParseOutput
// LkwParseOutput = { phrase, lkwAt, rangeStart, rangeEnd, confidence, note, display }
```

Use `luxon` (`DateTime.fromISO(saidAt, {setZone: true}).setZone(timezone)`). All arithmetic in the call's zone; outputs ISO with offset. The function is total: any string yields a result, never a throw.

## 2. Normalization

1. Lowercase; NFKC; replace `’` with `'`; collapse whitespace.
2. Strip filler: `um, uh, like, I think, maybe, probably, I guess, I'd say`. Record `approx = true` if any of `about, around, approximately, roughly, ish, -ish, maybe, probably, like, or so, something like, I think, I guess` appeared.
3. Number words → digits for 1–12, 15, 20, 30, 40, 45, 50 and compounds ("two thirty" → "2 30", "twenty minutes" → "20 minutes", "an hour" → "1 hour", "half an hour" → "30 minutes", "an hour and a half" → "90 minutes", "a couple of" → "2 (couple)", "a few" → "3 (few)", "several" → "4 (several)").
4. `a.m./p.m.` → `am/pm`. Keep `o'clock`, `noon`, `midnight`, `quarter past`, `half past`, `quarter to` as words (they mark **spoken** clock forms, see R7). 24-hour forms `14:30`/`1430` are accepted as numeric.

## 3. Grammar (first matching rule wins; rules are tried in this order)

Precedence when one phrase contains several time expressions: **clock time > relative time > meal/day anchor**. Scan for all three, take the highest class, then apply that class's rule to its expression.

| # | Pattern (after normalization) | Point | Range | Confidence |
| --- | --- | --- | --- | --- |
| R1 | `just now`, `right now`, `a minute ago`, `seconds ago` | saidAt − 2 min | saidAt − 5 min … saidAt | approx |
| R2 | `N minute(s) ago`, `N hour(s) ago`, `N hour(s) and M minute(s) ago`, `half an hour ago` | saidAt − N | ± tol(N) where bare: max(3, 10 % of N); approx: max(10, 25 % of N) | approx |
| R2b | `2 (couple) minutes ago` → N = 3 min, range 1…5; `3 (few) minutes ago` → N = 5, range 2…10; `4 (several) minutes ago` → N = 10, range 5…20 | as listed | as listed | approx |
| R3 | `2 (couple) hours ago` | saidAt − 120 | saidAt − 150 … saidAt − 90 | vague |
| R4 | `3 (few) hours ago` | saidAt − 180 | saidAt − 300 … saidAt − 120 | vague |
| R5 | `4 (several) hours ago` | saidAt − 240 | saidAt − 360 … saidAt − 180 | vague |
| R6 | `an hour or two ago`, `one or two hours ago` | saidAt − 90 | saidAt − 120 … saidAt − 60 | vague |
| R7 | clock: `(at\|around\|about\|since)? H(:MM)? (am\|pm)?`, `H o'clock`, `noon`, `midnight`, `quarter past H`, `half past H`, `quarter to H`, `H thirty`, `H 30` | resolved clock time (§4) | **numeric with minutes** (`2:10`, `14:30`) and no approx → ±0 (exact); any **spoken** form or bare hour (`at 2`, `2 o'clock`, `noon`, `half past one`, `two thirty`) and no approx → ±10; approx → ±15; `a little after / just after / shortly after H` → H … H+20 (point H+10); `just before / a little before H` → H−15 … H (point H−7) | exact / approx |
| R8 | `since lunch`, `at lunch`, `lunchtime` | 12:30 | 12:00 … 13:30 | vague |
| R8b | `after lunch`, `sometime after lunch` | midpoint of the range | 13:00 … min(14:00, saidAt) | vague |
| R9 | `breakfast` | 08:00 | 07:00 … 09:00 | vague |
| R10 | `dinner`, `supper` | 18:30 | 17:30 … 19:30 | vague (previous day if 17:30 > saidAt) |
| R11 | symptoms present on waking: `woke up (with\|like) (this\|it)`, `woke up and (couldn't\|was)`, `when (he\|she) woke up (he\|she) (was\|couldn't\|had)`, `since this morning` | previous day 22:00 | previous day 20:00 … 23:59 | vague |
| R12 | normal on waking / morning (tried after R11): `this morning`, `fine this morning`, `when (he\|she) woke up`, `when (he\|she) got up`, `fine when (he\|she) woke up` | 09:00 (woke/got up: 07:00) | 06:00 … min(12:00, saidAt) (woke/got up: 06:00 … 09:00) | vague |
| R13 | `this afternoon` | midpoint of the range | 12:00 … min(17:00, saidAt) | vague |
| R14 | `this evening`, `tonight` | midpoint of the range | 17:00 … min(21:00, saidAt); if 17:00 > saidAt → unknown | vague |
| R15 | `last night`, `before (he\|she) went to bed`, `at bedtime`, `when (he\|she) went to bed` (no clock) | previous day 22:00 | previous day 20:00 … 23:59 | vague |
| R16 | `yesterday` (+ optional `morning/afternoon/evening`, or a clock) | yesterday + sub-rule (clock via R7 on the previous day; morning 09:00 / afternoon 14:30 / evening 19:00; bare yesterday 12:00) | sub-rule range (bare: 08:00 … 22:00) | vague (clock → approx) |
| R17 | `a while ago`, `earlier`, `earlier today` | unknown | — | unknown |
| R18 | anything else (`I don't know`, `Tuesday`, `when I left for work`) | unknown | — | unknown |

`tol(N)` is in minutes. "since X" means last well at X. A trailing `or so` sets approx. Ranges are always clipped to `saidAt` (§5).

## 4. Clock resolution (R7)

1. Parse hour and minute; `noon` = 12:00, `midnight` = 00:00; `quarter past H` = H:15, `half past H` = H:30, `quarter to H` = (H−1):45, `H thirty` = H:30. A qualifier in the phrase sets the meridiem: `this morning` → am, `this afternoon`/`tonight`/`this evening` → pm, `last night` → pm on the previous day.
2. If am/pm (or a qualifier) is given: candidate = that time on saidAt's day (previous day for `last night`/`yesterday`). If the candidate is after saidAt:
   - within 60 minutes after saidAt → the caller misjudged the time of day: point = saidAt, `rangeStart` = candidate − 60 min, `rangeEnd` = saidAt, confidence `vague`, note `clipped_to_now`;
   - otherwise → candidate − 24 h, note `yesterday_assumed` (unless the phrase itself said `yesterday`, in which case apply §5's `older_than_24h` test instead).
3. If no am/pm: candidates = {H:MM today, H+12:MM today} (for H = 12 the two readings are 12:MM and 00:MM); keep those ≤ saidAt; if none remain, use {both − 24 h}. Choose the **most recent**. Set note `ampm_assumed` when the chosen candidate is more than 8 h before saidAt **and** one of the two same-day readings is in the future by less than 2 h (the caller may have meant the upcoming reading).
4. Apply the tolerance from the R7 row, then clip `rangeEnd` to saidAt (§5).

## 5. Notes and guards

- `older_than_24h`: point is more than 24 h before saidAt (yesterday phrases). The console shows the day ("yesterday 2:00 PM"); the board's countdown shows "window passed".
- `yesterday_assumed`: an explicit clock time that would have been in the future today was moved back a day (§4.2). Display adds "?"; the ladder asks "earlier today, or yesterday?".
- `ampm_assumed`: a bare hour was resolved to the most recent reading but the other reading was plausible (§4.3). Display adds "?"; the ladder asks morning / afternoon-evening.
- `clipped_to_now`: set when a tolerance computed by R1, R2, R2b or R7 pushed `rangeEnd` past saidAt by more than 1 minute and it was clipped, or when §4.2's first case applied. The `min(…, saidAt)` written into R8b, R12, R13 and R14 is part of those rules and sets no note. Set only when no other note applies.
- Never return a point in the future. Never return a range wider than 24 h (collapse to unknown). A result more than 7 days before saidAt → unknown.
- Precedence inside one phrase: clock > relative > anchor (§3).

## 6. Display strings (`format.ts`)

- exact: `2:10 PM`
- approx: `2:00 PM (1:45–2:15 PM)`; a range sharing AM/PM writes it once: `(1:45–2:15 PM)`; across noon: `(11:45 AM–12:15 PM)`
- vague: `about 12:30 PM (12:00–1:30 PM)`; previous day: `yesterday 10:00 PM (8:00–11:59 PM)`
- `ampm_assumed`: `3:00 AM? (2:50–3:10 AM) · confirm AM/PM`
- `yesterday_assumed`: `yesterday 2:00 PM? (1:45–2:15 PM) · confirm day`
- `clipped_to_now`: `about 2:47 PM (2:00–2:47 PM) · clipped to now`
- `older_than_24h`: `{weekday} 2:00 PM (1:45–2:15 PM)` (day name when more than one day back; `yesterday` otherwise)
- unknown: `unknown — ask when last seen normal`
- Any result whose point falls on the previous calendar day is prefixed `yesterday ` (rows 12, 29, 30, 38, 47, 48, 50); earlier days use the weekday name.
- Hours without leading zeros; minutes two digits; `AM`/`PM` uppercase; en dash between range ends; a middle dot before notes.

The UI shows `display`, then `minutesAgo` computed from `lkwAt` every 30 s, then the caller's words in quotes. Spoken forms (briefing, Q&A) come from docs/05 §7 rule 4, never from `display`.

## 7. Test table — `parser.test.ts`

Fixed `saidAt = "2026-10-25T14:47:00-07:00"`, `timezone = "America/Los_Angeles"`. Expected values are local times on 2026-10-25 unless noted. Every row is a test; add rows, never delete.

| # | phrase | lkwAt | range | confidence | note | display |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | fine at about 2 PM | 14:00 | 13:45–14:15 | approx | — | 2:00 PM (1:45–2:15 PM) |
| 2 | at 2:10 | 14:10 | 14:10–14:10 | exact | — | 2:10 PM |
| 3 | at 2 | 14:00 | 13:50–14:10 | approx | — | 2:00 PM (1:50–2:10 PM) |
| 4 | around two | 14:00 | 13:45–14:15 | approx | — | 2:00 PM (1:45–2:15 PM) |
| 5 | about an hour ago | 13:47 | 13:32–14:02 | approx | — | 1:47 PM (1:32–2:02 PM) |
| 6 | an hour ago | 13:47 | 13:41–13:53 | approx | — | 1:47 PM (1:41–1:53 PM) |
| 7 | twenty minutes ago | 14:27 | 14:24–14:30 | approx | — | 2:27 PM (2:24–2:30 PM) |
| 8 | a couple of hours ago | 12:47 | 12:17–13:17 | vague | — | about 12:47 PM (12:17–1:17 PM) |
| 9 | a few hours ago | 11:47 | 09:47–12:47 | vague | — | about 11:47 AM (9:47 AM–12:47 PM) |
| 10 | since lunch | 12:30 | 12:00–13:30 | vague | — | about 12:30 PM (12:00–1:30 PM) |
| 11 | this morning | 09:00 | 06:00–12:00 | vague | — | about 9:00 AM (6:00 AM–12:00 PM) |
| 12 | last night | 10-24 22:00 | 10-24 20:00–23:59 | vague | — | yesterday 10:00 PM (8:00–11:59 PM) |
| 13 | he was fine when he woke up | 07:00 | 06:00–09:00 | vague | — | about 7:00 AM (6:00–9:00 AM) |
| 14 | he woke up like this | 10-24 22:00 | 10-24 20:00–23:59 | vague | — | yesterday 10:00 PM (8:00–11:59 PM) |
| 15 | at noon | 12:00 | 11:50–12:10 | approx | — | 12:00 PM (11:50 AM–12:10 PM) |
| 16 | quarter past two | 14:15 | 14:05–14:25 | approx | — | 2:15 PM (2:05–2:25 PM) |
| 17 | half past one | 13:30 | 13:20–13:40 | approx | — | 1:30 PM (1:20–1:40 PM) |
| 18 | a little after two | 14:10 | 14:00–14:20 | approx | — | 2:10 PM (2:00–2:20 PM) |
| 19 | just before two | 13:53 | 13:45–14:00 | approx | — | 1:53 PM (1:45–2:00 PM) |
| 20 | at 3 | 03:00 | 02:50–03:10 | approx | ampm_assumed | 3:00 AM? (2:50–3:10 AM) · confirm AM/PM |
| 21 | when I talked to him at 11 | 11:00 | 10:50–11:10 | approx | — | 11:00 AM (10:50–11:10 AM) |
| 22 | about 10 minutes ago | 14:37 | 14:27–14:47 | approx | — | 2:37 PM (2:27–2:47 PM) |
| 23 | just now | 14:45 | 14:42–14:47 | approx | — | 2:45 PM (2:42–2:47 PM) |
| 24 | I don't know, I just found him | null | — | unknown | — | unknown — ask when last seen normal |
| 25 | sometime this afternoon | 13:23 | 12:00–14:47 | vague | — | about 1:23 PM (12:00–2:47 PM) |
| 26 | half an hour ago | 14:17 | 14:14–14:20 | approx | — | 2:17 PM (2:14–2:20 PM) |
| 27 | an hour and a half ago | 13:17 | 13:08–13:26 | approx | — | 1:17 PM (1:08–1:26 PM) |
| 28 | two hours ago | 12:47 | 12:35–12:59 | approx | — | 12:47 PM (12:35–12:59 PM) |
| 29 | at dinner last night | 10-24 18:30 | 10-24 17:30–19:30 | vague | — | yesterday 6:30 PM (5:30–7:30 PM) |
| 30 | before he went to bed | 10-24 22:00 | 10-24 20:00–23:59 | vague | — | yesterday 10:00 PM (8:00–11:59 PM) |
| 31 | 2 o'clock | 14:00 | 13:50–14:10 | approx | — | 2:00 PM (1:50–2:10 PM) |
| 32 | 14:30 | 14:30 | 14:30–14:30 | exact | — | 2:30 PM |
| 33 | around 2:30 | 14:30 | 14:15–14:45 | approx | — | 2:30 PM (2:15–2:45 PM) |
| 34 | fine at breakfast | 08:00 | 07:00–09:00 | vague | — | about 8:00 AM (7:00–9:00 AM) |
| 35 | like five minutes ago | 14:42 | 14:32–14:47 | approx | clipped_to_now | 2:42 PM (2:32–2:47 PM) · clipped to now |
| 36 | this evening | null | — | unknown | — | unknown — ask when last seen normal |
| 37 | the last time I saw him normal was Tuesday | null | — | unknown | — | unknown — ask when last seen normal |
| 38 | about 2 PM yesterday | 10-24 14:00 | 10-24 13:45–14:15 | approx | older_than_24h | yesterday 2:00 PM (1:45–2:15 PM) |
| 39 | two thirty | 14:30 | 14:20–14:40 | approx | — | 2:30 PM (2:20–2:40 PM) |
| 40 | sometime after lunch | 13:30 | 13:00–14:00 | vague | — | about 1:30 PM (1:00–2:00 PM) |
| 41 | she was fine at lunch, maybe one thirty | 13:30 | 13:15–13:45 | approx | — | 1:30 PM (1:15–1:45 PM) |
| 42 | Since lunch | 12:30 | 12:00–13:30 | vague | — | about 12:30 PM (12:00–1:30 PM) |
| 43 | 3 this afternoon | 14:47 | 14:00–14:47 | vague | clipped_to_now | about 2:47 PM (2:00–2:47 PM) · clipped to now |
| 44 | since this morning | 10-24 22:00 | 10-24 20:00–23:59 | vague | — | yesterday 10:00 PM (8:00–11:59 PM) |
| 45 | a few minutes ago | 14:42 | 14:37–14:45 | approx | — | 2:42 PM (2:37–2:45 PM) |
| 46 | half an hour ago, we ate around six thirty | 06:30 | 06:15–06:45 | approx | — | 6:30 AM (6:15–6:45 AM) |

Row 46 is the precedence test. By §3 (clock > relative) "around six thirty" wins over "half an hour ago". It has no am/pm and no qualifier ("we ate" is not one), so §4.3 keeps the readings ≤ saidAt — only 06:30 today — and picks it. `ampm_assumed` needs the other same-day reading (18:30) to be less than 2 h in the future; it is 3 h 43 m away, so no note is set. The result is a plausible-looking but wrong 6:30 AM, which is exactly why replay scripts for the demo use relative phrases, not clock times (docs/05 §13), and why the B01 script says "about half an hour ago, when we finished dinner" with no clock time. Row 41 shows the same precedence with a same-day clock time.

Second block, `saidAt = "2026-10-25T07:05:00-07:00"` (early-morning calls):

| # | phrase | lkwAt | range | confidence | note | display |
| --- | --- | --- | --- | --- | --- | --- |
| 47 | when he went to bed around eleven | 10-24 23:00 | 10-24 22:45–23:15 | approx | — | yesterday 11:00 PM (10:45–11:15 PM) |
| 48 | at 10 (said 09:30; use saidAt 09:30 for this row) | 10-24 22:00 | 10-24 21:50–22:10 | approx | ampm_assumed | yesterday 10:00 PM? (9:50–10:10 PM) · confirm AM/PM |
| 49 | at 6 | 06:00 | 05:50–06:10 | approx | — | 6:00 AM (5:50–6:10 AM) |
| 50 | last night around nine | 10-24 21:00 | 10-24 20:45–21:15 | approx | — | yesterday 9:00 PM (8:45–9:15 PM) |

Row 47 is A08's phrase: both same-day readings (11:00, 23:00) are in the future at 07:05, so the −24 h candidates are used and the most recent (23:00 yesterday, 8 h 05 m ago) wins with no note (A08's truth). Row 20 is the AM/PM trap: "at 3" said at 2:47 PM resolves to 3:00 AM with `ampm_assumed`, and the next question becomes "Ask: was that 3 o'clock in the morning, or in the afternoon or evening?". Row 43 shows the near-future clamp: the caller said "3 this afternoon" at 2:47 PM, so the parser treats it as "just now" with a one-hour range; its confidence is `vague`, which keeps the LKW question at the top of the ladder (docs/03 §9) so the dispatcher asks for the exact time.

## 8. Reducer rule for multiple LKW statements

In `state/reducer.ts`: when a new validated `last_known_well` fact arrives, run the parser. Replace `state.lkw` only when the new fact's utterance `seq` is greater than or equal to the current `state.lkw.ref` utterance's `seq` (said later in the call), and the new result is not `unknown`; on equal `seq`, the higher confidence wins (`exact` > `approx` > `vague`). An `unknown` result never erases a parsed earlier one (its phrase is still stored on the fact). This is decision D-17: "later said" wins, never "later processed", so a reasoner re-reading "Since lunch" after the fast pass has parsed "fine at about 2 PM" cannot flip the card back.

## 9. What the UI shows

Facts panel row: `Last known well` → `display` (large) → `{minutesAgo} min ago` (updates every 30 s; omitted when unknown/older than 24 h) → `"{quote}"` at `mm:ss` (clickable). Board countdown: `4.5 h window from LKW: {remaining}` where remaining = `lkwAt + 270 min − now`; "window passed" when negative; "LKW unknown" when null; range shown as a tooltip. The sentence "The treating team makes every treatment decision." sits under the countdown in small type.
