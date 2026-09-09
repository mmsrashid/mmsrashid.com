import type { ParsedTransaction } from './spending-types'

/**
 * Deterministic parser for a Barclays PDF statement.
 *
 * These statements have a real text layer in a fixed grid, so they can be
 * parsed rather than read by a model. That matters more than usual here: the
 * transaction rows print a day and month with NO YEAR, and a quarterly
 * statement crosses the year boundary — the January statement covers October
 * to January. A model that guessed the year would move a quarter of the rows
 * into the wrong tax year, and the result would look entirely correct.
 *
 * Works on positioned text: values are right-aligned under their column, so
 * which column a number belongs to is decided by where it sits, not by
 * counting numbers on the line.
 */

export interface PdfToken {
  text: string
  /** Left edge, in PDF points. */
  x: number
}

export interface PdfLine {
  page: number
  /** Baseline, in PDF points. Larger is higher up the page. */
  y: number
  tokens: PdfToken[]
}

export interface BarclaysStatement {
  rows: ParsedTransaction[]
  /** Sort code and account number printed on the transaction pages. */
  accountHints: { sortCode: string | null; accountNumber: string | null }[]
  period: { from: string; to: string } | null
  /** Printed balances, for reconciling what was parsed against the statement. */
  startBalance: number | null
  endBalance: number | null
  warnings: string[]
}

const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
]

const DATE_RE = /^(\d{1,2})\s+([A-Za-z]{3})$/
const AMOUNT_RE = /^-?[\d,]+\.\d{2}$/

function monthIndex(name: string): number {
  return MONTHS.indexOf(name.slice(0, 3).toLowerCase())
}

