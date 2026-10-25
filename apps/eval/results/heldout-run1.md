# E-05 held-out blind run 1 (the only run)

2026-10-25 00:15 PT · version1 8932b6e · prompts fast-5 / reasoner-5 · `pnpm --filter @lastwell/eval eval --mode text --scripts scripts-heldout` · run once by voice, no reruns, no edits to prompts, scorer or scripts · results JSON: apps/eval/results/2026-10-25T07-15-41-224Z-text-live.json

Printed output, unchanged:

```

  B09  possible  12 model calls  0 errors
  B10  possible  11 model calls  0 errors
  A11  likely    13 model calls  0 errors
  B11  possible  12 model calls  0 errors
  C10  none      9 model calls  0 errors
  C09  possible  11 model calls  1 errors
  C11  possible  11 model calls  0 errors
  D07  none      9 model calls  0 errors
```


| Metric | LastWell (claude-haiku-5-5 + claude-sonnet-5-5 @medium) | Keyword baseline |
| --- | --- | --- |
| Sensitivity @possible (n=4) | 4/4 (100%) | 3/4 (75%) |
| Sensitivity @likely | 1/4 (25%) | — |
| Precision @possible (flags=6) | 4/6 (67%) | 3/4 (75%) |
| Precision @likely | 1/1 (100%) | — |
| Median seconds to first flag | 16 s | 31 s |
| LKW correct (n=6 with truth) | 3/6 (1 left unknown) | — |
| Blood thinner correct (n=2) | 2/2 | — |
| Invented facts shown | 0 | — |
| Dropped by validator | 1 items | — |
| Wrong facts | 0 | — |
| Level agreement (n=8) | 8/8 (100%) | — |

Model errors: 1. Median latency: fast pass 1216 ms, reasoner 2676 ms.
8 scripted calls (text mode), written by the team; real-world precision will be lower.

| id | type | expected | final | signs | first flag | baseline | LKW | blood thinner | look-alikes | dropped | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A11 | classic | likely | likely | speech, arms, face | 19s | 19s | MISS 10:00 AM (9:50–10:10 AM) (truth 15:10) | n/a | — | 0 |  |
| B09 | chameleon | possible | possible | balance, eyes | 14s | 31s | ok 6:00 PM (5:50–6:10 PM) (truth 18:00) | ok Pradaxa | — | 0 |  |
| B10 | chameleon | possible | possible | speech | 17s | 58s | ok 11:00 AM (10:45–11:15 AM) (truth 11:00) | n/a | low blood sugar, infection | 0 |  |
| B11 | chameleon | possible | possible | arms | 4s | — | MISS yesterday 8:00 PM? (7:45–8:15 PM) · confirm day (truth 12:20) | ok none | pinched nerve | 1 |  |
| C09 | lookalike | possible | possible | speech | 14s | — | MISS unknown — ask when last seen normal (truth 19:00) | n/a | infection | 0 |  |
| C10 | lookalike | none | none | — | — | — | n/a | n/a | — | 0 |  |
| C11 | lookalike | possible | possible | speech | 13s | 13s | ok 8:00 PM (7:45–8:15 PM) (truth 20:00) | n/a | intoxication | 0 |  |
| D07 | other | none | none | — | — | — | n/a | n/a | — | 0 |  |

