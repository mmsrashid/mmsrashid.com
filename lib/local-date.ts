/**
 * Today's calendar date where the user is, as YYYY-MM-DD.
 *
 * `new Date().toISOString().slice(0, 10)` is UTC, which is not the same day the
 * user is looking at. In British Summer Time (UTC+1) anything between 00:00 and
 * 01:00 local still reports yesterday's date — so a pill ticked just after
 * midnight was recorded against the wrong day, making yesterday look compliant
 * and today look missed.
 *
 * Always derive a calendar day from local parts. The same mistake, in reverse,
 * already bit `parse-pill-csv.ts`.
 */
export function localToday(): string {
  return toLocalDate(new Date())
}

/** A Date's calendar day in the local timezone, as YYYY-MM-DD. */
export function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** N days before today, as a local YYYY-MM-DD. */
export function localDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return toLocalDate(d)
}
