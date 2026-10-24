# 02 — Data model

One Postgres database on Supabase. The gateway is the only writer (service role). The web app reads for initial loads and history (anon key, read-only policies). Live updates travel over the gateway WebSocket (docs/03 §5), not Supabase Realtime (decision D-04).

The `CaseState` document (docs/03 §3) is stored as one JSONB column per call rather than normalized across tables: the console renders it as a unit, it changes as a unit, and nobody queries inside it this weekend.

## 1. Migration — `supabase/migrations/0001_init.sql`

```sql
-- LastWell demo schema. Run in the Supabase SQL editor or `supabase db push`.
create extension if not exists "pgcrypto";

create table calls (
  id               uuid primary key default gen_random_uuid(),
  mode             text not null check (mode in ('phone','browser','replay')),
  twilio_call_sid  text unique,
  caller_number    text,                         -- E.164 from Twilio `From`; null in browser/replay mode or when withheld
  label            text,                         -- 'TEST' for smoke-test calls, the script id for replays, else null
  timezone         text not null default 'America/Los_Angeles',
  started_at       timestamptz not null default now(),   -- webhook time (phone) or creation time (other modes)
  stream_started_at timestamptz,                 -- first audio frame; base for t_start_ms and LKW `saidAt`
  ended_at         timestamptz,
  status           text not null default 'live' check (status in ('live','ended','failed')),
  last_error       text,
  created_at       timestamptz not null default now()
);

create table utterances (
  id          uuid primary key default gen_random_uuid(),
  call_id     uuid not null references calls(id) on delete cascade,
  seq         integer not null,                  -- 1-based, per call, assigned by the gateway
  speaker     text not null check (speaker in ('caller','dispatcher','mixed')),
  text        text not null,
  t_start_ms  integer not null,                  -- ms since stream_started_at (Twilio media timestamp; bytes/32 in browser mode)
  t_end_ms    integer not null,
  created_at  timestamptz not null default now(),
  unique (call_id, seq)
);
create index utterances_call_idx on utterances (call_id, seq);

create table case_states (
  call_id        uuid primary key references calls(id) on delete cascade,
  version        integer not null default 0,     -- monotonically increasing; UI ignores older versions
  state          jsonb not null,                 -- CaseState (docs/03 §3), always validated before write
  fast_pass_ms   integer,
  reasoner_ms    integer,
  last_error     text,
  updated_at     timestamptz not null default now()
);

create table alerts (
  id                uuid primary key default gen_random_uuid(),
  call_id           uuid not null references calls(id) on delete cascade,
  target_phone      text not null,               -- E.164
  status            text not null default 'queued'
                    check (status in ('queued','calling','ringing','answered','briefed','qa','completed','failed')),
  briefing_text     text not null,               -- exactly what Sonic read
  case_snapshot     jsonb not null,              -- CaseState at approval time
  transcript_snapshot jsonb not null default '[]', -- Utterance[] at approval time; the Q&A reads this, not the live registry
  twilio_call_sid   text,
  sms_sid           text,                        -- only when ALERT_SMS_ENABLED
  ems_confirmed_at  timestamptz,
  last_error        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index alerts_call_idx on alerts (call_id);
create index alerts_created_idx on alerts (created_at desc);

create table qa_turns (
  id          uuid primary key default gen_random_uuid(),
  alert_id    uuid not null references alerts(id) on delete cascade,
  seq         integer not null,
  question    text not null,                     -- Ink 2 transcript of the neurologist's turn
  answer      text not null,                     -- what Sonic read (fallback phrase included)
  known       boolean not null,                  -- false → fallback phrase was used
  evidence    jsonb not null default '[]',       -- validated QuoteRef[] (docs/03 §2)
  ms          integer,                           -- turn.end → first audio chunk sent
  created_at  timestamptz not null default now(),
  unique (alert_id, seq)
);

-- Read-only access for the web app's anon key (private demo; keys are never public).
alter table calls        enable row level security;
alter table utterances   enable row level security;
alter table case_states  enable row level security;
alter table alerts       enable row level security;
alter table qa_turns     enable row level security;
create policy anon_read_calls       on calls       for select to anon using (true);
create policy anon_read_utterances  on utterances  for select to anon using (true);
create policy anon_read_case_states on case_states for select to anon using (true);
create policy anon_read_alerts      on alerts      for select to anon using (true);
create policy anon_read_qa_turns    on qa_turns    for select to anon using (true);
-- The service role bypasses RLS; no insert/update policies are needed for anon.

-- updated_at maintenance
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger case_states_touch before update on case_states for each row execute function touch_updated_at();
create trigger alerts_touch      before update on alerts      for each row execute function touch_updated_at();
```

## 2. Write rules (gateway `store/repo.ts`)

| Event | Write |
| --- | --- |
| Webhook / browser start | `insert calls` |
| `turn.end` | `insert utterances` (seq from the in-memory counter) |
| Any state change | `upsert case_states` with `version = state.version` — write-through, fire-and-forget with error logging; the in-memory `CaseState` remains the source of truth during the call |
| Approve | `insert alerts` (`queued`) then `update` on each status change |
| Q&A answer | `insert qa_turns` |
| Stream `stop` | `update calls set ended_at, status='ended'` |
| Unhandled error in a call | `update case_states set last_error` and `calls.last_error` |

Writes never block the audio path: `repo.*` functions return promises that the call runner does not await inside frame handlers; failures are logged with `event: "store.error"` and the call continues.

## 3. Read rules (web)

- `GET /api/calls` (gateway) → recent 20 calls with `status`, `started_at`, `caller_number` masked to last 4 digits, current level.
- `GET /api/calls/:id` → `{call, utterances, state, alerts}` — from memory when the call is live, from Supabase otherwise.
- `GET /api/alerts?sinceHours=24` → board initial load.
- The web app may also query Supabase directly with the anon key for history pages (not on the demo path).

## 4. Retention

Everything is deleted at the end of the event (task M-07: `truncate calls cascade`). No audio is ever stored. The eval runner writes nothing to the database (its results go to `apps/eval/results/`).

## 5. Identifiers and time

- `callId`, `alertId`, `utteranceId`: uuid v4 generated by the gateway (`crypto.randomUUID()`), never by Twilio IDs, so browser mode and eval mode work identically.
- All timestamps in the database are `timestamptz` (UTC). Call-relative times are integer milliseconds from `calls.stream_started_at` (`t_start_ms`), displayed as `mm:ss`; the absolute time of an utterance is `stream_started_at + t_start_ms`.
- LKW arithmetic uses `calls.timezone` (default `CALL_TIMEZONE`) via luxon; the stored `lkwAt` is ISO-8601 with offset.
