-- 004 gave health_blood_markers a SELECT policy only, so with RLS enabled no
-- insert could ever succeed. That silently blocked both
-- POST /api/health/blood/markers and JARVIS's add_blood_marker tool.
--
-- The catalogue is deliberately shared rather than per-user: markers are
-- reference data, and blood results point at them by id. Any signed-in user may
-- therefore add to it, but nobody may edit or remove existing entries, so one
-- user cannot break another user's stored results.

drop policy if exists "add markers" on health_blood_markers;
create policy "add markers" on health_blood_markers
  for insert to authenticated
  with check (true);

insert into health_blood_markers (name, short_name, category, unit, ref_low, ref_high) values
('High Sensitivity Troponin I','hs-TnI','Inflammatory','ng/L',null,34),
('Troponin I','TnI','Inflammatory','ng/L',null,34)
on conflict (name) do nothing;
