import { buildAccountResolver } from '@/lib/money/match-account'

const ACCOUNTS = [
  { id: '1', name: 'Barclays Current', institution: 'Barclays' },
  { id: '2', name: 'Barclays Savings', institution: 'Barclays' },
  { id: '3', name: 'Vanguard ISA', institution: 'Vanguard' },
  { id: '4', name: 'Halifax Mortgage', institution: 'Halifax' },
]

describe('buildAccountResolver', () => {
  const resolve = buildAccountResolver(ACCOUNTS)

  it('matches an exact name', () => {
    expect(resolve('Barclays Current')?.id).toBe('1')
  })

  it('is case and punctuation insensitive', () => {
    expect(resolve('barclays  current!')?.id).toBe('1')
  })

  it('tolerates a small typo', () => {
    expect(resolve('Barclays Currnet')?.id).toBe('1')
  })

  it('distinguishes two accounts at the same institution', () => {
    expect(resolve('Barclays Savings')?.id).toBe('2')
  })

  it('returns null rather than guessing when only the institution matches', () => {
    // "Barclays" alone cannot choose between Current and Savings, and picking
    // one would file a balance against the wrong account.
    expect(resolve('Barclays')).toBeNull()
  })

  it('returns null for something absent', () => {
    expect(resolve('Monzo')).toBeNull()
  })

  it('returns null for an empty name', () => {
    expect(resolve('   ')).toBeNull()
  })
})
