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

  it('KEEPS an ai category when no rule matches', () => {
    // Regression guard. Clearing these wiped 391 working categorisations the
    // moment one unrelated rule was added and re-run: the absence of a matching
    // rule says nothing about whether the model was right.
    const r = applyRules([txn('TESCO', { category_id: 'groceries', category_source: 'ai' })], [])
    expect(r[0]).toMatchObject({ category_id: 'groceries', category_source: 'ai' })
  })

  it('lets a rule override an ai category when one does match', () => {
    const r = applyRules(
      [txn('MOHAMMED RASHID internal', { category_id: 'shopping', category_source: 'ai' })],
      [rule({ pattern: 'internal', category_id: 'transfer' })],
    )
    expect(r[0]).toMatchObject({ category_id: 'transfer', category_source: 'rule' })
  })

  it('leaves an unmatched transaction uncategorised', () => {
    const r = applyRules([txn('MYSTERY MERCHANT')], [rule({ pattern: 'tesco', category_id: 'g' })])
    expect(r[0]).toMatchObject({ category_id: null, category_source: null })
  })

  it('handles an empty rule set', () => {
    expect(applyRules([txn('ANYTHING')], [])[0].category_id).toBeNull()
  })

  it('tags a property when the matching rule carries one', () => {
    // One rule sets both category and property, which is what makes monthly
    // rental income self-filing instead of hand-tagged.
    const r = applyRules(
      [txn('RENT 4FLH JUNE')],
      [rule({ pattern: '4FLH', category_id: 'rent-received', property_id: 'prop-4flh' })],
    )
    expect(r[0]).toMatchObject({
      category_id: 'rent-received', category_source: 'rule', property_id: 'prop-4flh',
    })
  })

  it('leaves the property null when the rule has none', () => {
    const r = applyRules([txn('TESCO')], [rule({ pattern: 'tesco', category_id: 'groceries' })])
    expect(r[0].property_id).toBeNull()
  })

  it('never replaces a property tag that is already set', () => {
    // There is no property_source column to mark a hand-made choice, so an
    // existing tag is treated as authoritative. Overwriting it would move rental
    // income onto the wrong asset with nothing to signal it happened.
    const r = applyRules(
      [{ ...txn('RENT 4FLH'), property_id: 'chosen-by-hand' }],
      [rule({ pattern: '4FLH', category_id: 'rent-received', property_id: 'prop-4flh' })],
    )
    expect(r[0].property_id).toBe('chosen-by-hand')
  })

  it('keeps the property tag on a manually categorised transaction', () => {
    const r = applyRules(
      [{ ...txn('RENT 4FLH', { category_id: 'x', category_source: 'manual' }), property_id: 'p' }],
      [rule({ pattern: '4FLH', category_id: 'rent-received', property_id: 'other' })],
    )
    expect(r[0]).toMatchObject({ category_id: 'x', category_source: 'manual', property_id: 'p' })
  })

  describe('column-padded bank descriptions', () => {
    // Verbatim from real Starling data. The padding is the point: a pattern is
    // copied off the screen, where HTML collapses these runs to one space.
    const TRIP = 'Uber UBER   *TRIP           London        GBR'
    const EATS = 'Uber Eats UBER   *EATS           London        GBR'
    const EATS_PENDING = 'Uber Eats UBER   * EATS PENDING  London        GBR'
    const EATS_NOSPACE = 'Uber Eats UBER* EATS PENDING     LONDON        GBR'
    const PENDING = 'Uber UBER   * PENDING       London        GBR'

    it('matches a pattern typed with single spaces', () => {
      // This is the reported bug: four such rules matched 0 of 36 rows.
      const r = applyRules([txn(TRIP)], [rule({ pattern: 'Uber UBER *TRIP', category_id: 'taxis' })])
      expect(r[0].category_id).toBe('taxis')
    })

    it('matches regardless of spacing around the card asterisk', () => {
      // One merchant produces "UBER   *EATS", "UBER   * EATS" and "UBER* EATS",
      // so no literal pattern could cover all three before.
      for (const d of [EATS, EATS_PENDING, EATS_NOSPACE]) {
        const r = applyRules([txn(d)], [rule({ pattern: 'UBER*EATS', category_id: 'eating-out' })])
        expect(r[0].category_id).toBe('eating-out')
      }
    })

    it('still tells Uber Eats apart from an Uber trip', () => {
      // Being more forgiving must not make everything match everything.
      const rules = [
        rule({ pattern: 'UBER*EATS', category_id: 'eating-out', priority: 50 }),
        rule({ pattern: 'UBER*TRIP', category_id: 'taxis', priority: 50 }),
      ]
      expect(applyRules([txn(EATS)], rules)[0].category_id).toBe('eating-out')
      expect(applyRules([txn(EATS_PENDING)], rules)[0].category_id).toBe('eating-out')
      expect(applyRules([txn(TRIP)], rules)[0].category_id).toBe('taxis')
    })

    it('lets a specific rule win by priority over a broader one', () => {
      // 'UBER' contains-matches an Eats row too, so the narrower rule needs the
      // lower priority number. Order in the array must not decide it.
      const rules = [
        rule({ pattern: 'UBER', category_id: 'taxis', priority: 100 }),
        rule({ pattern: 'UBER*EATS', category_id: 'eating-out', priority: 50 }),
      ]
      expect(applyRules([txn(EATS)], rules)[0].category_id).toBe('eating-out')
      expect(applyRules([txn(TRIP)], rules)[0].category_id).toBe('taxis')
      expect(applyRules([txn(PENDING)], rules)[0].category_id).toBe('taxis')
    })

    it('does not match a pattern that is genuinely absent', () => {
      const r = applyRules([txn(TRIP)], [rule({ pattern: 'DELIVEROO', category_id: 'x' })])
      expect(r[0].category_id).toBeNull()
    })

    it('applies the same normalisation to exact matches', () => {
      const r = applyRules([txn(TRIP)], [
        rule({ pattern: 'Uber UBER *TRIP London GBR', category_id: 'taxis', match_type: 'exact' }),
      ])
      expect(r[0].category_id).toBe('taxis')
    })

    it('keeps a regex written against the raw padding working', () => {
      const r = applyRules([txn(TRIP)], [
        rule({ pattern: 'UBER\\s+\\*TRIP', category_id: 'taxis', match_type: 'regex' }),
      ])
      expect(r[0].category_id).toBe('taxis')
    })

    it('also accepts a regex written from what the screen showed', () => {
      const r = applyRules([txn(TRIP)], [
        rule({ pattern: '^uber uber\\*trip', category_id: 'taxis', match_type: 'regex' }),
      ])
      expect(r[0].category_id).toBe('taxis')
    })
  })

  describe('duplicate rules for the same merchant', () => {
    // Taken from real data: pressing Rule twice on the same merchant left an
    // older property-less rule alongside a newer one carrying 4FLH. Both at
    // priority 100, first-match-wins, so the outcome depended on row order —
    // 14 matching transactions and only the 4 tagged by hand had a property.
    const withProperty = rule({
      pattern: 'ALDERMORE BANK PLC', category_id: 'mortgage-interest', property_id: 'prop-4flh',
    })
    const withoutProperty = rule({
      pattern: 'ALDERMORE BANK PLC', category_id: 'mortgage-interest', property_id: null,
    })

    it('prefers the rule that assigns a property, whichever order they arrive in', () => {
      for (const rules of [[withoutProperty, withProperty], [withProperty, withoutProperty]]) {
        const r = applyRules([txn('ALDERMORE BANK PLC 4012')], rules)
        expect(r[0].property_id).toBe('prop-4flh')
        expect(r[0].category_id).toBe('mortgage-interest')
      }
    })

    it('still respects priority over specificity', () => {
      // Specificity only breaks ties. An explicit lower priority number is a
      // deliberate ordering choice and must not be overridden by it.
      const r = applyRules([txn('ALDERMORE BANK PLC 4012')], [
        { ...withProperty, priority: 200 },
        { ...withoutProperty, category_id: 'wins-on-priority', priority: 10 },
      ])
      expect(r[0].category_id).toBe('wins-on-priority')
      expect(r[0].property_id).toBeNull()
    })

    it('is unaffected when neither duplicate carries a property', () => {
      const r = applyRules([txn('PEPPER MONEY 8891')], [
        rule({ pattern: 'PEPPER MONEY', category_id: 'first' }),
        rule({ pattern: 'PEPPER MONEY', category_id: 'second' }),
      ])
      expect(r[0].category_id).toBe('first')
    })
  })
})
