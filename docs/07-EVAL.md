# 07 — Evaluation

Owner: Reasoning lane (runner, scoring, baseline) + Clinical lane (scripts, recordings, review). Package: `apps/eval` (`@lastwell/eval`). Results go on the slide and in the Devpost, labelled **scripted calls, recorded by us**.

## 1. What we claim and how we measure it

| Metric | Definition (computed by `src/score.ts`) | LastWell | Keyword baseline |
| --- | --- | --- | --- |
| Sensitivity @possible | stroke scripts (types classic + chameleon) whose state reached level ≥ `possible` at any point ÷ all stroke scripts | ✔ | ✔ |
| Sensitivity @likely | same with level `likely` | ✔ | n/a (baseline has one level) |
| Precision @possible | stroke scripts among all scripts that reached ≥ `possible` | ✔ | ✔ |
| Precision @likely | stroke scripts among scripts that reached `likely` | ✔ | n/a |
| Seconds to first flag | median over true positives of the **script time** (`atMs/1000`) of the utterance whose processing first raised the level to ≥ `possible` | ✔ | ✔ |
| LKW correct | scripts with a truth LKW where `lkwAt` is within `toleranceMin` of the truth time, ÷ scripts with a truth LKW; also report "LKW left unknown" | ✔ | n/a |
| Blood thinner correct | scripts where the blood-thinner fact equals the truth (case-insensitive drug name; `none` ≡ null) ÷ scripts where the truth mentions one (incl. explicit "none") | ✔ | n/a |
| Invented facts shown | facts or signs shown with a `QuoteRef` whose quote is **not** a substring of the script text (must be 0 by construction; the runner asserts it) | ✔ | n/a |
| Dropped by validator | model items the validator rejected (honesty counter; expected > 0) | ✔ | n/a |
| Wrong facts | shown facts whose value contradicts the truth table | ✔ | n/a |
| Level agreement | scripts whose final level equals `truth.expectedLevel` (informational; not on the slide) | ✔ | n/a |

Also reported per `group` (native / non_native / panicked / tv_background) for the hard-audio scripts (deferred by D-33), and the wall-clock latency medians (`fastPassMs`, `reasonerMs`) from the run.

The slide shows: sensitivity @possible and @likely, precision @possible and @likely, seconds to first flag, LKW correct, blood thinner correct, invented facts, for LastWell vs baseline, with the footnote "20 scripted calls (text mode), written by the team; real-world precision will be lower — the Copenhagen model was right about one time in four (63.0 % recall, 24.9 % precision)."

## 2. The keyword baseline — `packages/core/src/baseline/keywordBaseline.ts`

Flags a call on the first **caller** utterance matching any of:

```ts
export const BASELINE_PATTERNS = [
  /\bstroke\b/i, /droop/i, /slur/i, /\bnumb/i, /\bparaly/i, /\bone side\b/i,
  /\bcan'?t (talk|speak)\b/i, /\bface (is|looks) (uneven|crooked|lopsided)\b/i,
];
```

That is the whole baseline. It is deliberately what a keyword-alert feature in a general 911 tool does. If LastWell loses to it on any script type, the slide says so and names the scripts.

## 3. Script format and the 38 scripts

> **D-33 (2026-10-24): the eval runs in text mode on 20 scripts only:** A01–A07, B01, B02, B04, B06, B08, C01–C05, D01, D02, D04. The other 18 seeds below (A08–A10, B03, B05, B07, C06–C08, D03, D05, D06, E01–E06) are **backlog**: keep the seeds, do not write them before the 20 are done and P1 is merged. Audio mode (§5 "Audio mode", E-02, E-04, §6 item 3) is deferred.

Contract: docs/03 §14. Files: `apps/eval/scripts/{id}.json`. The Clinical lane writes dialogues from the seeds below (task C-02), each 8–14 turns, dispatcher and caller alternating, realistic 911 phrasing (address first, then "tell me exactly what happened", then protocol questions). Every stroke script must contain at least the signs listed in its truth, stated by the caller in lay words, and must avoid the word "stroke" unless the seed says otherwise. Every script sets `callStartLocal` so that the LKW arithmetic is testable.

