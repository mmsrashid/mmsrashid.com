import type { Period } from './property-pl'

/**
 * Spreading rent across the months it covers, for the accruals basis.
 *
 * Rent here is often paid three or six months up front, and an advance
 * straddles 5 April. Counting it all in the year it arrived — the cash basis —
 * overstates that year and understates the next. On the accruals basis it
 * belongs to the months it pays for.
 *
 * Whole months, split equally: £21,600 covering February to September is eight
 * months at £2,700, of which February and March fall in 2024/25 and April to
 * September in 2025/26. Day-count apportionment is more precise but the figures
 * stop being checkable by eye, and equal months is what a tenancy actually
 * agrees to.
 */

export interface Coverable {
  txn_date: string
  amount: number | string
  /** First day of the first month covered. Null means "the month it arrived". */
  covers_from?: string | null
  /** Any day within the last month covered. */
  covers_to?: string | null
}

export interface MonthShare {
  /** YYYY-MM */
  month: string
  amount: number
  /**
   * The date this share counts on.
   *
   * For an apportioned share it is the 15th of its month, deliberately: tax
   * years turn on the 6th, so the 1st of April sits in the OLD year while the
   * month itself belongs to the new one, and a first-of-month anchor would push
   * every April share backwards.
   *
   * For a payment with no covered period it is the payment date itself,
   * unchanged. Using a mid-month anchor there would move rent paid on 2 April
   * into the following tax year — silently reclassifying transactions that
   * nobody asked to accrue.
   */
  effectiveDate: string
}

/** Last calendar day of a YYYY-MM month, as YYYY-MM-DD. */
export function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number)
  // Day 0 of the next month is the last day of this one, and it handles leap
  // years without a table.
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${month}-${String(last).padStart(2, '0')}`
}

/** Inclusive list of YYYY-MM months between two dates. */
export function coveredMonths(from: string, to: string): string[] {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  const first = fy * 12 + (fm - 1)
  const last = ty * 12 + (tm - 1)
  if (last < first) return []

  const out: string[] = []
  for (let i = first; i <= last; i++) {
    const y = Math.floor(i / 12)
    const m = (i % 12) + 1
    out.push(`${y}-${String(m).padStart(2, '0')}`)
  }
  return out
}

/**
 * Splits one payment into its monthly shares.
 *
 * Without a covered period the payment is a single share in the month it
 * arrived, which is the existing cash behaviour — so adding this changes
 * nothing until a period is actually recorded against a transaction.
 *
 * Rounding is in pence and the remainder goes to the FIRST month, so the shares
 * always add back to the payment exactly. Silently losing a penny per month
 * would make a P&L that does not reconcile with the bank.
 */
export function apportion(txn: Coverable): MonthShare[] {
  const amount = Number(txn.amount)
  const own = txn.txn_date.slice(0, 7)

  const cash = [{ month: own, amount, effectiveDate: txn.txn_date }]
  if (!txn.covers_from || !txn.covers_to) return cash

  const months = coveredMonths(txn.covers_from, txn.covers_to)
  // A backwards period is bad data. Fall back to the cash treatment rather than
  // dropping the money out of the P&L entirely.
  if (months.length === 0) return cash

  const totalPence = Math.round(amount * 100)
  const base = Math.trunc(totalPence / months.length)
  const remainder = totalPence - base * months.length

  return months.map((month, i) => ({
    month,
    amount: (base + (i === 0 ? remainder : 0)) / 100,
    effectiveDate: `${month}-15`,
  }))
}

/** The part of a payment that falls inside a period, once apportioned. */
export function accruedInPeriod(txn: Coverable, period: Period): number {
  return apportion(txn)
    .filter(s => s.effectiveDate >= period.from && s.effectiveDate <= period.to)
    .reduce((sum, s) => sum + s.amount, 0)
}

/** True when a payment is spread over months other than the one it arrived in. */
export function isAccrued(txn: Coverable): boolean {
  if (!txn.covers_from || !txn.covers_to) return false
  const months = coveredMonths(txn.covers_from, txn.covers_to)
  return months.length > 1 || (months.length === 1 && months[0] !== txn.txn_date.slice(0, 7))
}
