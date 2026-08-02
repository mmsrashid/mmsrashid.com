import { editDistance } from '@/lib/health/match-medicine'

export interface AccountRef {
  id: string
  name: string
  institution?: string | null
}

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const tokens = (s: string) => normalise(s).split(' ').filter(Boolean)

/**
 * Two adjacent characters swapped — "Currnet" for "Current".
 *
 * Plain Levenshtein scores a transposition as 2, so it would be missed at a
 * threshold of 1. Detecting it directly is safer than raising the threshold to
 * 2, which would start conflating genuinely different account names.
 */
function transposed(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const diff: number[] = []
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i)
  return diff.length === 2
    && diff[1] === diff[0] + 1
    && a[diff[0]] === b[diff[1]]
    && a[diff[1]] === b[diff[0]]
}

const near = (a: string, b: string) =>
  a === b ||
  (a.length >= 5 && b.length >= 5 && (editDistance(a, b) <= 1 || transposed(a, b)))

/**
 * Resolves a name read off a statement to an account on record.
 *
 * Ambiguity returns null rather than a best guess: two accounts at the same
 * bank are common, and filing a balance against the wrong one silently corrupts
 * the net worth series from that date forward.
 */
export function buildAccountResolver(accounts: AccountRef[]) {
  const prepared = accounts.map(a => ({
    account: a,
    tokens: [...new Set([...tokens(a.name), ...tokens(a.institution ?? '')])],
  }))

  return function resolve(raw: string): AccountRef | null {
    const want = tokens(raw)
    if (want.length === 0) return null

    const scored = prepared.map(p => {
      // How many of the caller's words this account accounts for.
      const score = want.filter(w => p.tokens.some(t => near(t, w))).length
      // How much of the account's own identity was covered, so "Barclays" alone
      // does not score as well against "Barclays Current" as the full name.
      const coverage = p.tokens.filter(t => want.some(w => near(t, w))).length
      return { account: p.account, score, coverage, need: p.tokens.length }
    }).filter(s => s.score > 0)

    if (scored.length === 0) return null

    scored.sort((a, b) => (b.score - a.score) || (b.coverage - a.coverage))
    const best = scored[0]

    // A single shared token (typically just the bank name) is not identification.
    if (best.score < 2 && best.need > 1) return null

    // Two candidates tied on both measures cannot be separated.
    const rival = scored[1]
    if (rival && rival.score === best.score && rival.coverage === best.coverage) return null

    return best.account
  }
}
