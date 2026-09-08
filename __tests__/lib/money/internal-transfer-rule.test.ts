import { parseTransactionCsv } from '@/lib/money/parse-transaction-csv'
import { applyRules } from '@/lib/money/categorise'
import { buildSpendingSummary } from '@/lib/money/spending-summary'
import type { MoneyCategory, MoneyCategoryRule, MoneyTransaction } from '@/lib/money/spending-types'
import type { MoneyAccount } from '@/lib/money/types'

/** Newline, kept in a constant so shell heredocs cannot mangle the escape. */
const SEP = String.fromCharCode(10)

/**
 * End-to-end over the pure layers: a Starling reference of "INTERNAL" must reach
 * the description, be caught by one `contains` rule, and be excluded from both
 * spending and income — which is the entire point of tagging it a transfer.
 */
const CATEGORIES: MoneyCategory[] = [
  { id: 'transfer', user_id: 'u', name: 'Transfer', kind: 'transfer', sort_order: 0, created_at: 'x' },
  { id: 'groceries', user_id: 'u', name: 'Groceries', kind: 'spending', sort_order: 1, created_at: 'x' },
]

const RULE: MoneyCategoryRule = {
  id: 'r1', user_id: 'u', match_type: 'contains', pattern: 'INTERNAL',
  category_id: 'transfer', priority: 10, created_at: 'x',
}

const STARLING = [
  'Date,Counter Party,Reference,Type,Amount (GBP),Balance (GBP),Spending Category,Notes',
  '01/07/2026,Mohammed Rashid,INTERNAL,FASTER_PAYMENT,-3000.00,5000.00,,',
  '02/07/2026,Tesco Stores,,CARD_PAYMENT,-42.10,4957.90,GROCERIES,',
  '03/07/2026,Mohammed Rashid,Internal transfer,FASTER_PAYMENT,-1500.00,3457.90,,',
  '04/07/2026,Salary Co,JULY PAY,FASTER_PAYMENT,2500.00,5957.90,,',
].join(SEP)

const account: MoneyAccount = {
  id: 'a', user_id: 'u', name: 'Starling', institution: 'Starling', kind: 'current',
  currency: 'GBP', opened_date: null, closed_date: null, status: 'active', notes: null,
  created_at: 'x',
}

describe('one rule catching internal transfers', () => {
  it('lands the reference in the description so a rule can see it', () => {
    const parsed = parseTransactionCsv(STARLING)
    expect(parsed.rows[0].description).toBe('Mohammed Rashid INTERNAL')
  })

  it('tags every internal transfer from a single contains rule', () => {
    const parsed = parseTransactionCsv(STARLING)
    const tagged = applyRules(
      parsed.rows.map(r => ({ ...r, category_id: null, category_source: null })),
      [RULE],
    )
    // Both spellings caught: matching is case-insensitive, so "INTERNAL" and
    // "Internal transfer" both hit.
    expect(tagged[0].category_id).toBe('transfer')
    expect(tagged[2].category_id).toBe('transfer')
    // And nothing else is swept up.
    expect(tagged[1].category_id).toBeNull()
    expect(tagged[3].category_id).toBeNull()
  })

  it('excludes those transfers from spending AND income', () => {
    const parsed = parseTransactionCsv(STARLING)
    const tagged = applyRules(
      parsed.rows.map(r => ({ ...r, category_id: null, category_source: null })),
      [RULE],
    )

    const txns: MoneyTransaction[] = parsed.rows.map((r, i) => ({
      id: String(i), user_id: 'u', account_id: 'a', txn_date: r.txn_date,
      description: r.description, merchant: null, amount: r.amount,
      category_id: tagged[i].category_id, category_source: tagged[i].category_source,
      document_id: null, external_id: r.external_id, dedupe_key: String(i),
      notes: null, created_at: 'x',
    }))

    const s = buildSpendingSummary(txns, CATEGORIES, [account], '2026-07')

    // £4,500 of internal movement is invisible to both totals. Without the rule
    // it would have shown as £4,542.10 spent in July — an account that looks
    // like heavy spending when almost all of it was moving your own money.
    expect(s.totalOut).toBe(42.1)
    expect(s.totalIn).toBe(2500)
    expect(s.byCategory.some(c => c.name === 'Transfer')).toBe(false)
  })

  it('leaves the uncategorised salary visible rather than hiding it', () => {
    const parsed = parseTransactionCsv(STARLING)
    const tagged = applyRules(
      parsed.rows.map(r => ({ ...r, category_id: null, category_source: null })),
      [RULE],
    )
    expect(tagged.filter(t => !t.category_id)).toHaveLength(2)
  })
})
