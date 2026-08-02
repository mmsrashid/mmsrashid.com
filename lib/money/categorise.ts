import type { CategorySource, MoneyCategoryRule } from './spending-types'

export interface Categorisable {
  description: string
  category_id: string | null
  category_source: CategorySource | null
}

function matches(rule: MoneyCategoryRule, description: string): boolean {
  const d = description.toLowerCase()
  const p = rule.pattern.toLowerCase()

  if (rule.match_type === 'exact') return d.trim() === p.trim()
  if (rule.match_type === 'contains') return d.includes(p)

  // A user-typed regex can be malformed. One bad rule must not abort an entire
  // import, so treat an invalid pattern as simply not matching.
  try {
    return new RegExp(rule.pattern, 'i').test(description)
  } catch {
    return false
  }
}

/**
 * Applies categorisation rules in priority order, first match winning.
 *
 * A `manual` category is never touched: a correction the user made by hand
 * outranks anything a rule or the model infers, and silently reverting it would
 * destroy the one signal in the system that is known to be right.
 */
export function applyRules<T extends Categorisable>(
  transactions: T[],
  rules: MoneyCategoryRule[],
): T[] {
  const ordered = [...rules].sort((a, b) => a.priority - b.priority)

  return transactions.map(txn => {
    if (txn.category_source === 'manual') return txn

    const hit = ordered.find(r => matches(r, txn.description))
    if (!hit) return { ...txn, category_id: null, category_source: null }

    return { ...txn, category_id: hit.category_id, category_source: 'rule' as const }
  })
}
