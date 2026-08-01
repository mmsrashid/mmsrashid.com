import type { BloodMarker } from './types'

/**
 * Common lab-report spellings that don't match our catalogue names or short
 * names directly. Keys are normalised; values are the canonical marker name.
 */
const ALIASES: Record<string, string> = {
  hb: 'Haemoglobin',
  hemoglobin: 'Haemoglobin',
  haemoglobin: 'Haemoglobin',
  wbc: 'White Blood Cells',
  whitecellcount: 'White Blood Cells',
  leukocytes: 'White Blood Cells',
  rbc: 'Red Blood Cells',
  redcellcount: 'Red Blood Cells',
  erythrocytes: 'Red Blood Cells',
  plt: 'Platelets',
  plateletcount: 'Platelets',
  hct: 'Haematocrit',
  hematocrit: 'Haematocrit',
  pcv: 'Haematocrit',
  mcv: 'Mean Cell Volume',
  meancorpuscularvolume: 'Mean Cell Volume',
  alt: 'ALT',
  alanineaminotransferase: 'ALT',
  alaninetransaminase: 'ALT',
  alaninetransferase: 'ALT',
  alataminotransferase: 'ALT',
  sgpt: 'ALT',
  ast: 'AST',
  aspartateaminotransferase: 'AST',
  aspartatetransaminase: 'AST',
  aspartatetransferase: 'AST',
  sgot: 'AST',
  alp: 'ALP',
  alkalinephosphatase: 'ALP',
  alkphos: 'ALP',
  ggt: 'GGT',
  gammagt: 'GGT',
  gammaglutamyltransferase: 'GGT',
  gammaglutamyltransaminase: 'GGT',
  gammaglutamyltranspeptidase: 'GGT',
  ggtp: 'GGT',
  bilirubin: 'Bilirubin Total',
  totalbilirubin: 'Bilirubin Total',
  tsh: 'TSH',
  thyroidstimulatinghormone: 'TSH',
  ft4: 'Free T4',
  freethyroxine: 'Free T4',
  t4free: 'Free T4',
  ft3: 'Free T3',
  freetriiodothyronine: 'Free T3',
  t3free: 'Free T3',
  cholesterol: 'Total Cholesterol',
  totalcholesterol: 'Total Cholesterol',
  ldl: 'LDL Cholesterol',
  ldlc: 'LDL Cholesterol',
  hdl: 'HDL Cholesterol',
  hdlc: 'HDL Cholesterol',
  nonhdl: 'Non-HDL Cholesterol',
  triglyceride: 'Triglycerides',
  tg: 'Triglycerides',
  glucose: 'Glucose Fasting',
  fastingglucose: 'Glucose Fasting',
  fastingbloodglucose: 'Glucose Fasting',
  hba1c: 'HbA1c',
  glycatedhaemoglobin: 'HbA1c',
  egfr: 'eGFR',
  creatinine: 'Creatinine',
  urea: 'Urea',
  bun: 'Urea',
  uricacid: 'Uric Acid',
  sodium: 'Sodium',
  na: 'Sodium',
  potassium: 'Potassium',
  k: 'Potassium',
  vitamind: 'Vitamin D',
  vitd: 'Vitamin D',
  '25ohvitamind': 'Vitamin D',
  '25hydroxyvitamind': 'Vitamin D',
  vitaminb12: 'Vitamin B12',
  b12: 'Vitamin B12',
  cobalamin: 'Vitamin B12',
  folate: 'Folate',
  folicacid: 'Folate',
  ferritin: 'Ferritin',
  iron: 'Iron',
  serumiron: 'Iron',
  transferrinsaturation: 'Transferrin Saturation',
  tsat: 'Transferrin Saturation',
  magnesium: 'Magnesium',
  zinc: 'Zinc',
  testosterone: 'Testosterone Total',
  totaltestosterone: 'Testosterone Total',
  freetestosterone: 'Free Testosterone',
  shbg: 'SHBG',
  sexhormonebindingglobulin: 'SHBG',
  lh: 'LH',
  luteinisinghormone: 'LH',
  fsh: 'FSH',
  folliclestimulatinghormone: 'FSH',
  oestradiol: 'Oestradiol',
  estradiol: 'Oestradiol',
  e2: 'Oestradiol',
  dheas: 'DHEA-S',
  dheasulphate: 'DHEA-S',
  cortisol: 'Cortisol AM',
  prolactin: 'Prolactin',
  igf1: 'IGF-1',
  crp: 'CRP',
  creactiveprotein: 'CRP',
  hscrp: 'CRP',
  esr: 'ESR',
  homocysteine: 'Homocysteine',
  omega3index: 'Omega-3 Index',
  omega3: 'Omega-3 Index',
  coq10: 'Coenzyme Q10',
  coenzymeq10: 'Coenzyme Q10',
  ubiquinone: 'Coenzyme Q10',
  vitaminc: 'Vitamin C',
  ascorbicacid: 'Vitamin C',
  ldh: 'Lactate Dehydrogenase',
  lactatedehydrogenase: 'Lactate Dehydrogenase',
  ck: 'Creatine Kinase',
  cpk: 'Creatine Kinase',
  creatinekinase: 'Creatine Kinase',
  lpa: 'Lipoprotein (a)',
  lipoproteina: 'Lipoprotein (a)',
  lipoproteinlittlea: 'Lipoprotein (a)',
  apob: 'Apolipoprotein B',
  apolipoproteinb: 'Apolipoprotein B',
  apob100: 'Apolipoprotein B',
  apoa1: 'Apolipoprotein A1',
  apolipoproteina1: 'Apolipoprotein A1',
  cholesterolhdlratio: 'Cholesterol HDL Ratio',
  tchdlratio: 'Cholesterol HDL Ratio',
  cholhdlratio: 'Cholesterol HDL Ratio',
  mch: 'Mean Cell Haemoglobin',
  meancorpuscularhaemoglobin: 'Mean Cell Haemoglobin',
  mchc: 'Mean Cell Haemoglobin Concentration',
  meancorpuscularhaemoglobinconcentration: 'Mean Cell Haemoglobin Concentration',
  rdw: 'Red Cell Distribution Width',
  redcelldistributionwidth: 'Red Cell Distribution Width',
  eos: 'Eosinophils',
  eosinophil: 'Eosinophils',
  baso: 'Basophils',
  basophil: 'Basophils',
  correctedcalcium: 'Adjusted Calcium',
  calciumadjusted: 'Adjusted Calcium',
  calciumcorrected: 'Adjusted Calcium',
  inorganicphosphate: 'Phosphate',
  po4: 'Phosphate',
  serumphosphate: 'Phosphate',
  co2: 'Bicarbonate',
  totalco2: 'Bicarbonate',
  hco3: 'Bicarbonate',
  totalprotein: 'Total Protein',
  serumtotalprotein: 'Total Protein',
  conjugatedbilirubin: 'Bilirubin Direct',
  directbilirubin: 'Bilirubin Direct',
  ntprobnp: 'NT-proBNP',
  probnp: 'NT-proBNP',
  bnp: 'NT-proBNP',
  troponint: 'Troponin T',
  hstroponint: 'Troponin T',
  tnt: 'Troponin T',
  troponini: 'High Sensitivity Troponin I',
  hstroponini: 'High Sensitivity Troponin I',
  highsensitivitytroponini: 'High Sensitivity Troponin I',
  hstni: 'High Sensitivity Troponin I',
  tni: 'High Sensitivity Troponin I',
  insulin: 'Insulin Fasting',
  fastinginsulin: 'Insulin Fasting',
  cpeptide: 'C-Peptide',
  tpoab: 'Thyroid Peroxidase Antibodies',
  tpoantibodies: 'Thyroid Peroxidase Antibodies',
  antitpo: 'Thyroid Peroxidase Antibodies',
  thyroidperoxidaseantibody: 'Thyroid Peroxidase Antibodies',
}

