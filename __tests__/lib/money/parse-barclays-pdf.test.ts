import {
  parseBarclaysPdf, reconcile, type PdfLine,
} from '@/lib/money/parse-barclays-pdf'

/**
 * Column positions are taken from a real statement:
 *   Date 58 · Description 92 · Money out 256 · Money in 318 · Balance 377
 * Values sit right-aligned under their heading, so a wide number starts
 * further left than a narrow one in the same column.
 */
const HEADER: PdfLine = {
  page: 1, y: 765,
  tokens: [
    { text: 'Date', x: 58 }, { text: 'Description', x: 92 },
    { text: 'Money out', x: 256 }, { text: 'Money in', x: 318 },
    { text: 'Balance', x: 377 },
  ],
}

let y = 750
const line = (tokens: { text: string; x: number }[], page = 1): PdfLine =>
  ({ page, y: (y -= 10), tokens })

const reset = () => { y = 750 }

const period = (text: string): PdfLine =>
  ({ page: 1, y: 800, tokens: [{ text, x: 400 }] })

const out = (v: string) => ({ text: v, x: 280 })
const inn = (v: string) => ({ text: v, x: 326 })
const bal = (v: string) => ({ text: v, x: 378 })
const date = (v: string) => ({ text: v, x: 58 })
const desc = (v: string) => ({ text: v, x: 109 })

beforeEach(reset)

describe('statement period and years', () => {
  it('reads a period with both years printed', () => {
    const s = parseBarclaysPdf([period('03 Oct 2019 - 02 Jan 2020'), HEADER])
    expect(s.period).toEqual({ from: '2019-10-03', to: '2020-01-02' })
  })

  it('reads a period with one year, inferring the earlier one', () => {
    // "02 Apr - 02 Jul 2021" is wholly within 2021.
    expect(parseBarclaysPdf([period('02 Apr - 02 Jul 2021'), HEADER]).period)
      .toEqual({ from: '2021-04-02', to: '2021-07-02' })
    // Ending in an earlier month means the span crossed a new year.
    expect(parseBarclaysPdf([period('03 Oct - 02 Jan 2020'), HEADER]).period)
      .toEqual({ from: '2019-10-03', to: '2020-01-02' })
  })

  it('falls back to the statement-date pair', () => {
    const s = parseBarclaysPdf([
      { page: 1, y: 810, tokens: [{ text: 'Statement date 02 Jan 2020', x: 400 }] },
      { page: 1, y: 799, tokens: [{ text: 'Last statement 02 Oct 2019', x: 400 }] },
      HEADER,
    ])
    expect(s.period).toEqual({ from: '2019-10-02', to: '2020-01-02' })
  })

  it('imports nothing when the period cannot be found', () => {
    // The rows carry no year of their own, so guessing would file a whole
    // quarter into the wrong tax year and look correct doing it.
    const s = parseBarclaysPdf([
      HEADER,
      line([date('15 Oct'), desc('Direct Debit to Anyone'), out('96.57')]),
    ])
    expect(s.rows).toEqual([])
    expect(s.warnings[0]).toMatch(/year of each transaction is unknown/i)
  })

  it('advances the year when the month goes backwards', () => {
    // The whole reason this parser exists: Oct, Nov, Dec are 2019 and Jan is
    // 2020, and only the running month order says so.
    const s = parseBarclaysPdf([
      period('03 Oct 2019 - 02 Jan 2020'), HEADER,
      line([date('03 Oct'), desc('A'), inn('100.00')]),
      line([date('20 Nov'), desc('B'), inn('100.00')]),
      line([date('15 Dec'), desc('C'), inn('100.00')]),
      line([date('02 Jan'), desc('D'), inn('100.00')]),
    ])
    expect(s.rows.map(r => r.txn_date))
      .toEqual(['2019-10-03', '2019-11-20', '2019-12-15', '2020-01-02'])
  })
})

