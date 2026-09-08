import { parseBalanceCsv } from '@/lib/money/parse-csv'

/** Newline, kept in a constant so shell heredocs cannot mangle the escape. */
const SEP = String.fromCharCode(10)

describe('parseBalanceCsv', () => {
  it('parses account, date and balance', () => {
    const r = parseBalanceCsv('Account,Date,Balance\nBarclays Current,2025-01-31,1234.56')
    expect(r.rows).toEqual([
      { account_name: 'Barclays Current', as_of: '2025-01-31', balance: 1234.56 },
    ])
    expect(r.errors).toEqual([])
  })

  it('reads the calendar day from local parts, not UTC', () => {
    // "January 31, 2025" parses to LOCAL midnight. Reading UTC parts would
    // shift it to the 30th in any timezone ahead of UTC.
    const r = parseBalanceCsv('Account,Date,Balance\nA,"January 31, 2025",10')
    expect(r.rows[0].as_of).toBe('2025-01-31')
  })

  it('reads DD/MM/YYYY the British way round', () => {
    const r = parseBalanceCsv('Account,Date,Balance\nA,03/02/2025,10')
    expect(r.rows[0].as_of).toBe('2025-02-03')
  })

  it('strips currency symbols and thousands separators', () => {
    const r = parseBalanceCsv('Account,Date,Balance\nA,2025-01-31,"£1,234.56"')
    expect(r.rows[0].balance).toBe(1234.56)
  })

  it('reads a parenthesised amount as negative', () => {
    const r = parseBalanceCsv('Account,Date,Balance\nA,2025-01-31,(500.00)')
    expect(r.rows[0].balance).toBe(-500)
  })

  it('reports an unreadable date instead of dropping the row silently', () => {
    const r = parseBalanceCsv('Account,Date,Balance\nA,not-a-date,10')
    expect(r.rows).toEqual([])
    expect(r.errors[0]).toMatch(/date/i)
  })

  it('reports a missing required column', () => {
    const r = parseBalanceCsv('Account,Balance\nA,10')
    expect(r.rows).toEqual([])
    expect(r.errors[0]).toMatch(/date/i)
  })

  it('handles quoted fields containing commas', () => {
    const r = parseBalanceCsv('Account,Date,Balance\n"Smith, J current",2025-01-31,10')
    expect(r.rows[0].account_name).toBe('Smith, J current')
  })

  it('keeps good rows and reports bad ones alongside', () => {
    const r = parseBalanceCsv([
      'Account,Date,Balance',
      'A,2025-01-31,10',
      'B,rubbish,20',
      'C,2025-02-28,30',
    ].join('\n'))
    expect(r.rows.map(x => x.account_name)).toEqual(['A', 'C'])
    expect(r.errors).toHaveLength(1)
  })

  it('accepts alternative header names', () => {
    const r = parseBalanceCsv('Name,As At,Closing Balance\nA,2025-01-31,10')
    expect(r.rows[0]).toEqual({ account_name: 'A', as_of: '2025-01-31', balance: 10 })
  })
})

describe('balance vs transaction disambiguation', () => {
  it('refuses a Barclays transaction feed rather than reading it as balances', () => {
    // The bug that caused real damage: this header has account + date + amount,
    // so the balance parser claimed it and stored 33 transaction amounts as
    // balance snapshots. The Memo column is the tell.
    const r = parseBalanceCsv([
      'Number,Date,Account,Amount,Subcategory,Memo',
      '1,03/03/2025,"20-29-41 40261467",-775.00,Bills,MORTGAGE',
    ].join(SEP))
    expect(r.rows).toEqual([])
    expect(r.errors[0]).toMatch(/transaction feed/i)
  })

  it('refuses a Starling feed too', () => {
    const r = parseBalanceCsv([
      'Date,Counter Party,Reference,Type,Amount (GBP),Balance (GBP)',
      '06/08/2026,Tesco,,CARD_PAYMENT,-42.10,1957.90',
    ].join(SEP))
    expect(r.rows).toEqual([])
    expect(r.errors[0]).toMatch(/transaction feed/i)
  })

  it('still accepts a genuine balance list', () => {
    const r = parseBalanceCsv([
      'Account,Date,Balance',
      'Barclays Current,2026-01-31,1234.56',
    ].join(SEP))
    expect(r.errors).toEqual([])
    expect(r.rows[0]).toEqual({
      account_name: 'Barclays Current', as_of: '2026-01-31', balance: 1234.56,
    })
  })

  it('does not treat an amount column as a balance', () => {
    const r = parseBalanceCsv(['Account,Date,Amount', 'A,2026-01-31,10'].join(SEP))
    expect(r.rows).toEqual([])
  })
})
