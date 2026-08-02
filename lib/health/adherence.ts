import type { HealthMedicine } from './types'

export type AdherenceMode = 'daily' | 'as_needed' | 'periodic'

const AS_NEEDED = /\b(as needed|as required|when needed|when required|prn|if needed|only if)\b/i
const PERIODIC = /\b(every\s+\d+\s*(day|days|week|weeks|month|months)|weekly|fortnightly|monthly|every other day|alternate days)\b/i

/**
 * Which medicines should count toward daily adherence.
 *
 * Derived from the frequency text rather than a stored column: the strings are
 * already recorded from prescriptions ("ONE spray to TWO sprays as needed",
 * "once every 28 days") and a schema change was not available. If this ever
 * needs to be authoritative rather than inferred, add an adherence_mode column
 * and set it explicitly — see supabase/migrations/010_adherence_mode.sql.
 */
export function adherenceMode(m: Pick<HealthMedicine, 'frequency' | 'route'>): AdherenceMode {
  const f = m.frequency ?? ''
  if (AS_NEEDED.test(f)) return 'as_needed'
  if (PERIODIC.test(f)) return 'periodic'
  // A sublingual spray with no stated frequency is rescue medication, not a
  // daily dose, so don't score it as a missed day.
  if (/sublingual/i.test(m.route ?? '') && !f.trim()) return 'as_needed'
  return 'daily'
}

export const isDaily = (m: Pick<HealthMedicine, 'frequency' | 'route'>) => adherenceMode(m) === 'daily'

/**
 * A medicine only counts on a given day if it had started by then. Without this
 * a drug begun last week shows as months of missed doses.
 */
export function wasActiveOn(m: Pick<HealthMedicine, 'start_date' | 'end_date'>, date: string): boolean {
  if (m.start_date && date < m.start_date) return false
  if (m.end_date && date > m.end_date) return false
  return true
}

export const MODE_LABEL: Record<AdherenceMode, string> = {
  daily: 'Daily',
  as_needed: 'As needed',
  periodic: 'Not daily',
}
