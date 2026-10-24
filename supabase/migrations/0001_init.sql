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
