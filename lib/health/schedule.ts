/**
 * When a medicine that isn't taken daily is next due.
 *
 * The pill tracker scores daily medicines. A 28- or 30-day injection has a real
 * schedule too, but a different question attached to it: not "did I take it
 * today" but "when is the next one". This works that out from the frequency
 * text already recorded against the medicine.
 */

export type IntervalUnit = 'day' | 'week' | 'month'

export interface Interval {
  unit: IntervalUnit
  count: number
}

const WORDS: Record<string, Interval> = {
  daily: { unit: 'day', count: 1 },
  weekly: { unit: 'week', count: 1 },
  fortnightly: { unit: 'week', count: 2 },
  monthly: { unit: 'month', count: 1 },
  quarterly: { unit: 'month', count: 3 },
  yearly: { unit: 'month', count: 12 },
  annually: { unit: 'month', count: 12 },
}

/**
 * Reads "every 30 days", "every 2 weeks", "monthly" and so on.
 *
 * Returns null when the text states no schedule — a rescue spray taken when
 * needed has no next dose, and inventing one would put a due date on the
 * screen that means nothing.
 */
export function parseInterval(frequency: string | null | undefined): Interval | null {
  const f = (frequency ?? '').toLowerCase()
  if (!f.trim()) return null

  // "as needed" has no schedule, whatever else the text says.
  if (/\b(as needed|as required|when needed|when required|prn|if needed|only if)\b/.test(f)) {
    return null
  }

  const every = f.match(/\bevery\s+(\d+)\s*(day|week|month)s?\b/)
  if (every) return { unit: every[2] as IntervalUnit, count: Number(every[1]) }

  // "every other day" / "alternate days"
  if (/\bevery other day\b|\balternate days\b/.test(f)) return { unit: 'day', count: 2 }

  // "every month", "every week" — no number.
  const bare = f.match(/\bevery\s+(day|week|month)\b/)
  if (bare) return { unit: bare[1] as IntervalUnit, count: 1 }

  for (const [word, interval] of Object.entries(WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(f)) return interval
  }
  return null
}

/**
 * Adds an interval to a date.
 *
 * Months are added by calendar rather than as 30 days, because "monthly" means
 * the same date next month. Days and weeks are exact. A 31st that has no
 * counterpart lands on the last day of the shorter month rather than spilling
 * into the next one.
 */
export function addInterval(date: string, interval: Interval): string {
  const [y, m, d] = date.split('-').map(Number)
  if (interval.unit === 'month') {
    const target = new Date(Date.UTC(y, m - 1 + interval.count, 1))
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
    target.setUTCDate(Math.min(d, lastDay))
    return target.toISOString().slice(0, 10)
  }
  const days = interval.unit === 'week' ? interval.count * 7 : interval.count
  const out = new Date(Date.UTC(y, m - 1, d + days))
  return out.toISOString().slice(0, 10)
}

export interface DoseStatus {
  /** The last date it was recorded as taken, if ever. */
  lastTaken: string | null
  /** When the next one is due. Null when there is no schedule or no first dose. */
  nextDue: string | null
  interval: Interval | null
  /** Negative when overdue, 0 when due today. Null when nextDue is null. */
  daysUntilDue: number | null
  state: 'never-taken' | 'no-schedule' | 'due-today' | 'overdue' | 'scheduled'
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

/**
 * Where a medicine stands today.
 *
 * `takenDates` is every date it was recorded, in any order; the latest is what
 * counts. Passing today in explicitly rather than reading the clock keeps this
 * testable and keeps it on the user's calendar day rather than UTC's.
 */
export function doseStatus(
  frequency: string | null | undefined,
  takenDates: string[],
  today: string,
): DoseStatus {
  const interval = parseInterval(frequency)
  const lastTaken = takenDates.length > 0 ? [...takenDates].sort().pop()! : null

  if (!interval) {
    return { lastTaken, nextDue: null, interval: null, daysUntilDue: null, state: 'no-schedule' }
  }
  if (!lastTaken) {
    // A schedule with nothing recorded yet cannot say when the next is due —
    // "due today" would be a guess dressed as a fact.
    return { lastTaken: null, nextDue: null, interval, daysUntilDue: null, state: 'never-taken' }
  }

  const nextDue = addInterval(lastTaken, interval)
  const daysUntilDue = daysBetween(today, nextDue)
  return {
    lastTaken,
    nextDue,
    interval,
    daysUntilDue,
    state: daysUntilDue < 0 ? 'overdue' : daysUntilDue === 0 ? 'due-today' : 'scheduled',
  }
}

/** Plain-English summary of a dose status. */
export function describeDose(s: DoseStatus): string {
  if (s.state === 'no-schedule') {
    return s.lastTaken ? `Last taken ${s.lastTaken}` : 'Taken when needed'
  }
  if (s.state === 'never-taken') return 'No doses recorded yet'
  if (s.state === 'due-today') return 'Due today'
  if (s.state === 'overdue') {
    const n = Math.abs(s.daysUntilDue!)
    return `Overdue by ${n} day${n === 1 ? '' : 's'}`
  }
  return `Due in ${s.daysUntilDue} day${s.daysUntilDue === 1 ? '' : 's'}`
}

/** The gaps between consecutive doses, for showing whether a schedule is kept. */
export function doseIntervals(takenDates: string[]): { date: string; gapDays: number | null }[] {
  const sorted = [...new Set(takenDates)].sort()
  return sorted.map((date, i) => ({
    date,
    gapDays: i === 0 ? null : daysBetween(sorted[i - 1], date),
  }))
}
