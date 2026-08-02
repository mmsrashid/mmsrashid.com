import { isLiability, type MoneyAccount, type MoneyBalance } from './types'

export interface NetWorthPoint {
  date: string
  assets: number
  liabilities: number
  net: number
  /** Accounts with a known balance on this date. */
  accountsCounted: number
  /** Accounts on record at all, so the UI can say "12 of 14". */
  accountsTotal: number
}

export interface NetWorthSeries {
  points: NetWorthPoint[]
  /** Non-null when accounts span more than one currency; points is then empty. */
  currencyWarning: string | null
}

/** Money in pennies while summing, so repeated addition cannot drift. */
const toPence = (n: number) => Math.round(n * 100)

/**
 * Net worth over time from dated balance snapshots.
 *
 * Each account's last known balance is carried forward until superseded, and an
 * account is excluded until its first snapshot exists — counting it as zero
 * beforehand would draw a step-change that never happened. This is the same
 * trap the pill tracker hit by scoring a medicine on days outside its
 * prescription window.
 */
export function buildNetWorthSeries(
  accounts: MoneyAccount[],
  balances: MoneyBalance[],
): NetWorthSeries {
  const byId = new Map(accounts.map(a => [a.id, a]))

  // Mixed currencies cannot be summed without FX rates, and a silently wrong
  // headline number is worse than an admitted gap.
  const currencies = [...new Set(accounts.map(a => a.currency))].sort()
  if (currencies.length > 1) {
    return {
      points: [],
      currencyWarning:
        `Accounts span ${currencies.join(', ')}. Net worth needs a single currency — ` +
        `convert them or track each currency separately.`,
    }
  }

  // Drop orphans up front so an account deleted mid-flight can't skew a date.
  const known = balances.filter(b => byId.has(b.account_id))
  if (known.length === 0) return { points: [], currencyWarning: null }

  // One balance per account per date; the newest write wins. The unique index
  // should prevent duplicates, but the reader must not depend on that.
  const latestPerAccountDate = new Map<string, MoneyBalance>()
  for (const b of known) {
    const key = `${b.account_id}|${b.as_of}`
    const seen = latestPerAccountDate.get(key)
    if (!seen || b.created_at > seen.created_at) latestPerAccountDate.set(key, b)
  }

  const rows = [...latestPerAccountDate.values()]
  const dates = [...new Set(rows.map(r => r.as_of))].sort()

  // Ascending per account, so a forward scan can track "latest so far".
  const perAccount = new Map<string, MoneyBalance[]>()
  for (const r of rows) {
    const arr = perAccount.get(r.account_id) ?? []
    arr.push(r)
    perAccount.set(r.account_id, arr)
  }
  for (const arr of perAccount.values()) arr.sort((x, y) => x.as_of.localeCompare(y.as_of))

  const points: NetWorthPoint[] = dates.map(date => {
    let assets = 0
    let liabilities = 0
    let counted = 0

    for (const [accountId, arr] of perAccount) {
      const account = byId.get(accountId)!
      if (account.closed_date && date > account.closed_date) continue

      // Last snapshot at or before this date; none means the account did not
      // exist for us yet and must not contribute.
      let current: MoneyBalance | null = null
      for (const b of arr) {
        if (b.as_of > date) break
        current = b
      }
      if (!current) continue

      counted++
      const pence = toPence(Number(current.balance))
      if (isLiability(account.kind)) liabilities += pence
      else assets += pence
    }

    return {
      date,
      assets: assets / 100,
      liabilities: liabilities / 100,
      net: (assets - liabilities) / 100,
      accountsCounted: counted,
      accountsTotal: accounts.length,
    }
  })

  return { points, currencyWarning: null }
}

/** Convenience for the headline figure. */
export function latestNetWorth(series: NetWorthSeries): NetWorthPoint | null {
  return series.points.length ? series.points[series.points.length - 1] : null
}
