-- Sleep, nutrition and exercise are lifestyle logs, not lab panels. They get
-- their own tables and top-level tabs; the biomarkers that were parked under
-- those category names move to their clinically conventional groups.

-- One row per night.
create table if not exists health_sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sleep_date date not null,
  total_hours numeric,
  quality_score int check (quality_score between 0 and 100),
  bedtime time,
  wake_time time,
  notes text,
  created_at timestamptz not null default now(),
  unique(user_id, sleep_date)
);

-- One aggregate row per day.
create table if not exists health_nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  calories int,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  water_ml int,
  notes text,
  created_at timestamptz not null default now(),
  unique(user_id, log_date)
);

-- Multiple sessions per day are expected, so no uniqueness on the date.
create table if not exists health_exercise_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_date date not null,
  activity_type text not null,
  duration_min int,
  intensity text check (intensity in ('low','moderate','high')),
  distance_km numeric,
  avg_heart_rate int,
  notes text,
  created_at timestamptz not null default now()
);

alter table health_sleep_logs     enable row level security;
alter table health_nutrition_logs enable row level security;
alter table health_exercise_logs  enable row level security;

drop policy if exists "own sleep logs"     on health_sleep_logs;
drop policy if exists "own nutrition logs" on health_nutrition_logs;
drop policy if exists "own exercise logs"  on health_exercise_logs;

create policy "own sleep logs" on health_sleep_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own nutrition logs" on health_nutrition_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own exercise logs" on health_exercise_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists health_sleep_logs_user_date     on health_sleep_logs(user_id, sleep_date desc);
create index if not exists health_nutrition_logs_user_date on health_nutrition_logs(user_id, log_date desc);
create index if not exists health_exercise_logs_user_date  on health_exercise_logs(user_id, exercise_date desc);

-- Reclassify the six markers that were filed under lifestyle category names.
update health_blood_markers set category = 'Hormones'
  where name in ('Melatonin AM', 'Melatonin PM');

update health_blood_markers set category = 'Vitamins & Minerals'
  where name in ('Omega-3 Index', 'Coenzyme Q10', 'Vitamin C');

update health_blood_markers set category = 'Metabolic'
  where name in ('Lactate Dehydrogenase', 'Creatine Kinase');
