import {
  parseInterval, addInterval, doseStatus, describeDose, doseIntervals,
} from '@/lib/health/schedule'

describe('parseInterval', () => {
  it('reads an explicit day interval', () => {
    expect(parseInterval('one injection every 30 days')).toEqual({ unit: 'day', count: 30 })
    expect(parseInterval('every 28 days')).toEqual({ unit: 'day', count: 28 })
  })

  it('reads weeks and months', () => {
    expect(parseInterval('every 2 weeks')).toEqual({ unit: 'week', count: 2 })
    expect(parseInterval('every 3 months')).toEqual({ unit: 'month', count: 3 })
    expect(parseInterval('every month')).toEqual({ unit: 'month', count: 1 })
  })

  it('reads the common words', () => {
    expect(parseInterval('weekly')).toEqual({ unit: 'week', count: 1 })
    expect(parseInterval('fortnightly')).toEqual({ unit: 'week', count: 2 })
    expect(parseInterval('monthly')).toEqual({ unit: 'month', count: 1 })
    expect(parseInterval('every other day')).toEqual({ unit: 'day', count: 2 })
  })

  it('gives no schedule for as-needed medicines', () => {
    // A rescue spray has no next dose. Inventing one would put a due date on
    // screen that means nothing.
    expect(parseInterval('ONE spray to TWO sprays as needed')).toBeNull()
    expect(parseInterval('PRN')).toBeNull()
  })

  it('gives no schedule for empty or unrecognised text', () => {
    expect(parseInterval('')).toBeNull()
    expect(parseInterval(null)).toBeNull()
    expect(parseInterval(undefined)).toBeNull()
    expect(parseInterval('take with food')).toBeNull()
  })

  it('prefers the explicit interval over a stray word', () => {
    expect(parseInterval('monthly review, inject every 30 days'))
      .toEqual({ unit: 'day', count: 30 })
  })
})

describe('addInterval', () => {
  it('adds days exactly', () => {
    expect(addInterval('2026-09-15', { unit: 'day', count: 30 })).toBe('2026-10-15')
    expect(addInterval('2026-09-15', { unit: 'day', count: 28 })).toBe('2026-10-13')
  })

  it('adds weeks as seven days', () => {
    expect(addInterval('2026-09-15', { unit: 'week', count: 2 })).toBe('2026-09-29')
  })

  it('adds months by calendar, not as 30 days', () => {
    // "Monthly" means the same date next month, which February makes obvious.
    expect(addInterval('2026-01-31', { unit: 'month', count: 1 })).toBe('2026-02-28')
    expect(addInterval('2026-02-15', { unit: 'month', count: 1 })).toBe('2026-03-15')
  })

  it('handles a leap year', () => {
    expect(addInterval('2024-01-31', { unit: 'month', count: 1 })).toBe('2024-02-29')
  })

  it('crosses a year boundary', () => {
    expect(addInterval('2026-12-20', { unit: 'day', count: 30 })).toBe('2027-01-19')
  })
})

describe('doseStatus', () => {
  const EVERY_30 = 'one injection every 30 days'

  it('counts from the LAST dose, whatever order the dates arrive in', () => {
    const s = doseStatus(EVERY_30, ['2026-06-17', '2026-08-16', '2026-07-17'], '2026-09-15')
    expect(s.lastTaken).toBe('2026-08-16')
    expect(s.nextDue).toBe('2026-09-15')
    expect(s.state).toBe('due-today')
  })

  it('reports how many days until the next one', () => {
    const s = doseStatus(EVERY_30, ['2026-09-01'], '2026-09-15')
    expect(s.nextDue).toBe('2026-10-01')
    expect(s.daysUntilDue).toBe(16)
    expect(s.state).toBe('scheduled')
    expect(describeDose(s)).toBe('Due in 16 days')
  })

  it('reports overdue as a negative count', () => {
    const s = doseStatus(EVERY_30, ['2026-07-01'], '2026-09-15')
    expect(s.nextDue).toBe('2026-07-31')
    expect(s.daysUntilDue).toBe(-46)
    expect(s.state).toBe('overdue')
    expect(describeDose(s)).toBe('Overdue by 46 days')
  })

  it('will not guess a due date when nothing has been recorded', () => {
    // "Due today" with no history would be a guess presented as a fact.
    const s = doseStatus(EVERY_30, [], '2026-09-15')
    expect(s.nextDue).toBeNull()
    expect(s.state).toBe('never-taken')
    expect(describeDose(s)).toBe('No doses recorded yet')
  })

  it('gives an as-needed medicine no due date but keeps its last use', () => {
    const s = doseStatus('TWO sprays as needed', ['2026-09-02'], '2026-09-15')
    expect(s.nextDue).toBeNull()
    expect(s.state).toBe('no-schedule')
    expect(describeDose(s)).toBe('Last taken 2026-09-02')
  })

  it('says "due today" exactly on the day', () => {
    const s = doseStatus(EVERY_30, ['2026-08-16'], '2026-09-15')
    expect(describeDose(s)).toBe('Due today')
  })

  it('uses the singular for one day', () => {
    expect(describeDose(doseStatus(EVERY_30, ['2026-08-17'], '2026-09-15')))
      .toBe('Due in 1 day')
    expect(describeDose(doseStatus(EVERY_30, ['2026-08-15'], '2026-09-15')))
      .toBe('Overdue by 1 day')
  })
})

describe('doseIntervals', () => {
  it('reports the gap between consecutive doses', () => {
    // Shows whether a 30-day schedule is actually being kept.
    expect(doseIntervals(['2026-07-17', '2026-06-17', '2026-08-16'])).toEqual([
      { date: '2026-06-17', gapDays: null },
      { date: '2026-07-17', gapDays: 30 },
      { date: '2026-08-16', gapDays: 30 },
    ])
  })

  it('ignores a duplicate date', () => {
    expect(doseIntervals(['2026-06-17', '2026-06-17'])).toEqual([
      { date: '2026-06-17', gapDays: null },
    ])
  })

  it('returns nothing for no doses', () => {
    expect(doseIntervals([])).toEqual([])
  })
})