### 3.1 Classic stroke (A01–A10) — truth `isStroke:true`, `expectedLevel:"likely"` (A07: `possible`)

| id | Seed | signs | LKW (truth) | blood thinner | notes |
| --- | --- | --- | --- | --- | --- |
| A01 | Card A. Daughter, father 78: words mixed up, right hand weak, can't lift coffee cup; fine at about 2 PM; takes Eliquis | speech, arms | 14:00 ±15 (call 14:47) | Eliquis | the live demo script; verbatim turns in §4 |
| A02 | Wife, husband 71: face drooping on the left, speech slurred, started after lunch "around 12:30"; "just his blood pressure pills" | face, speech | 12:30 ±15 (call 13:25) | none | |
| A03 | Daughter, mother 82: suddenly can't move left arm and leg, slid off the chair, can't stand; "about an hour ago"; warfarin | arms, balance | call−60 ±15 (call 16:10) | warfarin | the second kind (`balance`) comes from "she can't stand up at all" when the dispatcher asks; until then the guard holds `possible` |
| A04 | Neighbor found man 69 on the floor: speech garbled, right side of mouth hanging; LKW unknown ("I just found him"); meds unknown | speech, face | `lkw: null` | null | tests "unknown — ask" staying up |
| A05 | Husband, wife 75: sudden loss of vision in one eye, left hand numb; "ten minutes ago"; daily aspirin | eyes, arms | call−10 ±5 (call 09:12) | aspirin | |
| A06 | Caregiver, resident 88 F: understands but can't say words, right side limp; "fine at breakfast"; Xarelto | speech, arms | 08:00 ±60 (call 10:30) | Xarelto | vague truth → toleranceMin 60 |
| A07 | Son, father 66: sudden violent dizziness, double vision, can't walk; "about twenty minutes ago"; no thinners | balance, eyes | call−20 ±10 (call 21:40) | none | posterior stroke; balance + eyes only → `expectedLevel: possible` (D-21) even though it is a classic script; the next question should be a face/arm check |
| A08 | Wife, husband 80: woke up with slurred speech and a weak arm; last normal "when he went to bed around eleven"; Plavix | speech, arms | yesterday 23:00 ±15 (call 07:05) | Plavix | wake-up stroke; note older_than_24h is false (8 h) |
| A09 | Friend, woman 73: dropped a glass, can't lift her arm, mouth drooping; "a little after three"; none | arms, face | 15:10 ±10 (call 15:40) | none | |
| A10 | Granddaughter, grandmother 90: suddenly using wrong words, left face droop; "this morning around nine"; "the blood thinner, Eliquis" | speech, face | 09:00 ±15 (call 10:50) | Eliquis | |

### 3.2 Stroke chameleons (B01–B08) — truth `isStroke:true`, `expectedLevel:"possible"` (B07 and B08 `likely`: two kinds including a focal sign, D-41)

| id | Seed | signs | LKW | blood thinner | lookalike the model may raise |
| --- | --- | --- | --- | --- | --- |
| B01 | Card B. Husband, wife 74: dizzy, bumping into the wall, sees double, "just tired"; "fine about half an hour ago, when we finished dinner"; no thinners | balance, eyes | call−30 ±10 (call 19:20) | none | — (relative phrase on purpose: this script is replayed live at any hour, docs/05 §13) |
| B02 | Son, father 70: "sounds drunk", words mixed up, doesn't drink; "about an hour ago" | speech | call−60 ±15 | null | intoxication (should be dismissed by "doesn't drink") |
| B03 | Wife, husband 77: keeps falling to the right side, "probably his knees"; started "after lunch" | balance | 13:30 ±60 (call 15:00) | null | — |
| B04 | Sister, woman 68: "sounds weird on the phone", words won't come out; "we talked at 11 and she was fine" | speech | 11:00 ±10 (call 13:30) | null | — |
| B05 | Daughter, mother 79: sudden spinning dizziness and vomiting, can't sit up; "half an hour ago" | balance | call−30 ±5 | null | infection (vomiting) |
| B06 | Husband, wife 72: suddenly can't see anything on her left, bumps into furniture, "maybe her glasses"; "ten minutes ago" | eyes, balance | call−10 ±5 | none | — (no focal sign → `possible`, next question = face/arm check) |
| B07 | Grandson, grandfather 85: "acting strange", can't button his shirt with his right hand, drooling from one side; "fine at breakfast" | arms, face | 08:00 ±60 (call 11:15) | Eliquis | expectedLevel `likely` |
| B08 | Roommate, woman 61: sudden bad headache, numb face, slurred speech, "she gets migraines" | face, speech | call−45 ±10 | null | migraine (raised, not resolved); expectedLevel `likely` (D-41: two kinds incl. a focal sign) |

