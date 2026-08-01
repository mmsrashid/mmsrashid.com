/**
 * Parses a pill-tracker CSV exported from Notion, shaped one row per day with
 * one checkbox column per medicine.
 *
 * Notion exports checkboxes as Yes/No, but people hand-edit these files, so a
 * generous set of truthy markers is accepted.
 */

const TRUTHY = new Set(['yes', 'y', 'true', '1', 'x', '✓', '✔', 'taken', 'done', 'checked', '☑'])
const FALSY = new Set(['', 'no', 'n', 'false', '0', '-', '—', 'missed', 'unchecked', '☐'])

const DATE_HEADER = /\b(date|day|log\s*date|when)\b/i

/** RFC-4180-ish split: handles quoted fields containing commas and escaped quotes. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else { inQuotes = false }
      } else cur += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out.map(s => s.trim())
}

/**
 * Accepts YYYY-MM-DD, DD/MM/YYYY, and the "August 1, 2026" form Notion emits.
 * Day-first is assumed for ambiguous slash dates, matching UK convention.
 */
export function parseDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const slash = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/)
  if (slash) {
    const d = Number(slash[1]), m = Number(slash[2])
    let y = Number(slash[3])
    if (y < 100) y += 2000
    if (m < 1 || m > 12 || d < 1 || d > 31) return null
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  // Forms like "August 1, 2026" parse to LOCAL midnight, so the calendar day
  // must be read from local parts. Reading UTC parts here shifts every date
  // back one day in any timezone ahead of UTC.
  const parsed = new Date(s)
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
  }
  return null
}

export interface ParsedPillCsv {
  /** Medicine column headers, in file order. */
  medicineNames: string[]
  /** One entry per (day, medicine) cell that carried a usable value. */
  cells: { date: string; medicineName: string; taken: boolean }[]
  /** Rows whose date could not be read, reported rather than dropped silently. */
  skippedRows: number
  /** Cell values that were neither truthy nor falsy. */
  unrecognisedValues: string[]
}

export function parsePillCsv(text: string): ParsedPillCsv {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '')
  if (lines.length < 2) {
    return { medicineNames: [], cells: [], skippedRows: 0, unrecognisedValues: [] }
  }

  const header = splitCsvLine(lines[0]!)
  // Prefer an explicitly named date column; otherwise assume the first.
  let dateIdx = header.findIndex(h => DATE_HEADER.test(h))
  if (dateIdx === -1) dateIdx = 0

  const medCols = header
    .map((name, idx) => ({ name, idx }))
    .filter(c => c.idx !== dateIdx && c.name !== '')

  const cells: ParsedPillCsv['cells'] = []
  const unrecognised = new Set<string>()
  let skippedRows = 0

  for (const line of lines.slice(1)) {
    const row = splitCsvLine(line)
    const date = parseDate(row[dateIdx] ?? '')
    if (!date) { skippedRows++; continue }

    for (const col of medCols) {
      const raw = (row[col.idx] ?? '').trim()
      const key = raw.toLowerCase()
      if (FALSY.has(key)) { cells.push({ date, medicineName: col.name, taken: false }); continue }
      if (TRUTHY.has(key)) { cells.push({ date, medicineName: col.name, taken: true }); continue }
      unrecognised.add(raw)
    }
  }

  return {
    medicineNames: medCols.map(c => c.name),
    cells,
    skippedRows,
    unrecognisedValues: [...unrecognised].slice(0, 10),
  }
}
