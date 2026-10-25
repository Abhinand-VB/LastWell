| Metric | LastWell (claude-haiku-5-5 + claude-sonnet-5-5 @medium, rescored) | Keyword baseline |
| --- | --- | --- |
| Sensitivity @possible (n=12) | 12/12 (100%) | 3/12 (25%) |
| Sensitivity @likely | 6/12 (50%) | — |
| Precision @possible (flags=17) | 12/17 (71%) | 3/6 (50%) |
| Precision @likely | 6/7 (86%) | — |
| Median seconds to first flag | 12 s | 12 s |
| LKW correct (n=16 with truth) | 16/16 | — |
| Blood thinner correct (n=8) | 8/8 | — |
| Invented facts shown | 0 | — |
| Dropped by validator | 1 items | — |
| Wrong facts | 0 | — |
| Level agreement (n=20) | 19/20 (95%) | — |

Model errors: 0. Median latency: fast pass 1207 ms, reasoner 2861 ms.
20 scripted calls (text mode), written by the team; real-world precision will be lower.

| id | type | expected | final | signs | first flag | baseline | LKW | blood thinner | look-alikes | dropped | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A01 | classic | likely | likely | speech, arms | 11s | — | ok 2:00 PM (1:45–2:15 PM) (truth 14:00) | ok Eliquis | — | 0 |  |
| A02 | classic | likely | likely | face, speech | 12s | 12s | ok 12:30 PM (12:15–12:45 PM) (truth 12:30) | ok none | — | 0 |  |
| A03 | classic | likely | possible | arms, balance | 12s | — | ok 3:10 PM (2:55–3:25 PM) (truth 15:10) | ok warfarin | low blood sugar, head injury | 0 |  |
| A04 | classic | likely | likely | speech, face | 12s | — | n/a | n/a | head injury, low blood sugar | 0 |  |
| A05 | classic | likely | likely | eyes, arms | 12s | 12s | ok 9:02 AM (8:59–9:05 AM) (truth 09:02) | ok baby aspirin every day | low blood sugar | 0 |  |
| A06 | classic | likely | likely | speech, arms | 12s | — | ok about 8:00 AM (7:00–9:00 AM) (truth 08:00) | ok Xarelto | — | 0 |  |
| A07 | classic | possible | possible | balance, eyes | 11s | — | ok 9:20 PM (9:10–9:30 PM) (truth 21:20) | ok none | intoxication, low blood sugar | 0 |  |
| B01 | chameleon | possible | possible | balance, eyes | 3s | — | ok 6:50 PM (6:40–7:00 PM) (truth 18:50) | ok none | low blood sugar, intoxication | 1 |  |
| B02 | chameleon | possible | possible | speech | 11s | — | ok 4:15 PM (4:00–4:30 PM) (truth 16:15) | n/a | low blood sugar | 0 |  |
| B04 | chameleon | possible | possible | speech | 13s | — | ok 11:00 AM (10:50–11:10 AM) (truth 11:00) | n/a | low blood sugar, seizure | 0 |  |
| B06 | chameleon | possible | possible | eyes, balance | 11s | — | ok 11:35 AM (11:32–11:38 AM) (truth 11:35) | ok none | migraine | 0 |  |
| B08 | chameleon | likely | likely | face, speech | 12s | 12s | ok 9:25 PM (9:14–9:36 PM) (truth 21:25) | n/a | migraine | 0 |  |
| C01 | lookalike | possible | possible | speech | 17s | — | ok 7:05 PM (6:50–7:20 PM) (truth 19:05) | n/a | low blood sugar | 0 |  |
| C02 | lookalike | possible | possible | speech | 11s | — | ok 3:10 PM (3:07–3:13 PM) (truth 15:10) | n/a | seizure, low blood sugar | 0 |  |
| C03 | lookalike | possible | possible (max likely) | speech, balance | 12s | 12s | ok 10:30 PM (10:15–10:45 PM) (truth 22:30) | n/a | intoxication, low blood sugar, head injury | 0 |  |
| C04 | lookalike | possible | possible | eyes, arms | 11s | 11s | ok 3:40 PM (3:25–3:55 PM) (truth 15:40) | n/a | migraine | 0 |  |
| C05 | lookalike | possible | possible | face | 11s | 11s | ok yesterday 9:00 AM (6:00 AM–12:00 PM) (truth 09:00) | n/a | Bell's palsy | 0 |  |
| D01 | other | none | none | — | — | — | n/a | n/a | — | 0 |  |
| D02 | other | none | none | — | — | — | n/a | n/a | — | 0 |  |
| D04 | other | none | none | — | — | — | n/a | n/a | — | 0 |  |