### 3.3 Look-alikes, not stroke (C01–C08) — truth `isStroke:false`; expected level ≤ `possible`; truth `lookalike` set. Signs the caller describes still count (C02 "not talking", C03 slurring + stumbling); a `likely` from LastWell on any look-alike is a real false positive in precision @likely (D-41).

| id | Seed | lookalike | key facts |
| --- | --- | --- | --- |
| C01 | Card C. Wife, husband 68: diabetic, skipped dinner, sweaty and confused, mumbling; insulin at five | low blood sugar | diabetes yes, medication insulin, LKW call−60 |
| C02 | Mother, son 34: shaking and jerking for a minute, now confused and not talking; has epilepsy | seizure | seizure_history yes |
| C03 | Bartender, man 50s: slurring, stumbling, had "a lot to drink" | intoxication | alcohol_or_drugs |
| C04 | Husband, wife 45: flashing lights, then numb hand and headache, "her usual migraine but worse" | migraine | onset gradual, fever none |
| C05 | Daughter, father 60: right side of face droopy since yesterday, ear pain, nothing else, walking and talking fine | Bell's palsy | onset "since yesterday", no arm/speech signs |
| C06 | Wife, husband 79: fell down the stairs, hit his head, confused, cut on his forehead | head injury | head_injury |
| C07 | Caregiver, woman 91: confused for two days, fever, not drinking | infection | fever_or_infection, onset gradual |
| C08 | Son, mother 66: insulin-dependent, "sugar machine says forty", shaky, slurring | low blood sugar | diabetes, medication insulin |

### 3.4 Other medical (D01–D06) — truth `isStroke:false`, `expectedLevel:"none"`

| id | Seed |
| --- | --- |
| D01 | Wife, husband 58: crushing chest pain, sweating, pain going to both arms |
| D02 | Son, mother 84: fell in the bathroom, hip pain, cannot get up, talking normally |
| D03 | Roommate, man 29: asthma, can't catch his breath, wheezing |
| D04 | Friend, woman 40: ate shrimp, lips and face swelling, itchy (face swelling is not droop — false-positive trap) |
| D05 | Husband, wife 52: severe belly pain, vomiting, no other symptoms |
| D06 | Coworker, man 35: panic, tingling in both hands, breathing fast |

### 3.5 Hard audio (E01–E06) — re-reads of earlier scripts in audio mode only; `sourceId` names the script whose turns and truth apply (the loader copies them); `--mode text` skips them

| id | source | group |
| --- | --- | --- |
| E01 | A02 | non_native |
| E02 | A03 | panicked |
| E03 | B01 | tv_background |
| E04 | C01 | non_native |
| E05 | A05 | panicked |
| E06 | D01 | tv_background |

## 4. Verbatim scripts for the demo cards

`A01.json` (Card A) — the dialogue the dispatcher rehearses:

