-- The pill tracker counted every active medicine as a daily dose, which is
-- wrong for two real cases: Nitrolingual is a GTN spray taken only when needed,
-- and alirocumab is injected once every 28 days. Both were being scored as
-- missed doses on every other day, dragging adherence down for no reason.
--
--   daily     — expected every day; counts toward adherence
--   as_needed — taken when required; never counts as missed
--   periodic  — a real schedule but not daily (e.g. 28-day injection)
--
-- Only 'daily' medicines form the adherence denominator.

alter table health_medicines
  add column if not exists adherence_mode text not null default 'daily';

alter table health_medicines
  drop constraint if exists health_medicines_adherence_mode_check;
alter table health_medicines
  add constraint health_medicines_adherence_mode_check
  check (adherence_mode in ('daily', 'as_needed', 'periodic'));

update health_medicines set adherence_mode = 'as_needed'
  where name ilike '%nitrolingual%' or name ilike '%gtn%' or name ilike '%glyceryl trinitrate%';

update health_medicines set adherence_mode = 'periodic'
  where name ilike '%alirocumab%' or name ilike '%praluent%' or name ilike '%evolocumab%';

-- Nustendi was only started on 1 August 2026, so it must not count before then.
update health_medicines set start_date = '2026-08-01'
  where name ilike '%nustendi%' and start_date is null;