describe('transaction rows', () => {
  const withPeriod = (rows: PdfLine[]) =>
    parseBarclaysPdf([period('02 Apr - 02 Jul 2021'), HEADER, ...rows])

  it('reads money out as negative and money in as positive', () => {
    const s = withPeriod([
      line([date('15 Apr'), desc('Direct Debit to London Borough of'), out('96.57')]),
      line([date('19 Apr'), desc('Received From Lara Khalil'), inn('1,586.00')]),
    ])
    expect(s.rows).toEqual([
      { txn_date: '2021-04-15', description: 'Direct Debit to London Borough of', amount: -96.57, external_id: null },
      { txn_date: '2021-04-19', description: 'Received From Lara Khalil', amount: 1586, external_id: null },
    ])
  })

  it('decides the column by position, not by order on the line', () => {
    // A wide money-out value starts further left than a narrow money-in one.
    // Counting numbers would call the first one "out" regardless.
    const s = withPeriod([
      line([date('20 Apr'), desc('Big payment'), { text: '10,338.74', x: 268 }, bal('1,000.00')]),
      line([date('21 Apr'), desc('Small receipt'), { text: '9.00', x: 334 }, bal('1,009.00')]),
    ])
    expect(s.rows.map(r => r.amount)).toEqual([-10338.74, 9])
  })

  it('never treats the balance column as an amount', () => {
    const s = withPeriod([
      line([date('15 Apr'), desc('Only a balance shown'), out('96.57'), bal('5,144.15')]),
    ])
    expect(s.rows).toHaveLength(1)
    expect(s.rows[0].amount).toBe(-96.57)
  })

  it('inherits the date when a row omits it', () => {
    // Barclays prints the date once per day; the second transaction that day
    // has no date token at all.
    const s = withPeriod([
      line([date('17 May'), desc('First that day'), out('96.57')]),
      line([desc('Second that day'), inn('1,586.00'), bal('7,731.67')]),
    ])
    expect(s.rows.map(r => [r.txn_date, r.amount]))
      .toEqual([['2021-05-17', -96.57], ['2021-05-17', 1586]])
  })

  it('appends a Ref line to the description above it', () => {
    // The reference is often the only thing distinguishing two identical rows,
    // so losing it would collapse them in the dedupe key.
    const s = withPeriod([
      line([date('24 May'), desc('Direct Debit to Bham Midshires'), out('413.07')]),
      line([desc('Ref: 432605/20025432605')]),
      line([desc('Direct Debit to Bham Midshires'), out('796.51')]),
      line([desc('Ref: 624083/20025624083')]),
    ])
    expect(s.rows.map(r => r.description)).toEqual([
      'Direct Debit to Bham Midshires Ref: 432605/20025432605',
      'Direct Debit to Bham Midshires Ref: 624083/20025624083',
    ])
  })

  it('records the printed balances without treating them as transactions', () => {
    const s = withPeriod([
      line([date('02 Apr'), desc('Start balance'), bal('5,240.72')]),
      line([date('15 Apr'), desc('A payment'), out('100.00')]),
      line([date('02 Jul'), desc('End balance'), bal('5,140.72')]),
    ])
    expect(s.rows).toHaveLength(1)
    expect(s.startBalance).toBe(5240.72)
    expect(s.endBalance).toBe(5140.72)
  })

  it('stops at the closing balance', () => {
    // Footers carry figures too, and they are not transactions.
    const s = withPeriod([
      line([date('15 Apr'), desc('A payment'), out('100.00')]),
      line([desc('End balance'), bal('900.00')]),
      line([desc('Interest rate'), out('1.50')]),
    ])
    expect(s.rows).toHaveLength(1)
  })

  it('re-arms the columns from a repeated header on later pages', () => {
    const s = parseBarclaysPdf([
      period('02 Apr - 02 Jul 2021'), HEADER,
      line([date('15 Apr'), desc('Page one'), out('10.00')]),
      { page: 2, y: 765, tokens: HEADER.tokens },
      { page: 2, y: 750, tokens: [date('16 Apr'), desc('Page two'), out('20.00')] },
    ])
    expect(s.rows.map(r => r.description)).toEqual(['Page one', 'Page two'])
  })

  it('warns when a row falls outside the statement period', () => {
    // The year walk going wrong is otherwise invisible.
    const s = parseBarclaysPdf([
      period('02 Apr - 02 Jul 2021'), HEADER,
      line([date('15 Apr'), desc('In period'), out('10.00')]),
      line([date('15 Mar'), desc('Rolled the year forward'), out('20.00')]),
    ])
    expect(s.warnings.some(w => /outside the statement period/i.test(w))).toBe(true)
  })

  it('ignores a row with no amount in either money column', () => {
    const s = withPeriod([line([date('15 Apr'), desc('A note with no figures')])])
    expect(s.rows).toEqual([])
  })
})

describe('documents that are not statements', () => {
  it('names a Statement of Fees instead of reporting nothing found', () => {
    const s = parseBarclaysPdf([
      { page: 1, y: 800, tokens: [{ text: 'Statement of Fees', x: 60 }] },
      { page: 1, y: 700, tokens: [{ text: 'From 03/02/2020 to 02/02/2021', x: 60 }] },
    ])
    expect(s.rows).toEqual([])
    expect(s.warnings[0]).toMatch(/statement of fees/i)
  })

  it('reports finding no rows when the layout is there but empty', () => {
    const s = parseBarclaysPdf([period('02 Apr - 02 Jul 2021'), HEADER])
    expect(s.warnings.some(w => /no transaction rows/i.test(w))).toBe(true)
  })
})

describe('account hints', () => {
  it('picks up the sort code and account number', () => {
    const s = parseBarclaysPdf([
      { page: 1, y: 812, tokens: [{ text: 'Sort code 20-29-41 • Account number 40261467', x: 59 }] },
      period('02 Apr - 02 Jul 2021'), HEADER,
    ])
    expect(s.accountHints).toContainEqual({ sortCode: '20-29-41', accountNumber: '40261467' })
  })
})

describe('reconcile', () => {
  const s = (rows: number[], start: number, end: number) => ({
    rows: rows.map((amount, i) => ({
      txn_date: '2021-04-0' + (i + 1), description: 'x', amount, external_id: null,
    })),
    accountHints: [], period: { from: '2021-04-01', to: '2021-07-01' },
    startBalance: start, endBalance: end, warnings: [],
  })

  it('confirms a statement that adds up', () => {
    expect(reconcile(s([-100, 250], 1000, 1150)))
      .toEqual({ expected: 1150, actual: 1150, difference: 0, ok: true })
  })

  it('reports the shortfall when a row was missed', () => {
    // The whole point: a dropped line is arithmetic, not a matter of trust.
    const r = reconcile(s([-100], 1000, 1150))
    expect(r.ok).toBe(false)
    expect(r.difference).toBe(250)
  })

  it('cannot confirm without both printed balances', () => {
    const partial = { ...s([-100], 1000, 900), startBalance: null }
    expect(reconcile(partial).ok).toBe(false)
  })

  it('sums in pence, so many small rows do not drift', () => {
    const rows = Array.from({ length: 300 }, () => -0.01)
    expect(reconcile(s(rows, 100, 97)).ok).toBe(true)
  })
})