```json
{
  "id": "A01", "type": "classic", "title": "Card A — father, mixed-up words, weak right hand", "sourceId": null,
  "callStartLocal": "2026-10-25T14:47:00",
  "turns": [
    { "speaker": "dispatcher", "atMs": 0,     "text": "911, what is the address of your emergency?" },
    { "speaker": "caller",     "atMs": 3000,  "text": "It's 1842 Clement Street, apartment 3. It's my father, he's 78." },
    { "speaker": "dispatcher", "atMs": 9000,  "text": "Okay. Tell me exactly what happened." },
    { "speaker": "caller",     "atMs": 11000, "text": "Since lunch his words come out all mixed up and his right hand is weak, he can't lift his coffee cup." },
    { "speaker": "dispatcher", "atMs": 19000, "text": "Is he awake and breathing normally?" },
    { "speaker": "caller",     "atMs": 21000, "text": "Yes, he's awake, he's sitting on the couch, he just can't get the words out right." },
    { "speaker": "dispatcher", "atMs": 27000, "text": "When was he last seen completely normal?" },
    { "speaker": "caller",     "atMs": 30000, "text": "He was fine at about 2 PM. We had lunch and he was fine." },
    { "speaker": "dispatcher", "atMs": 35000, "text": "Does he take any blood thinners, like Eliquis, Xarelto or warfarin?" },
    { "speaker": "caller",     "atMs": 37000, "text": "Yes, he takes Eliquis. For his heart." },
    { "speaker": "dispatcher", "atMs": 41000, "text": "Okay. Help is on the way. Stay with him and keep the phone with you." }
  ],
  "truth": {
    "isStroke": true, "expectedLevel": "likely", "signs": ["speech", "arms"],
    "lkw": { "localTime": "2026-10-25T14:00:00", "toleranceMin": 15 },
    "bloodThinner": "Eliquis", "lookalike": null,
    "facts": [ { "kind": "age", "value": "78" }, { "kind": "sex", "value": "male" },
               { "kind": "blood_thinner", "value": "Eliquis" }, { "kind": "address", "value": "1842 Clement Street, apartment 3" } ]
  },
  "audio": null, "group": "native"
}
```

`B01.json` (Card B):

```json
{
  "id": "B01", "type": "chameleon", "title": "Card B — wife dizzy, sees double, 'just tired'", "sourceId": null,
  "callStartLocal": "2026-10-25T19:20:00",
  "turns": [
    { "speaker": "dispatcher", "atMs": 0,     "text": "911, what is the address of your emergency?" },
    { "speaker": "caller",     "atMs": 3000,  "text": "530 Ulloa Street. It's my wife. She's dizzy and she keeps bumping into the wall, and she says she sees double. I think she's just tired." },
    { "speaker": "dispatcher", "atMs": 12000, "text": "How old is she?" },
    { "speaker": "caller",     "atMs": 14000, "text": "She's 74." },
    { "speaker": "dispatcher", "atMs": 16000, "text": "When was she last seen completely normal?" },
    { "speaker": "caller",     "atMs": 19000, "text": "She was fine about half an hour ago, when we finished dinner." },
    { "speaker": "dispatcher", "atMs": 25000, "text": "Ask her to smile for you. Is one side of her face drooping or uneven?" },
    { "speaker": "caller",     "atMs": 29000, "text": "No, her face looks normal. She's just wobbly, she can't walk straight." },
    { "speaker": "dispatcher", "atMs": 34000, "text": "Can she lift both arms and keep them up?" },
    { "speaker": "caller",     "atMs": 37000, "text": "Yes, both arms are fine." },
    { "speaker": "dispatcher", "atMs": 40000, "text": "Does she take any blood thinners?" },
    { "speaker": "caller",     "atMs": 42000, "text": "No, nothing like that." }
  ],
  "truth": {
    "isStroke": true, "expectedLevel": "possible", "signs": ["balance", "eyes"],
    "lkw": { "localTime": "2026-10-25T18:50:00", "toleranceMin": 10 },
    "bloodThinner": "none", "lookalike": null,
    "facts": [ { "kind": "age", "value": "74" }, { "kind": "sex", "value": "female" }, { "kind": "blood_thinner", "value": "none" } ]
  },
  "audio": null, "group": "native"
}
```

`C01.json` (Card C):

