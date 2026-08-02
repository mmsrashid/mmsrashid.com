import type { MoneyBalance } from './types'
import type { MoneyTransaction } from './spending-types'

export interface ReconcileInterval {
  from: string
  to: string
  balanceChange: number
  transactionSum: number
  /**
   * Movement the recorded transactions do not explain, signed the same way as
   * the money itself: `balanceChange − transactionSum`.
   *
   * Negative means money left the account that no transaction accounts for —
   * the usual case, and normally a missed statement page. Positive means money
   * arrived that no transaction accounts for.
   *
   * Worked example: the balance falls £100 but only £60 of spending was
   * imported, so unexplained is −40 — £40 went out unrecorded.
   */
  unexplained: number
  ok: boolean
}

const pence = (n: number) => Math.round(n * 100)

/**
 * Checks whether imported transactions explain the change between balance
 * snapshots.
 *
 * Snapshots remain the source of truth for net worth; this never corrects
 * anything. Its only job is to make a gap visible — a missed statement page is
 * otherwise invisible, and the spending figures would simply be quietly low.
 *
 * The opening snapshot's own date is excluded and the closing date included: a
 * transaction on the opening day is already reflected in that balance, so
 * counting it again would invent a discrepancy that does not exist.
 */
export function reconcileAccount(
  balances: MoneyBalance[],
  transactions: MoneyTransaction[],
): ReconcileInterval[] {
  const snapshots = [...balances].sort((a, b) => a.as_of.localeCompare(b.as_of))
  if (snapshots.length < 2) return []

  const out: ReconcileInterval[] = []

  for (let i = 1; i < snapshots.length; i++) {
    const from = snapshots[i - 1]
    const to = snapshots[i]

    const changeP = pence(Number(to.balance)) - pence(Number(from.balance))
    const sumP = transactions
      .filter(t => t.txn_date > from.as_of && t.txn_date <= to.as_of)
      .reduce((acc, t) => acc + pence(Number(t.amount)), 0)

    // Signed like the money: negative means unrecorded money out.
    const unexplainedP = changeP - sumP

    out.push({
      from: from.as_of,
      to: to.as_of,
      balanceChange: changeP / 100,
      transactionSum: sumP / 100,
      unexplained: unexplainedP / 100,
      // Under a penny is rounding, not a missing transaction.
      ok: Math.abs(unexplainedP) < 1,
    })
  }

  return out
}
