import { parseTransactionCsv } from '@/lib/money/parse-transaction-csv'

describe('parseTransactionCsv', () => {
  it('parses a single signed amount column', () => {
    const r = parseTransactionCsv('Date,Description,Amount\n2026-02-04,PRET,-3.20')
    expect(r.rows).toEqual([
      { txn_date: '2026-02-04', description: 'PRET', amount: -3.2, external_id: null },
    ])
    expect(r.errors).toEqual([])
  })

  it('normalises separate debit and credit columns', () => {
    const r = parseTransactionCsv([
      'Date,Description,Debit,Credit',
      '2026-02-04,PRET,3.20,',
      '2026-02-05,SALARY,,2000.00',
    ].join('\n'))
    expect(r.rows.map(x => x.amount)).toEqual([-3.2, 2000])
  })

  it('reads a bracketed amount as money out', () => {
    const r = parseTransactionCsv('Date,Description,Amount\n2026-02-04,PRET,(3.20)')
    expect(r.rows[0].amount).toBe(-3.2)
  })

  it('applies a DR/CR type column', () => {
    const r = parseTransactionCsv([
      'Date,Description,Amount,Type',
      '2026-02-04,PRET,3.20,DR',
      '2026-02-05,SALARY,2000.00,CR',
    ].join('\n'))
    expect(r.rows.map(x => x.amount)).toEqual([-3.2, 2000])
  })

  it('reads DD/MM/YYYY the British way round', () => {
    const r = parseTransactionCsv('Date,Description,Amount\n03/02/2026,PRET,-1')
    expect(r.rows[0].txn_date).toBe('2026-02-03')
  })

  it('reads the calendar day from local parts, not UTC', () => {
    const r = parseTransactionCsv('Date,Description,Amount\n"February 4, 2026",PRET,-1')
    expect(r.rows[0].txn_date).toBe('2026-02-04')
  })

  it('picks up a bank reference column when present', () => {
    const r = parseTransactionCsv('Date,Description,Amount,Reference\n2026-02-04,PRET,-1,TXN-99')
    expect(r.rows[0].external_id).toBe('TXN-99')
  })

  it('ignores a running balance column', () => {
    // Mistaking the balance for the amount would corrupt every figure.
    const r = parseTransactionCsv('Date,Description,Amount,Balance\n2026-02-04,PRET,-3.20,996.80')
    expect(r.rows[0].amount).toBe(-3.2)
  })

  it('strips currency symbols and thousands separators', () => {
    const r = parseTransactionCsv('Date,Description,Amount\n2026-02-04,RENT,"-£1,200.00"')
    expect(r.rows[0].amount).toBe(-1200)
  })

  it('reports a missing required column', () => {
    const r = parseTransactionCsv('Description,Amount\nPRET,-1')
    expect(r.rows).toEqual([])
    expect(r.errors[0]).toMatch(/date/i)
  })

  it('keeps good rows and reports bad ones', () => {
    const r = parseTransactionCsv([
      'Date,Description,Amount',
      '2026-02-04,PRET,-1',
      'rubbish,PRET,-1',
      '2026-02-06,PRET,-2',
    ].join('\n'))
    expect(r.rows).toHaveLength(2)
    expect(r.errors).toHaveLength(1)
  })

  it('skips a zero-amount row without erroring', () => {
    const r = parseTransactionCsv('Date,Description,Amount\n2026-02-04,BALANCE CARRIED,0.00')
    expect(r.rows).toEqual([])
    expect(r.errors).toEqual([])
  })

  it('handles quoted descriptions containing commas', () => {
    const r = parseTransactionCsv('Date,Description,Amount\n2026-02-04,"SMITH, J LTD",-1')
    expect(r.rows[0].description).toBe('SMITH, J LTD')
  })

  it('accepts alternative header names', () => {
    const r = parseTransactionCsv('Transaction Date,Narrative,Paid Out\n2026-02-04,PRET,3.20')
    expect(r.rows[0]).toEqual({
      txn_date: '2026-02-04', description: 'PRET', amount: -3.2, external_id: null,
    })
  })
})
