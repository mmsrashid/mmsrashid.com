export interface CsvBalanceRow {
  account_name: string
  as_of: string
  balance: number
}

export interface CsvParseResult {
  rows: CsvBalanceRow[]
  errors: string[]
}

/** Minimal RFC-4180 line splitter: handles quoted fields and escaped quotes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') inQuotes = false
      else cur += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out.map(s => s.trim())
}

/**
 * Normalises a date cell to YYYY-MM-DD.
 *
 * Forms like "January 31, 2025" parse to LOCAL midnight, so the calendar day
 * must be read from local parts. Reading UTC parts here shifts every date back
 * one day in any timezone ahead of UTC — a bug this codebase already hit once
 * in parse-pill-csv.ts.
 */
function toIsoDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // Prefer DD/MM/YYYY over the US reading: this is a UK codebase.
  const slash = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s)
  if (slash) {
    const [, d, m, y] = slash
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const parsed = new Date(s)
  if (Number.isNaN(parsed.getTime())) return null
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
}

function toAmount(raw: string): number | null {
  let s = raw.trim()
  if (!s) return null
  // Accountancy convention: (500.00) means -500.
  const negated = /^\((.*)\)$/.exec(s)
  if (negated) s = `-${negated[1]}`
  s = s.replace(/[£$€,\s]/g, '')
  if (s === '' || s === '-') return null
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

const HEADER_ALIASES: Record<string, string[]> = {
  account: ['account', 'account name', 'name', 'description'],
  date: ['date', 'as of', 'as_of', 'as at', 'statement date'],
  balance: ['balance', 'amount', 'value', 'closing balance'],
}

export function parseBalanceCsv(text: string): CsvParseResult {
  const errors: string[] = []
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length < 2) {
    return { rows: [], errors: ['The file has no data rows.'] }
  }

  const header = splitCsvLine(lines[0]).map(h => h.toLowerCase().replace(/[_-]+/g, ' ').trim())
  const findCol = (key: string) =>
    header.findIndex(h => HEADER_ALIASES[key].includes(h))

  const iAccount = findCol('account')
  const iDate = findCol('date')
  const iBalance = findCol('balance')

  for (const [key, idx] of [['account', iAccount], ['date', iDate], ['balance', iBalance]] as const) {
    if (idx === -1) errors.push(`Could not find a ${key} column. Found: ${header.join(', ')}`)
  }
  if (errors.length) return { rows: [], errors }

  const rows: CsvBalanceRow[] = []
  lines.slice(1).forEach((line, n) => {
    const cells = splitCsvLine(line)
    const name = (cells[iAccount] ?? '').trim()
    const as_of = toIsoDate(cells[iDate] ?? '')
    const balance = toAmount(cells[iBalance] ?? '')

    if (!name) { errors.push(`Row ${n + 2}: no account name.`); return }
    if (!as_of) { errors.push(`Row ${n + 2}: unreadable date "${cells[iDate] ?? ''}".`); return }
    if (balance === null) { errors.push(`Row ${n + 2}: unreadable balance "${cells[iBalance] ?? ''}".`); return }

    rows.push({ account_name: name, as_of, balance })
  })

  return { rows, errors }
}
