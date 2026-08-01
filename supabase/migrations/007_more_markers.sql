-- Real uploads hit markers the original seed missed: Lipoprotein (a) from a
-- lipid panel, and the renal/bone and FBC analytes that UK labs report as
-- standard. Reference ranges are conventional adult values and vary by lab.
--
-- Lipoprotein (a) is deliberately left without a range: labs report it in
-- nmol/L (roughly <125 desirable) or mg/L (roughly <750), and guessing wrong
-- would put a false Normal badge on a genuinely raised value.

insert into health_blood_markers (name, short_name, category, unit, ref_low, ref_high) values
-- Lipids
('Lipoprotein (a)','Lp(a)','Lipids',null,null,null),
('Apolipoprotein B','ApoB','Lipids','g/L',null,0.9),
('Apolipoprotein A1','ApoA1','Lipids','g/L',1.1,null),
('Cholesterol HDL Ratio','TC:HDL','Lipids','ratio',null,4),
-- Full Blood Count extras
('Mean Cell Haemoglobin','MCH','Full Blood Count','pg',27,32),
('Mean Cell Haemoglobin Concentration','MCHC','Full Blood Count','g/L',320,360),
('Red Cell Distribution Width','RDW','Full Blood Count','%',11.5,14.5),
('Eosinophils','EOS','Full Blood Count','x10^9/L',0.02,0.5),
('Basophils','BASO','Full Blood Count','x10^9/L',0,0.1),
-- Renal and bone profile
('Calcium','Ca','Metabolic','mmol/L',2.2,2.6),
('Adjusted Calcium','Adj Ca','Metabolic','mmol/L',2.2,2.6),
('Phosphate','PO4','Metabolic','mmol/L',0.8,1.5),
('Chloride','Cl','Metabolic','mmol/L',98,107),
('Bicarbonate','HCO3','Metabolic','mmol/L',22,29),
('Total Protein','TP','Liver Function','g/L',60,80),
('Globulin','GLOB','Liver Function','g/L',18,36),
('Bilirubin Direct','D-BILI','Liver Function','umol/L',0,5),
-- Cardiac
('NT-proBNP','NT-proBNP','Inflammatory','ng/L',null,125),
('Troponin T','TnT','Inflammatory','ng/L',null,14),
-- Metabolic
('Insulin Fasting','INS','Metabolic','pmol/L',18,173),
('C-Peptide','CPEP','Metabolic','nmol/L',0.37,1.47),
-- Thyroid
('Thyroid Peroxidase Antibodies','TPO Ab','Thyroid','IU/mL',null,34)
on conflict (name) do nothing;

select category, count(*) as markers from health_blood_markers group by category order by category;
