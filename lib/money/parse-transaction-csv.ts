import type { ParsedTransaction } from './spending-types'

export interface TransactionCsvResult {
  rows: ParsedTransaction[]
  errors: string[]
}

/** Minimal RFC-4180 splitter: quoted fields and escaped quotes. */
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
 * Forms like "February 4, 2026" parse to LOCAL midnight, so the calendar day is
 * read from local parts. Reading UTC parts shifts every date back one day in any
 * timezone ahead of UTC — already hit once in parse-pill-csv.ts.
 */
function toIsoDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // DD/MM/YYYY, read the British way round.
  const slash = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s)
  if (slash) {
    const [, d, m, y] = slash
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const parsed = new Date(s)
  if (Number.isNaN(parsed.getTime())) return null
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
}

/** Returns the magnitude, and whether brackets marked it as an outgoing. */
function toAmount(raw: string): { value: number; bracketed: boolean } | null {
  let s = raw.trim()
  if (!s) return null
  let bracketed = false
  const paren = /^\((.*)\)$/.exec(s)
  if (paren) { s = paren[1]; bracketed = true }
  s = s.replace(/[£$€,\s]/g, '')
  if (s === '' || s === '-') return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return { value: Math.round(n * 100) / 100, bracketed }
}

const ALIASES: Record<string, string[]> = {
  date: ['date', 'transaction date', 'txn date', 'posted', 'value date'],
  description: ['description', 'details', 'narrative', 'reference description', 'merchant', 'payee'],
  amount: ['amount', 'value', 'transaction amount'],
  debit: ['debit', 'paid out', 'money out', 'withdrawal', 'withdrawn'],
  credit: ['credit', 'paid in', 'money in', 'deposit'],
  type: ['type', 'dr/cr', 'debit/credit'],
  reference: ['reference', 'transaction id', 'transaction reference', 'id'],
  // Recognised only so it is never mistaken for the amount.
  balance: ['balance', 'running balance', 'closing balance'],
}

export function parseTransactionCsv(text: string): TransactionCsvResult {
  const errors: string[] = []
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length < 2) return { rows: [], errors: ['The file has no data rows.'] }

  const header = splitCsvLine(lines[0]).map(h => h.toLowerCase().replace(/[_-]+/g, ' ').trim())
  const col = (key: string) => header.findIndex(h => ALIASES[key].includes(h))

  const iDate = col('date')
  const iDesc = col('description')
  const iAmount = col('amount')
  const iDebit = col('debit')
  const iCredit = col('credit')
  const iType = col('type')
  const iRef = col('reference')

  if (iDate === -1) errors.push(`Could not find a date column. Found: ${header.join(', ')}`)
  if (iDesc === -1) errors.push(`Could not find a description column. Found: ${header.join(', ')}`)
  if (iAmount === -1 && iDebit === -1 && iCredit === -1) {
    errors.push(`Could not find an amount, debit or credit column. Found: ${header.join(', ')}`)
  }
  if (errors.length) return { rows: [], errors }

  const rows: ParsedTransaction[] = []

  lines.slice(1).forEach((line, n) => {
    const cells = splitCsvLine(line)
    const lineNo = n + 2

    const txn_date = toIsoDate(cells[iDate] ?? '')
    if (!txn_date) { errors.push(`Row ${lineNo}: unreadable date "${cells[iDate] ?? ''}".`); return }

    const description = (cells[iDesc] ?? '').trim()
    if (!description) { errors.push(`Row ${lineNo}: no description.`); return }

    let amount: number | null = null

    // Separate debit/credit columns take precedence: when a file has both, the
    // column a value appears in is the direction, unambiguously.
    if (iDebit !== -1 || iCredit !== -1) {
      const dr = iDebit !== -1 ? toAmount(cells[iDebit] ?? '') : null
      const cr = iCredit !== -1 ? toAmount(cells[iCredit] ?? '') : null
      if (dr && dr.value !== 0) amount = -Math.abs(dr.value)
      else if (cr && cr.value !== 0) amount = Math.abs(cr.value)
    }

    if (amount === null && iAmount !== -1) {
      const a = toAmount(cells[iAmount] ?? '')
      if (!a) { errors.push(`Row ${lineNo}: unreadable amount "${cells[iAmount] ?? ''}".`); return }
      amount = a.bracketed ? -Math.abs(a.value) : a.value

      // A DR/CR column overrides the sign, since such files usually print
      // magnitudes only.
      const type = (cells[iType] ?? '').trim().toUpperCase()
      if (iType !== -1 && type) {
        if (type.startsWith('DR') || type === 'D') amount = -Math.abs(amount)
        if (type.startsWith('CR') || type === 'C') amount = Math.abs(amount)
      }
    }

    if (amount === null) { errors.push(`Row ${lineNo}: no amount.`); return }
    // Statement filler lines ("balance carried forward") carry zero and are not
    // transactions. Silently skipping is right; erroring would be noise.
    if (amount === 0) return

    rows.push({
      txn_date,
      description,
      amount,
      external_id: iRef !== -1 ? (cells[iRef] || '').trim() || null : null,
    })
  })

  return { rows, errors }
}
