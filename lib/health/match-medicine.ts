import { normalise } from './match-marker'

export interface MedicineRef { id: string; name: string }

/** Words that don't identify a drug but do distinguish one column from another. */
const QUALIFIERS = new Set(['morning', 'night', 'evening', 'am', 'pm', 'nocte', 'mane', 'bd', 'od'])
const NOISE = new Set(['mg', 'mcg', 'ml', 'iu', 'x1', 'x2', 'x3', 'tablet', 'tablets', 'cap', 'caps', 'dose', 'generic', 'manuf'])

const tokens = (s: string) =>
  s.toLowerCase().split(/[^a-z0-9]+/).filter(t => t && !NOISE.has(t) && !/^\d+(\.\d+)?$/.test(t))

/** Levenshtein, short-circuited on length — enough to forgive one typo. */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = cur
  }
  return prev[b.length]!
}

// A single typo in a hand-typed header shouldn't lose a year of history —
// a real tracker had "Tigagrelor" throughout for Ticagrelor.
const tokenMatch = (a: string, b: string) =>
  a === b || (a.length >= 6 && b.length >= 6 && editDistance(a, b) <= 1)

/**
 * Matches a pill-tracker column header to one of the user's medicines.
 *
 * Scores on shared drug-name tokens with one-character tolerance, and requires
 * any morning/night qualifier to agree — otherwise a twice-daily drug's two
 * columns both collapse onto whichever row matched first, silently halving the
 * recorded doses.
 */
export function buildMedicineResolver(medicines: MedicineRef[]) {
  const byNorm = new Map<string, MedicineRef>()
  for (const m of medicines) byNorm.set(normalise(m.name), m)

  return function resolve(header: string): MedicineRef | null {
    const n = normalise(header)
    if (!n) return null
    const exact = byNorm.get(n)
    if (exact) return exact

    const hTokens = tokens(header)
    const hQual = hTokens.filter(t => QUALIFIERS.has(t))

    let best: MedicineRef | null = null
    let bestScore = 0

    for (const [key, m] of byNorm) {
      const mTokens = tokens(m.name)
      const mQual = mTokens.filter(t => QUALIFIERS.has(t))

      // If both sides name a time of day, they must be the same one.
      if (hQual.length && mQual.length && !hQual.some(q => mQual.includes(q))) continue

      let score = 0
      for (const ht of hTokens) {
        if (QUALIFIERS.has(ht)) { if (mQual.includes(ht)) score += 2; continue }
        if (mTokens.some(mt => !QUALIFIERS.has(mt) && tokenMatch(ht, mt))) score += 3
      }
      if (key.length > 2 && (n.includes(key) || key.includes(n))) score += 1

      if (score > bestScore) { best = m; bestScore = score }
    }

    // Require a real drug-name hit, not a lone qualifier agreeing.
    return bestScore >= 3 ? best : null
  }
}
