import { normaliseDescription, buildImportKeys, buildAppendKey } from '@/lib/money/dedupe-key'
import type { ParsedTransaction } from '@/lib/money/spending-types'

const t = (txn_date: string, description: string, amount: number, external_id: string | null = null):
  ParsedTransaction => ({ txn_date, description, amount, external_id })

describe('normaliseDescription', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normaliseDescription('  TESCO   STORES  ')).toBe('tesco stores')
  })

  it('strips a trailing reference number banks vary between exports', () => {
    expect(normaliseDescription('TESCO STORES 3421 REF 998812'))
      .toBe(normaliseDescription('TESCO STORES 3421'))
  })

  it('strips card-present date suffixes', () => {
    expect(normaliseDescription('PRET A MANGER ON 04 FEB'))
      .toBe(normaliseDescription('PRET A MANGER'))
  })

  it('keeps genuinely different merchants distinct', () => {
    expect(normaliseDescription('TESCO')).not.toBe(normaliseDescription('SAINSBURYS'))
  })
})

describe('buildImportKeys', () => {
  it('gives two identical same-day transactions different keys', () => {
    // Two coffees on the same day at the same price are two real purchases.
    // Merging them would silently understate spending.
    const keys = buildImportKeys('acct', [
      t('2026-02-04', 'PRET A MANGER', -3.2),
      t('2026-02-04', 'PRET A MANGER', -3.2),
    ])
    expect(keys[0]).not.toBe(keys[1])
  })

  it('regenerates identical keys for a re-imported statement', () => {
    // This is what makes import idempotent: the same window in produces the same
    // keys out, so the upsert matches and nothing doubles.
    const rows = [
      t('2026-02-04', 'PRET A MANGER', -3.2),
      t('2026-02-04', 'PRET A MANGER', -3.2),
      t('2026-02-05', 'RENT', -1200),
    ]
    expect(buildImportKeys('acct', rows)).toEqual(buildImportKeys('acct', rows))
  })

  it('gives a third genuine occurrence its own key', () => {
    const two = buildImportKeys('acct', [
      t('2026-02-04', 'PRET', -3.2), t('2026-02-04', 'PRET', -3.2),
    ])
    const three = buildImportKeys('acct', [
      t('2026-02-04', 'PRET', -3.2), t('2026-02-04', 'PRET', -3.2), t('2026-02-04', 'PRET', -3.2),
    ])
    // The first two keys are unchanged, so re-importing a longer statement adds
    // only the new row.
    expect(three.slice(0, 2)).toEqual(two)
    expect(three[2]).not.toBe(three[0])
    expect(three[2]).not.toBe(three[1])
  })

  it('collapses an overlapping statement window', () => {
    // A Jan-Feb export and a Feb-Mar export both contain February.
    const janFeb = [t('2026-01-31', 'RENT', -1200), t('2026-02-04', 'PRET', -3.2)]
    const febMar = [t('2026-02-04', 'PRET', -3.2), t('2026-03-01', 'RENT', -1200)]
    const a = buildImportKeys('acct', janFeb)
    const b = buildImportKeys('acct', febMar)
    expect(b[0]).toBe(a[1])   // the shared February row
    expect(b[1]).not.toBe(a[0])
  })

  it('survives a description reformatted between exports', () => {
    const a = buildImportKeys('acct', [t('2026-02-04', 'TESCO STORES 3421 REF 9988', -12.5)])
    const b = buildImportKeys('acct', [t('2026-02-04', 'tesco  stores  3421', -12.5)])
    expect(a[0]).toBe(b[0])
  })

  it('separates the same description on different dates', () => {
    const a = buildImportKeys('acct', [t('2026-02-04', 'PRET', -3.2)])
    const b = buildImportKeys('acct', [t('2026-02-05', 'PRET', -3.2)])
    expect(a[0]).not.toBe(b[0])
  })

  it('separates the same description at different amounts', () => {
    const a = buildImportKeys('acct', [t('2026-02-04', 'PRET', -3.2)])
    const b = buildImportKeys('acct', [t('2026-02-04', 'PRET', -4.1)])
    expect(a[0]).not.toBe(b[0])
  })

  it('separates the same row on different accounts', () => {
    const row = [t('2026-02-04', 'PRET', -3.2)]
    expect(buildImportKeys('a1', row)[0]).not.toBe(buildImportKeys('a2', row)[0])
  })

  it('prefers the bank reference when supplied, ignoring description drift', () => {
    const a = buildImportKeys('acct', [t('2026-02-04', 'PRET A MANGER', -3.2, 'TXN-99')])
    const b = buildImportKeys('acct', [t('2026-02-05', 'COMPLETELY DIFFERENT', -9.9, 'TXN-99')])
    expect(a[0]).toBe(b[0])
  })
})

describe('buildAppendKey', () => {
  it('appends past an identical stored transaction', () => {
    // Typing in a second identical coffee asserts it happened as well as the
    // first, so it must not collide with it.
    const row = t('2026-02-04', 'PRET', -3.2)
    const stored = new Set(buildImportKeys('acct', [row]))
    expect(buildAppendKey('acct', row, stored)).not.toBe([...stored][0])
  })

  it('matches the import key when nothing is stored', () => {
    const row = t('2026-02-04', 'PRET', -3.2)
    expect(buildAppendKey('acct', row, new Set())).toBe(buildImportKeys('acct', [row])[0])
  })

  it('ignores stored keys from other groups', () => {
    const row = t('2026-02-04', 'PRET', -3.2)
    const unrelated = new Set(buildImportKeys('acct', [t('2026-02-04', 'TESCO', -9.9)]))
    expect(buildAppendKey('acct', row, unrelated)).toBe(buildImportKeys('acct', [row])[0])
  })

  it('uses the bank reference when supplied', () => {
    const row = t('2026-02-04', 'PRET', -3.2, 'TXN-1')
    expect(buildAppendKey('acct', row, new Set())).toBe(buildImportKeys('acct', [row])[0])
  })
})
