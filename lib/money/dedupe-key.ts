import { createHash } from 'crypto'
import type { ParsedTransaction } from './spending-types'

/**
 * Reduces a bank description to the part that identifies the transaction.
 *
 * Banks reformat descriptions between export formats and add reference numbers
 * and dates that vary run to run. Without stripping those, the same transaction
 * re-exported differently would look new and be imported twice.
 */
export function normaliseDescription(raw: string): string {
  return raw
    .toLowerCase()
    // "on 04 feb", "on 04/02" — card-present date markers
    .replace(/\bon\s+\d{1,2}[\s/-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2})\b.*$/i, '')
    // "ref 998812", "reference: 998812"
    .replace(/\bref(erence)?[:\s]+\S+.*$/i, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

/** The identity of a transaction, excluding which occurrence of it this is. */
export function groupKey(accountId: string, row: ParsedTransaction): string {
  const pence = Math.round(row.amount * 100)
  return `${accountId}|${row.txn_date}|${pence}|${normaliseDescription(row.description)}`
}

/**
 * Keys for a batch that represents a complete window — a statement import.
 *
 * Occurrence indices count from 0 within the batch, so:
 *   - two identical purchases in one statement take indices 0 and 1 and both survive
 *   - re-importing that statement regenerates 0 and 1, the upsert matches, nothing doubles
 *   - an overlapping statement regenerates the same indices for shared rows, so they collapse
 *   - a genuine third purchase appears as a third row in a later statement and takes index 2
 *
 * Crucially this does NOT consult what is already stored. Whether an identical
 * incoming row is a re-import or a new purchase cannot be decided from the row —
 * it depends on how it arrived. Treating a whole-window import as authoritative
 * for its window is what makes the arithmetic work.
 */
export function buildImportKeys(accountId: string, rows: ParsedTransaction[]): string[] {
  const nextIndex = new Map<string, number>()

  return rows.map(row => {
    // A bank-supplied reference is authoritative and immune to reformatting.
    if (row.external_id) return sha(`${accountId}|ext|${row.external_id}`)

    const group = groupKey(accountId, row)
    const i = nextIndex.get(group) ?? 0
    nextIndex.set(group, i + 1)
    return sha(`${group}|${i}`)
  })
}

/**
 * The key for a single transaction added by hand.
 *
 * A manual addition asserts this purchase happened *in addition* to what is on
 * record, so it takes the next free index rather than colliding with an
 * identical stored row. `storedKeysForGroup` holds the keys already stored for
 * this exact group.
 */
export function buildAppendKey(
  accountId: string,
  row: ParsedTransaction,
  storedKeysForGroup: ReadonlySet<string>,
): string {
  if (row.external_id) return sha(`${accountId}|ext|${row.external_id}`)

  const group = groupKey(accountId, row)
  let i = 0
  while (storedKeysForGroup.has(sha(`${group}|${i}`))) i++
  return sha(`${group}|${i}`)
}
