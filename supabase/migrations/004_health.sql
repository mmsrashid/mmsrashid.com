create table if not exists health_appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  appointment_date timestamptz not null,
  appointment_type text not null,
  doctor_name text,
  clinic_name text,
  status text not null default 'upcoming' check (status in ('upcoming','completed','cancelled')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists health_medicines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  dose numeric,
  dose_unit text,
  frequency text,
  route text,
  start_date date,
  end_date date,
  prescribing_doctor text,
  status text not null default 'active' check (status in ('active','stopped')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists health_blood_markers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_name text,
  category text not null,
  unit text,
  ref_low numeric,
  ref_high numeric,
  description text
);

create table if not exists health_blood_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  marker_id uuid not null references health_blood_markers(id),
  value numeric not null,
  test_date date not null,
  lab_name text,
  document_id uuid,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists health_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('blood_result','letter','scan','prescription','other')),
  storage_path text not null,
  file_size_bytes bigint,
  extracted_marker_count int default 0,
  tags text[] default '{}',
  created_at timestamptz not null default now()
);

create table if not exists health_pill_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  medicine_id uuid not null references health_medicines(id) on delete cascade,
  log_date date not null,
  taken boolean not null default false,
  taken_at text,
  created_at timestamptz not null default now(),
  unique(user_id, medicine_id, log_date)
);

alter table health_appointments enable row level security;
alter table health_medicines enable row level security;
alter table health_blood_markers enable row level security;
alter table health_blood_results enable row level security;
alter table health_documents enable row level security;
alter table health_pill_logs enable row level security;

drop policy if exists "own appointments" on health_appointments;
drop policy if exists "own medicines" on health_medicines;
drop policy if exists "read markers" on health_blood_markers;
drop policy if exists "own results" on health_blood_results;
drop policy if exists "own documents" on health_documents;
drop policy if exists "own pill logs" on health_pill_logs;

create policy "own appointments" on health_appointments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own medicines" on health_medicines for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "read markers" on health_blood_markers for select using (true);
create policy "own results" on health_blood_results for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own documents" on health_documents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own pill logs" on health_pill_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into health_blood_markers (name, short_name, category, unit, ref_low, ref_high) values
('Haemoglobin','Hb','Full Blood Count','g/L',130,170),
('White Blood Cells','WBC','Full Blood Count','x10^9/L',4,11),
('Platelets','PLT','Full Blood Count','x10^9/L',150,400),
('Red Blood Cells','RBC','Full Blood Count','x10^12/L',4.5,5.5),
('Haematocrit','HCT','Full Blood Count','%',40,52),
('Mean Cell Volume','MCV','Full Blood Count','fL',80,100),
('Neutrophils','NEUT','Full Blood Count','x10^9/L',1.8,7.5),
('Lymphocytes','LYMPH','Full Blood Count','x10^9/L',1,4),
('Monocytes','MONO','Full Blood Count','x10^9/L',0.2,1),
('ALT','ALT','Liver Function','U/L',7,56),
('AST','AST','Liver Function','U/L',10,40),
('ALP','ALP','Liver Function','U/L',44,147),
('GGT','GGT','Liver Function','U/L',8,61),
('Bilirubin Total','BILI','Liver Function','umol/L',3,20),
('Albumin','ALB','Liver Function','g/L',35,50),
('TSH','TSH','Thyroid','mU/L',0.4,4),
('Free T4','FT4','Thyroid','pmol/L',9,25),
('Free T3','FT3','Thyroid','pmol/L',3.5,6.5),
('Total Cholesterol','TC','Lipids','mmol/L',null,5),
('LDL Cholesterol','LDL','Lipids','mmol/L',null,3),
('HDL Cholesterol','HDL','Lipids','mmol/L',1.2,null),
('Triglycerides','TG','Lipids','mmol/L',null,1.7),
('Non-HDL Cholesterol','Non-HDL','Lipids','mmol/L',null,4),
('Glucose Fasting','Gluc','Metabolic','mmol/L',3.9,5.6),
('HbA1c','HbA1c','Metabolic','mmol/mol',null,42),
('eGFR','eGFR','Metabolic','mL/min/1.73m2',60,null),
('Creatinine','CREAT','Metabolic','umol/L',62,106),
('Urea','UREA','Metabolic','mmol/L',2.5,7.8),
('Uric Acid','UA','Metabolic','umol/L',200,430),
('Sodium','Na','Metabolic','mmol/L',135,145),
('Potassium','K','Metabolic','mmol/L',3.5,5.1),
('Vitamin D','VitD','Vitamins & Minerals','nmol/L',75,250),
('Vitamin B12','B12','Vitamins & Minerals','pmol/L',145,569),
('Folate','FOL','Vitamins & Minerals','nmol/L',10,null),
('Ferritin','FERR','Vitamins & Minerals','ug/L',30,400),
('Iron','Fe','Vitamins & Minerals','umol/L',11,29),
('Transferrin Saturation','TSAT','Vitamins & Minerals','%',20,55),
('Magnesium','Mg','Vitamins & Minerals','mmol/L',0.7,1.0),
('Zinc','Zn','Vitamins & Minerals','umol/L',11,18),
('Testosterone Total','TT','Hormones','nmol/L',9,29),
('Free Testosterone','FT','Hormones','pmol/L',170,670),
('SHBG','SHBG','Hormones','nmol/L',18,54),
('LH','LH','Hormones','U/L',1.7,8.6),
('FSH','FSH','Hormones','U/L',1.5,12.4),
('Oestradiol','E2','Hormones','pmol/L',null,192),
('DHEA-S','DHEAS','Hormones','umol/L',4.3,12.2),
('Cortisol AM','CORT','Hormones','nmol/L',170,540),
('Prolactin','PRL','Hormones','mU/L',86,324),
('IGF-1','IGF1','Hormones','nmol/L',11.4,30),
('CRP','CRP','Inflammatory','mg/L',null,5),
('ESR','ESR','Inflammatory','mm/hr',null,15),
('Homocysteine','HCY','Inflammatory','umol/L',null,15),
('Melatonin AM','MEL-AM','Sleep','pg/mL',null,20),
('Melatonin PM','MEL-PM','Sleep','pg/mL',80,null),
('Omega-3 Index','OM3','Nutrition','%',8,null),
('Coenzyme Q10','CoQ10','Nutrition','ug/mL',0.7,null),
('Vitamin C','VitC','Nutrition','umol/L',23,90),
('Lactate Dehydrogenase','LDH','Exercise','U/L',135,225),
('Creatine Kinase','CK','Exercise','U/L',55,170)
on conflict (name) do nothing;

-- Storage: private bucket `health-documents` must exist.
-- Upload paths are `{user_id}/{timestamp}-{filename}`.
create policy "health docs insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'health-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "health docs select own" on storage.objects for select to authenticated
  using (bucket_id = 'health-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "health docs delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'health-documents' and (storage.foldername(name))[1] = auth.uid()::text);
