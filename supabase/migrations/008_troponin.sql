-- A real upload used high-sensitivity Troponin I; only Troponin T was seeded.
-- These are different assays and not interchangeable.
--
-- 34 ng/L is the commonly used male 99th-percentile upper reference limit;
-- assay- and sex-specific cut-offs differ (around 16 ng/L for women), so treat
-- the flag as indicative rather than diagnostic.

insert into health_blood_markers (name, short_name, category, unit, ref_low, ref_high) values
('High Sensitivity Troponin I','hs-TnI','Inflammatory','ng/L',null,34),
('Troponin I','TnI','Inflammatory','ng/L',null,34)
on conflict (name) do nothing;