```json
{
  "id": "C01", "type": "lookalike", "title": "Card C — diabetic husband, skipped dinner, sweaty and confused", "sourceId": null,
  "callStartLocal": "2026-10-25T20:05:00",
  "turns": [
    { "speaker": "dispatcher", "atMs": 0,     "text": "911, what is the address of your emergency?" },
    { "speaker": "caller",     "atMs": 3000,  "text": "2210 Taraval Street. It's my husband, he's diabetic, he skipped dinner, and now he's sweaty and confused." },
    { "speaker": "dispatcher", "atMs": 11000, "text": "How old is he?" },
    { "speaker": "caller",     "atMs": 13000, "text": "He's 68." },
    { "speaker": "dispatcher", "atMs": 15000, "text": "Is he talking to you?" },
    { "speaker": "caller",     "atMs": 17000, "text": "He's mumbling, he's not making much sense. And he's shaky." },
    { "speaker": "dispatcher", "atMs": 22000, "text": "Does he take insulin, and when did he last eat?" },
    { "speaker": "caller",     "atMs": 25000, "text": "Yes, he took his insulin at five and then he didn't eat anything." },
    { "speaker": "dispatcher", "atMs": 30000, "text": "When was he last acting normally?" },
    { "speaker": "caller",     "atMs": 33000, "text": "About an hour ago, he was fine." }
  ],
  "truth": {
    "isStroke": false, "expectedLevel": "possible", "signs": ["speech"],
    "lkw": { "localTime": "2026-10-25T19:05:00", "toleranceMin": 15 },
    "bloodThinner": null, "lookalike": "low blood sugar",
    "facts": [ { "kind": "age", "value": "68" }, { "kind": "sex", "value": "male" }, { "kind": "diabetes", "value": "diabetic" }, { "kind": "medication", "value": "insulin" } ]
  },
  "audio": null, "group": "native"
}
```

Expected console behaviour for C01: at most `possible` ("mumbling" registers as `speech`); the look-alike panel shows "low blood sugar" from the first reasoner run, and because the first utterance already contains "diabetic" the look-alike counts as resolved (docs/03 §9), so the panel reads `low blood sugar — answered: {diabetes fact value}` (the value is the model's extraction of the caller's words, e.g. "diabetic, skipped dinner") rather than an "Ask"; the banner follows the ladder (LKW question until "about an hour ago" arrives, then blood thinners); the Send button stays enabled (the dispatcher decides) with the look-alike panel visible. That is what "holds back" means on the demo table: the system names the alternative explanation instead of escalating.

## 5. Runner — `apps/eval/src/run.ts`

```
pnpm --filter @lastwell/eval eval --mode text [--ids A01,B01] [--out results/]
pnpm --filter @lastwell/eval eval --mode audio --ids A01,B01,C01 [--concurrency 2]
```

