-- Vitals live in their own table rather than alongside blood markers: they are
-- measured at a time of day rather than on a test date, arrive in bursts from a
-- device, and a blood pressure is a pair of numbers rather than a single value.
--
-- Blood pressure and heart rate are typed columns because they are charted and
-- filtered. Everything else a watch might report — SpO2, HRV, resting rate,
-- respiratory rate, skin temperature, steps — goes in `metrics` as JSONB, so a
-- sync can start writing new fields without a migration. Anything that turns
-- out to be charted regularly can be promoted to a column later.

create table if not exists health_vitals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_at timestamptz not null,

  systolic int check (systolic between 40 and 300),
  diastolic int check (diastolic between 20 and 200),
  heart_rate int check (heart_rate between 20 and 250),

  metrics jsonb not null default '{}'::jsonb,
  source text not null default 'manual' check (source in ('manual', 'device', 'clinic', 'import')),
  notes text,
  created_at timestamptz not null default now(),

  -- One reading per instant per source, so re-running an import updates rather
  -- than duplicating.
  unique (user_id, measured_at, source)
);

alter table health_vitals enable row level security;

drop policy if exists "own vitals" on health_vitals;
create policy "own vitals" on health_vitals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists health_vitals_user_time on health_vitals(user_id, measured_at desc);
