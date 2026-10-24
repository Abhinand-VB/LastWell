# LastWell — stroke alerts that start on the 911 call

Planning package for Cal Hacks 13.0. Agents and humans start at [`CLAUDE.md`](./CLAUDE.md); the source of truth is [`docs/`](./docs).

| File | What it is |
| --- | --- |
| `CLAUDE.md` | Agent operating manual: reading order, non-negotiables, conventions, definition of done |
| `docs/00-OVERVIEW.md` | Scope, non-goals, the acceptance test, glossary |
| `docs/01-ARCHITECTURE.md` | Components, repo layout, verified Twilio/Cartesia/Claude facts, data flow, env vars |
| `docs/02-DATA-MODEL.md` | Convex schema, functions and read/write rules |
| `docs/03-CONTRACTS.md` | Every zod schema, WebSocket and REST message, the quote validator, level guard, next-question ladder |
| `docs/04-PROMPTS.md` | The three Claude calls: prompts, builders, fixtures |
| `docs/05-VOICE-PIPELINE.md` | Twilio ↔ Cartesia ↔ gateway, briefing call, Q&A loop, failure handling, browser fallback |
| `docs/06-LKW-PARSER.md` | Last-known-well grammar and 50-row test table |
| `docs/07-EVAL.md` | Metrics, keyword baseline, the 38 scripts, runner |
| `docs/08-DEMO-RUNBOOK.md` | Pre-flight, two-minute script, failure switches, rehearsal protocol, submission |
| `docs/09-DECISIONS-AND-RISKS.md` | Decision log, vendor gotchas, risk register, cut list |
| `docs/TASKS.md` | Dependency-ordered task ledger with acceptance criteria |
| `docs/scaffold/README.md` | Exact scaffold file contents for tasks S-01/S-02 |
| `docs/brief/LastWell_Project_Brief.pdf` | The original project brief |
| `apps/gateway/convex/` | Convex schema and store functions (docs/02) |
| `.env.example` | Every environment variable, commented |

The judges' README (setup, Cartesia features used, known limits) is task C-06 and replaces this file at the event.
