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

/** Digits only, so "20-29-41" and "202941" compare equal. */
const digits = (s: string) => (s ?? '').replace(/[^0-9]/g, '')

/**
 * Resolves an account from an identifier printed in a statement file — Barclays
 * puts "20-29-41 40261467" in an Account column.
 *
 * Matched on digits so formatting differences do not matter, and only on a
 * sort-code-and-number pair or a full account number: a bare six digits could
 * coincide with something else, and filing a whole statement against the wrong
 * account is not a mistake worth risking to save one question.
 */
export function resolveAccountByBankDetails(
  hint: string,
  accounts: { id: string; name: string; sort_code?: string | null; account_number?: string | null }[],
): { id: string; name: string } | null {
  const h = digits(hint)
  if (h.length < 8) return null

  const hits = accounts.filter(a => {
    const num = digits(a.account_number ?? '')
    const sort = digits(a.sort_code ?? '')
    if (num.length >= 8 && h.includes(num)) return true
    if (num.length >= 6 && sort.length === 6 && h.includes(sort) && h.includes(num)) return true
    return false
  })

  return hits.length === 1 ? { id: hits[0].id, name: hits[0].name } : null
}

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
