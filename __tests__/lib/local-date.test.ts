import { toLocalDate, localToday, localDaysAgo } from '@/lib/local-date'

describe('toLocalDate', () => {
  it('reads the calendar day from local parts', () => {
    // Constructed from local parts, so this IS 6 August wherever the test runs.
    const d = new Date(2026, 7, 6, 12, 0, 0)
    expect(toLocalDate(d)).toBe('2026-08-06')
  })

  it('keeps the local day just after midnight', () => {
    // The bug this guards: at 00:30 local in any timezone ahead of UTC,
    // toISOString() still reports the previous day, so a pill ticked just after
    // midnight was filed against yesterday.
    const d = new Date(2026, 7, 6, 0, 30, 0)
    expect(toLocalDate(d)).toBe('2026-08-06')
  })

  it('keeps the local day just before midnight', () => {
    // The mirror case, for timezones behind UTC.
    const d = new Date(2026, 7, 6, 23, 30, 0)
    expect(toLocalDate(d)).toBe('2026-08-06')
  })

  it('zero-pads single-digit months and days', () => {
    expect(toLocalDate(new Date(2026, 0, 5, 9, 0, 0))).toBe('2026-01-05')
  })

  it('handles a month boundary', () => {
    expect(toLocalDate(new Date(2026, 6, 31, 23, 0, 0))).toBe('2026-07-31')
    expect(toLocalDate(new Date(2026, 7, 1, 1, 0, 0))).toBe('2026-08-01')
  })

  it('handles a leap day', () => {
    expect(toLocalDate(new Date(2028, 1, 29, 12, 0, 0))).toBe('2028-02-29')
  })
})

describe('localToday', () => {
  it('matches toLocalDate for now', () => {
    expect(localToday()).toBe(toLocalDate(new Date()))
  })

  it('returns a well-formed date', () => {
    expect(localToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('localDaysAgo', () => {
  it('returns today for zero', () => {
    expect(localDaysAgo(0)).toBe(localToday())
  })

  it('goes back the requested number of days', () => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    expect(localDaysAgo(7)).toBe(toLocalDate(d))
  })

  it('crosses a month boundary correctly', () => {
    const d = new Date()
    d.setDate(d.getDate() - 45)
    expect(localDaysAgo(45)).toBe(toLocalDate(d))
  })
})