/** Lowercase and drop everything that isn't a letter or digit. */
export function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export interface MarkerResolver {
  resolve(name: string): BloodMarker | null
}

/**
 * Build a resolver over the marker catalogue. Tries, in order: exact
 * normalised name, short name, alias table, then a containment match — so
 * "Serum Ferritin (Fe)" still lands on Ferritin.
 */
export function buildMarkerResolver(markers: BloodMarker[]): MarkerResolver {
  const byName = new Map<string, BloodMarker>()
  const byShort = new Map<string, BloodMarker>()

  for (const m of markers) {
    byName.set(normalise(m.name), m)
    if (m.short_name) {
      const k = normalise(m.short_name)
      // Don't let a short name shadow a real marker name (e.g. "K").
      if (!byShort.has(k)) byShort.set(k, m)
    }
  }

  return {
    resolve(raw: string): BloodMarker | null {
      if (!raw) return null

      const lookup = (key: string): BloodMarker | null => {
        if (!key) return null
        const direct = byName.get(key) ?? byShort.get(key)
        if (direct) return direct
        const aliased = ALIASES[key]
        return aliased ? byName.get(normalise(aliased)) ?? null : null
      }

      // Lab reports pad names with parentheticals ("Hemoglobin (Hb)") and often
      // print two names for the same analyte ("Alanine Transaminase / Alanine
      // Transferase"). Try the whole string, the part outside the brackets, the
      // part inside, and each alternative on its own.
      const alternatives = raw.split(/\s*(?:\/|,|\bor\b)\s*/i)
      const candidates = [
        raw,
        raw.replace(/\([^)]*\)/g, ''),
        ...(raw.match(/\(([^)]*)\)/g) ?? []),
        ...alternatives,
        ...alternatives.map(a => a.replace(/\([^)]*\)/g, '')),
      ]
        .map(normalise)
        .filter(Boolean)

      for (const c of candidates) {
        const hit = lookup(c)
        if (hit) return hit
      }

      // Longest known key contained in the input wins, so a more specific
      // marker beats a shorter substring of it.
      const n = candidates[0]
      if (!n) return null
      let best: BloodMarker | null = null
      let bestLen = 0
      const consider = (key: string, m: BloodMarker | null) => {
        if (m && key.length > 2 && key.length > bestLen && n.includes(key)) {
          best = m
          bestLen = key.length
        }
      }
      for (const [key, m] of byName) consider(key, m)
      for (const key of Object.keys(ALIASES)) consider(key, lookup(key))
      return best
    },
  }
}
