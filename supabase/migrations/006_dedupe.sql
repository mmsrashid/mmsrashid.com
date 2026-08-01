-- Re-uploading the same document duplicated everything, because medicines and
-- blood results both inserted unconditionally. Collapse what is already there,
-- then make the duplication impossible at the database level.

-- Keep the richest row per active medicine name: most fields populated wins,
-- newest breaks the tie.
with ranked as (
  select id,
    row_number() over (
      partition by user_id, lower(trim(name))
      order by
        (
          (case when dose               is not null then 1 else 0 end) +
          (case when dose_unit          is not null then 1 else 0 end) +
          (case when frequency          is not null then 1 else 0 end) +
          (case when route              is not null then 1 else 0 end) +
          (case when start_date         is not null then 1 else 0 end) +
          (case when prescribing_doctor is not null then 1 else 0 end)
        ) desc,
        created_at desc
    ) as rn
  from health_medicines
  where status = 'active'
)
delete from health_medicines where id in (select id from ranked where rn > 1);

-- One active row per drug name per user. Stopped medicines are exempt so a
-- restarted drug can coexist with its historical record.
create unique index if not exists health_medicines_active_name_unique
  on health_medicines (user_id, lower(trim(name)))
  where status = 'active';

-- One reading per marker per date; keep the newest if a panel was uploaded twice.
with ranked as (
  select id,
    row_number() over (
      partition by user_id, marker_id, test_date
      order by created_at desc
    ) as rn
  from health_blood_results
)
delete from health_blood_results where id in (select id from ranked where rn > 1);

alter table health_blood_results
  drop constraint if exists health_blood_results_reading_unique;
alter table health_blood_results
  add constraint health_blood_results_reading_unique
  unique (user_id, marker_id, test_date);
