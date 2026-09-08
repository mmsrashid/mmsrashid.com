import { parseTransactionCsv } from '@/lib/money/parse-transaction-csv'

/** Newline, kept in a constant so shell heredocs cannot mangle the escape. */
const SEP = String.fromCharCode(10)

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

  it('uses a transaction id column as the identity', () => {
    const r = parseTransactionCsv(
      'Date,Description,Amount,Transaction ID\n2026-02-04,PRET,-1,TXN-99')
    expect(r.rows[0].external_id).toBe('TXN-99')
  })

  it('does NOT use a bare reference column as the identity', () => {
    // Superseded behaviour, changed deliberately. In a Starling export
    // "Reference" is the payment reference, which is frequently identical every
    // month ("RENT"). Treating it as an identity collapsed twelve months of rent
    // into a single transaction. It is folded into the description instead, where
    // it is useful for rule matching and harmless.
    const r = parseTransactionCsv(
      'Date,Description,Amount,Reference\n2026-02-04,PRET,-1,TXN-99')
    expect(r.rows[0].external_id).toBeNull()
    expect(r.rows[0].description).toBe('PRET TXN-99')
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

  describe('Starling export', () => {
    // The real header from a Starling feed_export CSV.
    const HEADER = 'Date,Counter Party,Reference,Type,Amount (GBP),Balance (GBP),Spending Category,Notes'

    it('parses a Starling row', () => {
      const r = parseTransactionCsv([
        HEADER,
        '06/08/2026,Tesco Stores,,CARD_PAYMENT,-42.10,1957.90,GROCERIES,',
      ].join('\n'))
      expect(r.errors).toEqual([])
      expect(r.rows[0]).toEqual({
        txn_date: '2026-08-06', description: 'Tesco Stores', amount: -42.1, external_id: null,
      })
    })

    it('strips the currency suffix so "Amount (GBP)" is found', () => {
      // Without this the amount column is invisible and the whole file is refused.
      const r = parseTransactionCsv([HEADER, '06/08/2026,X,,CARD_PAYMENT,-1.00,10,,'].join('\n'))
      expect(r.rows[0].amount).toBe(-1)
    })

    it('does not mistake "Balance (GBP)" for the amount', () => {
      const r = parseTransactionCsv([HEADER, '06/08/2026,X,,CARD_PAYMENT,-42.10,1957.90,,'].join('\n'))
      expect(r.rows[0].amount).toBe(-42.1)
    })

    it('folds the payment reference into the description', () => {
      // Starling puts the useful detail — a property code — in Reference.
      const r = parseTransactionCsv([
        HEADER,
        '01/08/2026,J Smith,RENT 4FLH,FASTER_PAYMENT,1250.00,3207.90,,',
      ].join('\n'))
      expect(r.rows[0].description).toBe('J Smith RENT 4FLH')
    })

    it('does not duplicate a reference already in the counter party', () => {
      const r = parseTransactionCsv([
        HEADER, '01/08/2026,RENT 4FLH,RENT 4FLH,FASTER_PAYMENT,1250.00,10,,',
      ].join('\n'))
      expect(r.rows[0].description).toBe('RENT 4FLH')
    })

    it('never uses a payment reference as the transaction identity', () => {
      // The critical case: twelve months of rent share the reference "RENT".
      // Treating that as an id would collapse them into one transaction and
      // understate the year by eleven months of income.
      const r = parseTransactionCsv([
        HEADER,
        '01/06/2026,J Smith,RENT,FASTER_PAYMENT,1250.00,10,,',
        '01/07/2026,J Smith,RENT,FASTER_PAYMENT,1250.00,20,,',
        '01/08/2026,J Smith,RENT,FASTER_PAYMENT,1250.00,30,,',
      ].join('\n'))
      expect(r.rows).toHaveLength(3)
      expect(r.rows.every(x => x.external_id === null)).toBe(true)
    })

    it('leaves a non-DR/CR type column alone', () => {
      // CARD_PAYMENT must not be read as a direction. Starling already signs
      // the amount, so touching it would flip real transactions.
      const r = parseTransactionCsv([
        HEADER,
        '06/08/2026,Refund Co,,CARD_PAYMENT,25.00,10,,',
      ].join('\n'))
      expect(r.rows[0].amount).toBe(25)
    })

    it('still honours a genuine DEBIT/CREDIT type column', () => {
      const r = parseTransactionCsv([
        'Date,Description,Amount,Type',
        '06/08/2026,X,25.00,DEBIT',
        '07/08/2026,Y,25.00,CREDIT',
      ].join('\n'))
      expect(r.rows.map(x => x.amount)).toEqual([-25, 25])
    })
  })

  describe('Barclays export', () => {
    const HEADER = 'Number,Date,Account,Amount,Subcategory,Memo'

    it('parses a Barclays row using Memo as the description', () => {
      const r = parseTransactionCsv([
        HEADER,
        '1,03/03/2025,"20-29-41 40261467",-775.00,Bills,"MORTGAGE PAYMENT 4FLH"',
      ].join(SEP))
      expect(r.errors).toEqual([])
      expect(r.rows[0]).toMatchObject({
        txn_date: '2025-03-03', description: 'MORTGAGE PAYMENT 4FLH', amount: -775,
      })
    })

    it('reports the account identifiers named in the file', () => {
      const r = parseTransactionCsv([
        HEADER,
        '1,03/03/2025,"20-29-41 40261467",-775.00,Bills,MORTGAGE',
        '2,04/03/2025,"20-29-41 40261467",294.46,Other,RENT',
      ].join(SEP))
      expect(r.accountHints).toEqual(['20-29-41 40261467'])
    })
  })

  it('accepts alternative header names', () => {
    const r = parseTransactionCsv('Transaction Date,Narrative,Paid Out\n2026-02-04,PRET,3.20')
    expect(r.rows[0]).toEqual({
      txn_date: '2026-02-04', description: 'PRET', amount: -3.2, external_id: null,
    })
  })
})
