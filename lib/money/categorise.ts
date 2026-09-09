import type { CategorySource, MoneyCategoryRule } from './spending-types'

export interface Categorisable {
  description: string
  category_id: string | null
  category_source: CategorySource | null
  property_id?: string | null
}

/**
 * Flattens the two ways a bank description differs from what a human sees.
 *
 * Statement text is column-padded, so a description is really
 * "Uber UBER   *TRIP           London        GBR". A pattern is almost always
 * copied off the screen, where HTML collapses those runs to single spaces — so
 * the pattern the user typed never appeared in the stored text and matched
 * nothing. Four Uber rules matched 0 of 36 transactions this way, while a
 * single-word "TFL" rule worked, which is the tell: only patterns containing a
 * space were affected.
 *
 * Spacing around the '*' a card network inserts also varies within one
 * merchant — "UBER   *EATS", "UBER   * EATS" and "UBER* EATS" all occur — so
 * it is closed up too, letting one pattern cover every variant.
 */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*\*\s*/g, '*')
    .trim()
}

function matches(rule: MoneyCategoryRule, description: string): boolean {
  if (rule.match_type === 'exact') {
    return normalise(description) === normalise(rule.pattern)
  }
  if (rule.match_type === 'contains') {
    return normalise(description).includes(normalise(rule.pattern))
  }

  // A user-typed regex can be malformed. One bad rule must not abort an entire
  // import, so treat an invalid pattern as simply not matching.
  //
  // Tried against both forms: a regex written against the raw text keeps
  // working, and one written from what the screen showed now works too. This
  // only ever adds matches, never removes one.
  try {
    const re = new RegExp(rule.pattern, 'i')
    return re.test(description) || re.test(normalise(description))
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
  const ordered = [...rules].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    // At equal priority, a rule that also assigns a property wins.
    //
    // Two rules for the same merchant are easy to end up with, and when one
    // carries a property and the other does not, "first match wins" made the
    // outcome depend on row order. In real data that shadowed a 4FLH rule with
    // an older property-less duplicate: 14 matching transactions, only the 4
    // tagged by hand had a property. The rule that says more is the one the
    // user most recently meant.
    return Number(Boolean(b.property_id)) - Number(Boolean(a.property_id))
  })

  return transactions.map(txn => {
    if (txn.category_source === 'manual') return txn

    const hit = ordered.find(r => matches(r, txn.description))

    if (!hit) {
      // No rule matches. Only clear a category that a RULE set, because the rule
      // that set it may since have been deleted or edited.
      //
      // An 'ai' category must survive: nothing about the absence of a matching
      // rule says the model was wrong. Clearing it here destroyed 391 working
      // categorisations the moment a single rule was added and re-run — the
      // first rule a user writes should not blank the rest of their data.
      if (txn.category_source === 'rule') {
        return { ...txn, category_id: null, category_source: null }
      }
      return txn
    }

    return {
      ...txn,
      category_id: hit.category_id,
      category_source: 'rule' as const,
      // A rule fills an empty property tag but never replaces one already set.
      // There is no `property_source` column to mark a hand-made choice, so the
      // existing value is treated as authoritative — overwriting it would move
      // rental income onto the wrong asset with nothing to signal it happened.
      property_id: txn.property_id ?? hit.property_id ?? null,
    }
  })
}