function toNumber(text: string): number | null {
  if (!AMOUNT_RE.test(text)) return null
  const n = Number(text.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Text of a line, in reading order. */
function lineText(line: PdfLine): string {
  return [...line.tokens].sort((a, b) => a.x - b.x).map(t => t.text).join(' ')
    .replace(/\s+/g, ' ').trim()
}

/**
 * The statement period, which is the only place the year appears.
 *
 * Three shapes occur across real statements, so all three are tried:
 *   "03 Oct 2019 - 02 Jan 2020"  both years, unambiguous
 *   "02 Apr - 02 Jul 2021"       one year at the end, start may be the year before
 *   "Last statement 02 Oct 2019" + "Statement date 02 Jan 2020"
 *
 * The two-year form is tried first because it needs no inference at all.
 */
function findPeriod(lines: PdfLine[]): { from: string; to: string } | null {
  const texts = lines.map(lineText).filter(Boolean)

  // Both years printed.
  for (const text of texts) {
    const m = text.match(
      /(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s*[-–]\s*(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/,
    )
    if (!m) continue
    const [, d1, mon1, y1, d2, mon2, y2] = m
    const sm = monthIndex(mon1), em = monthIndex(mon2)
    if (sm < 0 || em < 0) continue
    return { from: iso(Number(y1), sm, Number(d1)), to: iso(Number(y2), em, Number(d2)) }
  }

  // One year, at the end.
  for (const text of texts) {
    const m = text.match(
      /(\d{1,2})\s+([A-Za-z]{3})\s*[-–]\s*(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/,
    )
    if (!m) continue
    const [, d1, mon1, d2, mon2, yearStr] = m
    const endYear = Number(yearStr)
    const sm = monthIndex(mon1), em = monthIndex(mon2)
    if (sm < 0 || em < 0) continue
    // Ending in an earlier month than it starts means the period crossed a new
    // year: "03 Oct - 02 Jan 2020" begins in 2019.
    return {
      from: iso(sm > em ? endYear - 1 : endYear, sm, Number(d1)),
      to: iso(endYear, em, Number(d2)),
    }
  }

  // Header pair, as a last resort.
  const one = (re: RegExp) => {
    for (const text of texts) {
      const m = text.match(re)
      if (m) {
        const mi = monthIndex(m[2])
        if (mi >= 0) return iso(Number(m[3]), mi, Number(m[1]))
      }
    }
    return null
  }
  const from = one(/last statement\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/i)
  const to = one(/statement date\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/i)
  if (from && to) return { from, to }

  return null
}

/** True when the document is a fees summary rather than a statement. */
function isFeesDocument(lines: PdfLine[]): boolean {
  return lines.some(l => /^statement of fees/i.test(lineText(l)))
}

function findAccountHints(lines: PdfLine[]) {
  const hints: BarclaysStatement['accountHints'] = []
  const seen = new Set<string>()
  for (const line of lines) {
    const text = lineText(line)
    const sort = text.match(/sort\s*code\s*(\d{2}[-\s]?\d{2}[-\s]?\d{2})/i)
    const acct = text.match(/account\s*(?:number|no\.?)\s*(\d{7,10})/i)
    if (!sort && !acct) continue
    const key = `${sort?.[1] ?? ''}|${acct?.[1] ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    hints.push({
      sortCode: sort ? sort[1].replace(/[^\d]/g, '').replace(/(\d{2})(\d{2})(\d{2})/, '$1-$2-$3') : null,
      accountNumber: acct ? acct[1] : null,
    })
  }
  return hints
}

interface Columns { date: number; description: number; out: number; in: number; balance: number }

/** The table header gives the column anchors; values sit right-aligned under them. */
function findColumns(line: PdfLine): Columns | null {
  const at = (label: RegExp) => {
    const tok = line.tokens.find(t => label.test(t.text.trim()))
    return tok ? tok.x : null
  }
  const date = at(/^date$/i)
  const description = at(/^description$/i)
  const out = at(/^money\s*out$/i)
  const inn = at(/^money\s*in$/i)
  const balance = at(/^balance$/i)
  if (date === null || out === null || inn === null || balance === null) return null
  return { date, description: description ?? date + 30, out, in: inn, balance }
}

/**
 * Which money column a number belongs to.
 *
 * Boundaries sit midway between the header anchors. Values are right-aligned,
 * so a wide number starts further left than a narrow one in the same column —
 * which is exactly why position beats "the first number is money out".
 */
function classify(x: number, cols: Columns): 'out' | 'in' | 'balance' {
  const outIn = (cols.out + cols.in) / 2
  const inBal = (cols.in + cols.balance) / 2
  if (x < outIn) return 'out'
  if (x < inBal) return 'in'
  return 'balance'
}

export function parseBarclaysPdf(lines: PdfLine[]): BarclaysStatement {
  const warnings: string[] = []
  const accountHints = findAccountHints(lines)

  // A Statement of Fees lists charges and interest, not transactions, and says
  // so itself. Naming it is far more use than "no rows found".
  if (isFeesDocument(lines)) {
    return {
      rows: [], accountHints, period: null, startBalance: null, endBalance: null,
      warnings: [
        'This is a Statement of Fees, which summarises charges and interest rather than ' +
        'listing transactions. Upload the account statement for the same period instead.',
      ],
    }
  }

  const period = findPeriod(lines)

  if (!period) {
    warnings.push(
      'Could not find the statement period, so the year of each transaction is unknown. ' +
      'Nothing was imported rather than risk filing a quarter into the wrong tax year.',
    )
    return { rows: [], accountHints, period: null, startBalance: null, endBalance: null, warnings }
  }

  const startYear = Number(period.from.slice(0, 4))
  const startMonth = Number(period.from.slice(5, 7)) - 1

  const rows: ParsedTransaction[] = []
  let startBalance: number | null = null
  let endBalance: number | null = null

  let cols: Columns | null = null
  let lastDay: { year: number; month: number; day: number } | null = null
  let prevMonth = startMonth
  let year = startYear
  let finished = false

  // Lines in reading order: down each page, pages in order.
  const ordered = [...lines].sort((a, b) => a.page - b.page || b.y - a.y)

  for (const line of ordered) {
    const tokens = [...line.tokens].sort((a, b) => a.x - b.x)
    if (tokens.length === 0) continue

    // The header repeats on every continuation page; each occurrence re-arms
    // the columns, which also keeps them right if a page is laid out slightly
    // differently.
    const header = findColumns(line)
    if (header) { cols = header; continue }
    if (!cols || finished) continue

    const text = lineText(line)
    if (!text) continue

    const dateTok = tokens.find(t =>
      Math.abs(t.x - cols!.date) <= 8 && DATE_RE.test(t.text.trim()))

    // Descriptions and amounts are separated by position, not by guessing.
    const outIn = (cols.out + cols.in) / 2
    const descParts = tokens
      .filter(t => t !== dateTok && t.x < cols!.out - 20)
      .map(t => t.text.trim())
      .filter(Boolean)
    const description = descParts.join(' ').replace(/\s+/g, ' ').trim()

    const amounts = tokens
      .filter(t => t.x >= cols!.out - 20)
      .map(t => ({ value: toNumber(t.text.trim()), where: classify(t.x, cols!) }))
      .filter((a): a is { value: number; where: 'out' | 'in' | 'balance' } => a.value !== null)

    const balanceOnly = amounts.find(a => a.where === 'balance')

    if (/^start balance/i.test(description)) {
      startBalance = balanceOnly?.value ?? amounts[0]?.value ?? null
      continue
    }
    if (/^end balance/i.test(description)) {
      endBalance = balanceOnly?.value ?? amounts[0]?.value ?? null
      // Anything after the closing balance is footer material.
      finished = true
      continue
    }

    // A "Ref:" line continues the description of the transaction above it. It
    // carries the payment reference, which is often the only thing telling two
    // otherwise identical rows apart.
    if (/^ref\b/i.test(description) && amounts.length === 0) {
      const prev = rows[rows.length - 1]
      if (prev) prev.description = `${prev.description} ${description}`.trim()
      continue
    }

    if (dateTok) {
      const m = dateTok.text.trim().match(DATE_RE)!
      const month = monthIndex(m[2])
      if (month < 0) {
        warnings.push(`Skipped a row with an unreadable date: "${text.slice(0, 60)}"`)
        continue
      }
      // Months only ever move forward within a statement, so a month earlier
      // than the last one means the year turned. This is the whole reason the
      // parser exists.
      if (month < prevMonth) year++
      prevMonth = month
      lastDay = { year, month, day: Number(m[1]) }
    }

    const out = amounts.find(a => a.where === 'out')
    const inn = amounts.find(a => a.where === 'in')
    if (!out && !inn) continue

    if (!lastDay) {
      warnings.push(`Skipped a transaction before any date was seen: "${text.slice(0, 60)}"`)
      continue
    }
    if (!description) {
      warnings.push(`Skipped a transaction with no description on ${iso(lastDay.year, lastDay.month, lastDay.day)}`)
      continue
    }

    rows.push({
      txn_date: iso(lastDay.year, lastDay.month, lastDay.day),
      description,
      // Out is money leaving, so negative. Both columns present would be
      // contradictory; out wins and the row is flagged.
      amount: out ? -Math.abs(out.value) : Math.abs(inn!.value),
      external_id: null,
    })
    if (out && inn) {
      warnings.push(
        `A row on ${rows[rows.length - 1].txn_date} had figures in both money columns; ` +
        `treated as money out.`,
      )
    }
  }

  if (rows.length === 0) {
    warnings.push('Found the statement layout but no transaction rows.')
  }

  // Dates outside the statement period mean the year walk went wrong, which is
  // the failure that would otherwise be invisible.
  const strays = rows.filter(r => r.txn_date < period.from || r.txn_date > period.to)
  if (strays.length > 0) {
    warnings.push(
      `${strays.length} row(s) fell outside the statement period ${period.from} to ${period.to} ` +
      `— the earliest was ${strays[0].txn_date}. Check before relying on these.`,
    )
  }

  return { rows, accountHints, period, startBalance, endBalance, warnings }
}

/**
 * What the parsed rows imply the closing balance should be, for comparison with
 * the printed one. A mismatch means a row was missed or misread.
 */
export function reconcile(statement: BarclaysStatement): {
  expected: number | null
  actual: number | null
  difference: number | null
  ok: boolean
} {
  const { startBalance, endBalance, rows } = statement
  if (startBalance === null || endBalance === null) {
    return { expected: null, actual: endBalance, difference: null, ok: false }
  }
  const movement = rows.reduce((sum, r) => sum + Math.round(r.amount * 100), 0)
  const expected = Math.round(startBalance * 100) + movement
  const actual = Math.round(endBalance * 100)
  return {
    expected: expected / 100,
    actual: actual / 100,
    difference: (actual - expected) / 100,
    ok: expected === actual,
  }
}