(The package script is named `eval`, not `run`: `pnpm run` is pnpm's own command. Arguments follow the script name directly; the CLI ignores a stray leading `--`.)

### Text mode

For each script except `hard_audio` (skipped in text mode): create a `ScriptedRunner` (`src/scriptedRunner.ts`) that reuses `@lastwell/core` (`reducer`, `validate`, `nextQuestion`, `parseLkw`, `fastPass`, `reasoner`) with a virtual clock: `saidAt = callStartLocal + atMs` in `CALL_TIMEZONE`, and the reasoner's `nowLocal` = `callStartLocal + atMs` of the latest turn. Feed turns in order; caller turns go through the fast pass; the reasoner runs on the same triggers as live (docs/05 §6: new validated sign or key fact → immediately) and, instead of the 10 s wall timer, after every third utterance and once at the end. Record the state after each turn, the first `atMs` at which the level reached each threshold, and the latency of each model call. The baseline runs on the same turns.

### Audio mode

For scripts with `audio` (or `--ids` naming them), using `InkSession` and the WAV pacer from `@lastwell/stt`: open one Ink 2 session (`pcm_s16le`, 16000, profile `call`, speaker `mixed`), stream the WAV at real-time pace (one 20 ms chunk every 20 ms; the realtime endpoint rejects faster-than-real-time input), then send `{"type":"close"}` and wait for the socket to close. Each `turn.end` becomes an utterance with real timestamps and is processed live by the same `ScriptedRunner`. `--concurrency` bounds parallel sessions (check the Cartesia plan's concurrency limit; default 2). Runtime ≈ total audio length ÷ concurrency.

WAV files: 16 kHz, mono, 16-bit PCM, named `{id}.wav` under `apps/eval/audio/`. Record with the `/mic` page's record button (task W-09) or any voice-memo app + `ffmpeg -i in.m4a -ar 16000 -ac 1 -sample_fmt s16 A01.wav`. Only the `samples` of the WAV are streamed (skip the 44-byte header; parse the header properly with `wavefile` or a 20-line parser).

### Output

- `results/{ISO timestamp}-{mode}.json`: per-script records (final state, per-threshold flag times, baseline flag time, model latencies, drops) + the summary.
- stdout: the summary table in Markdown (copy-paste into the slide and Devpost):

```
| Metric | LastWell | Keyword baseline |
| Sensitivity @possible (n=18) | 17/18 (94%) | 11/18 (61%) |
| Sensitivity @likely | 13/18 (72%) | — |
| Precision @possible (flags=20) | 17/20 (85%) | 11/12 (92%) |
| Precision @likely | 13/14 (93%) | — |
| Median seconds to first flag | 11 s | 14 s |
| LKW correct (n=16 with truth) | 14/16 | — |
| Blood thinner correct (n=12) | 12/12 | — |
| Invented facts shown | 0 | — |
| Dropped by validator | 9 items | — |
| Wrong facts | 1 | — |
```

(The numbers above are placeholders to show the shape; real ones are filled in by the run and must never be typed by hand.)

**Run-to-run consistency (2026-10-25, human-run).** E-01 text mode was run twice more on the 20 development scripts, at ~1:30 and ~1:37 AM PT, on `version1` cd65916 (prompts fast-5 / reasoner-5): `apps/eval/results/2026-10-25T08-29-53-599Z-text-live.json` and `…T08-36-02-927Z-text-live.json`. Both: level agreement 20/20 (final and peak level), sensitivity @possible 12/12, @likely 7/12, precision @likely 7/7, LKW 16/16, blood thinner 8/8, invented facts 0. Per script, the two runs are identical on final level, peak level, LKW, blood thinner and invented facts (0 differences). The first run had 1 model error (recovered by the retry path, no effect on the scores), the second 0. Median fast pass 1037 / 1187 ms, reasoner 2687 / 2747 ms. These two runs are beyond the docs/10 §7.4 E-03 budget (two runs); a human ran them.

## 5b. Held-out blind test (task E-05, 2026-10-24)

Answers "you graded your own homework". Protocol, fixed before any run:

1. **Written by integration**, in `apps/eval/scripts-heldout/` (A11, B09, B10, B11, C09, C10, C11, D07): 4 strokes (1 classic; 3 chameleons: posterior balance/vision, a confusion-like aphasia, a caller who blames a pinched nerve), 3 look-alikes not in C01–C05 (urinary infection with confusion in an 86-year-old, a panic attack with tingling in both hands, a sedative overdose), 1 other emergency (a deep forearm cut). Caller styles not used in the 20 development scripts: rambling, interrupting, unsure of the time, non-family callers (coworker, neighbor, home aide, roommate), partial information. No caller phrase shares 5 consecutive words with the development scripts or docs/04 (checked at write time). Truth labels state what the caller means; they were not checked against the LKW parser, the fake model or any prompt.
2. **Never seen by reasoning.** The reasoning lane does not read, run or tune anything on `scripts-heldout`, and no prompt or rule change is ever based on it.
3. **Run once by voice**, after its current task, with the prompts as they are on `version1` at that moment: `pnpm --filter @lastwell/eval eval --mode text --scripts scripts-heldout`. The printed table is saved unchanged to `apps/eval/results/heldout-run1.md` with the commit hash and prompt versions, **even if the results are bad. No reruns.**
4. The results slide shows it next to the development results: "20 development scripts" and "8 blind scripts", with the caveat that **all scripts are team-written**; blind means unseen by the people who tuned the prompts, not independent.

## 6. Acceptance for the eval lane (mirrors TASKS.md E-01…E-04)

1. `--mode text --ids A01,B01,C01` completes in < 3 min and the summary table prints with no `NaN`.
2. `--mode text` over all A–D scripts completes with ≤ 2 Claude errors (retries allowed), results JSON written.
3. Audio mode on A01 produces ≥ 8 utterances with timestamps and reaches `likely`.
4. The baseline numbers reproduce exactly across two runs (deterministic). LastWell numbers may vary by ±1 script between runs; the slide uses the run from Saturday evening and says so.
5. The runner refuses to start when `ANTHROPIC_API_KEY` is missing, with a clear message.
