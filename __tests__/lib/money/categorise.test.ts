import { applyRules, type Categorisable } from '@/lib/money/categorise'
import type { MoneyCategoryRule } from '@/lib/money/spending-types'

const rule = (over: Partial<MoneyCategoryRule> & { pattern: string; category_id: string }):
  MoneyCategoryRule => ({
  id: over.pattern, user_id: 'u', match_type: 'contains', priority: 100,
  created_at: '2026-01-01T00:00:00Z', ...over,
})

const txn = (description: string, over: Partial<Categorisable> = {}): Categorisable => ({
  description, category_id: null, category_source: null, ...over,
})

describe('applyRules', () => {
  it('assigns a category on a contains match', () => {
    const r = applyRules([txn('TESCO STORES 3421')], [rule({ pattern: 'tesco', category_id: 'groceries' })])
    expect(r[0]).toMatchObject({ category_id: 'groceries', category_source: 'rule' })
  })

  it('is case insensitive', () => {
    const r = applyRules([txn('tesco stores')], [rule({ pattern: 'TESCO', category_id: 'groceries' })])
    expect(r[0].category_id).toBe('groceries')
  })

  it('respects priority order, lowest first', () => {
    const r = applyRules([txn('TESCO PETROL STATION')], [
      rule({ pattern: 'tesco', category_id: 'groceries', priority: 200 }),
      rule({ pattern: 'petrol', category_id: 'fuel', priority: 10 }),
    ])
    expect(r[0].category_id).toBe('fuel')
  })

  it('stops at the first match', () => {
    const r = applyRules([txn('TESCO')], [
      rule({ pattern: 'tesco', category_id: 'first', priority: 1 }),
      rule({ pattern: 'tesco', category_id: 'second', priority: 2 }),
    ])
    expect(r[0].category_id).toBe('first')
  })

  it('supports an exact match type', () => {
    const rules = [rule({ pattern: 'RENT', category_id: 'housing', match_type: 'exact' })]
    expect(applyRules([txn('RENT')], rules)[0].category_id).toBe('housing')
    expect(applyRules([txn('RENT PAYMENT')], rules)[0].category_id).toBeNull()
  })

  it('supports a regex match type', () => {
    const rules = [rule({ pattern: '^SALARY \\d+$', category_id: 'salary', match_type: 'regex' })]
    expect(applyRules([txn('SALARY 4471')], rules)[0].category_id).toBe('salary')
    expect(applyRules([txn('MY SALARY 4471')], rules)[0].category_id).toBeNull()
  })

  it('ignores an invalid regex rather than throwing', () => {
    // A user-typed pattern can be malformed; one bad rule must not break an
    // entire import.
    const r = applyRules([txn('ANYTHING')], [rule({ pattern: '([', category_id: 'x', match_type: 'regex' })])
    expect(r[0].category_id).toBeNull()
  })

  it('never overwrites a manual category', () => {
    // A correction the user made by hand is the most reliable signal there is.
    const r = applyRules(
      [txn('TESCO', { category_id: 'chosen-by-hand', category_source: 'manual' })],
      [rule({ pattern: 'tesco', category_id: 'groceries' })],
    )
    expect(r[0]).toMatchObject({ category_id: 'chosen-by-hand', category_source: 'manual' })
  })

  it('does overwrite an earlier rule or AI assignment', () => {
    const r = applyRules(
      [txn('TESCO', { category_id: 'old', category_source: 'ai' })],
      [rule({ pattern: 'tesco', category_id: 'groceries' })],
    )
    expect(r[0]).toMatchObject({ category_id: 'groceries', category_source: 'rule' })
  })

  it('clears a stale rule assignment when no rule matches any more', () => {
    // The rule that set this was deleted, so the category is no longer justified.
    const r = applyRules([txn('TESCO', { category_id: 'old', category_source: 'rule' })], [])
    expect(r[0]).toMatchObject({ category_id: null, category_source: null })
  })

  it('leaves an unmatched transaction uncategorised', () => {
    const r = applyRules([txn('MYSTERY MERCHANT')], [rule({ pattern: 'tesco', category_id: 'g' })])
    expect(r[0]).toMatchObject({ category_id: null, category_source: null })
  })

  it('handles an empty rule set', () => {
    expect(applyRules([txn('ANYTHING')], [])[0].category_id).toBeNull()
  })
})
