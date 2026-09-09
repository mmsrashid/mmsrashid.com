import {
  apportion, coveredMonths, accruedInPeriod, isAccrued,
} from '@/lib/money/accrual'
import { taxYearBounds } from '@/lib/money/property-pl'

describe('coveredMonths', () => {
  it('is inclusive of both ends', () => {
    expect(coveredMonths('2025-02-01', '2025-09-30'))
      .toEqual(['2025-02', '2025-03', '2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09'])
  })

  it('crosses a year boundary', () => {
    expect(coveredMonths('2024-11-01', '2025-02-28'))
      .toEqual(['2024-11', '2024-12', '2025-01', '2025-02'])
  })

  it('handles a single month', () => {
    expect(coveredMonths('2025-06-01', '2025-06-30')).toEqual(['2025-06'])
  })

  it('ignores the day of the month', () => {
    // "Covers to September" is the same whether written as the 1st or the 30th.
    expect(coveredMonths('2025-02-14', '2025-04-02'))
      .toEqual(['2025-02', '2025-03', '2025-04'])
  })

  it('returns nothing for a backwards period', () => {
    expect(coveredMonths('2025-09-01', '2025-02-01')).toEqual([])
  })
})

describe('apportion', () => {
  it('leaves a payment with no covered period alone', () => {
    // The existing cash behaviour, so adding accruals changes nothing until a
    // period is actually recorded.
    expect(apportion({ txn_date: '2025-02-28', amount: 10800 }))
      .toEqual([{ month: '2025-02', amount: 10800, effectiveDate: '2025-02-28' }])
  })

  it('splits equally across whole months', () => {
    const shares = apportion({
      txn_date: '2025-02-28', amount: 21600,
      covers_from: '2025-02-01', covers_to: '2025-09-30',
    })
    expect(shares).toHaveLength(8)
    expect(shares.every(s => s.amount === 2700)).toBe(true)
  })

  it('always adds back to the payment exactly', () => {
    // 1000 / 3 does not divide into pence evenly. A P&L that loses a penny per
    // month stops reconciling with the bank.
    const shares = apportion({
      txn_date: '2025-01-10', amount: 1000,
      covers_from: '2025-01-01', covers_to: '2025-03-31',
    })
    expect(shares.reduce((s, x) => s + x.amount, 0)).toBe(1000)
    expect(shares.map(s => s.amount)).toEqual([333.34, 333.33, 333.33])
  })

  it('dates each share mid-month so April lands in the right tax year', () => {
    // Tax years turn on the 6th. The 1st of April sits in the OLD year, so a
    // first-of-month anchor would push every April share backwards.
    const shares = apportion({
      txn_date: '2025-02-28', amount: 200,
      covers_from: '2025-03-01', covers_to: '2025-04-30',
    })
    expect(shares.map(s => s.effectiveDate)).toEqual(['2025-03-15', '2025-04-15'])

    const y2425 = taxYearBounds('2024/25')
    const y2526 = taxYearBounds('2025/26')
    expect(shares[0].effectiveDate <= y2425.to).toBe(true)
    expect(shares[1].effectiveDate >= y2526.from).toBe(true)
  })

  it('falls back to cash treatment on a backwards period', () => {
    // Bad data must not make the money disappear from the P&L.
    const shares = apportion({
      txn_date: '2025-02-28', amount: 500,
      covers_from: '2025-09-01', covers_to: '2025-02-01',
    })
    expect(shares).toEqual([{ month: '2025-02', amount: 500, effectiveDate: '2025-02-28' }])
  })

  it('accepts a numeric string, as PostgREST sends', () => {
    const shares = apportion({
      txn_date: '2025-02-28', amount: '21600',
      covers_from: '2025-02-01', covers_to: '2025-03-31',
    })
    expect(shares.map(s => s.amount)).toEqual([10800, 10800])
  })
})

describe('accruedInPeriod', () => {
  // The real case: £21,600 received in February 2025, covering to September.
  const advance = {
    txn_date: '2025-02-28', amount: 21600,
    covers_from: '2025-02-01', covers_to: '2025-09-30',
  }

  it('splits an advance across the tax year boundary', () => {
    // February and March in 2024/25; April to September in 2025/26.
    expect(accruedInPeriod(advance, taxYearBounds('2024/25'))).toBe(5400)
    expect(accruedInPeriod(advance, taxYearBounds('2025/26'))).toBe(16200)
  })

  it('accounts for the whole payment across both years', () => {
    const a = accruedInPeriod(advance, taxYearBounds('2024/25'))
    const b = accruedInPeriod(advance, taxYearBounds('2025/26'))
    expect(a + b).toBe(21600)
  })

  it('counts the whole payment when the period covers all of it', () => {
    expect(accruedInPeriod(advance, { from: '2025-01-01', to: '2025-12-31' })).toBe(21600)
  })

  it('counts nothing when the period misses it entirely', () => {
    expect(accruedInPeriod(advance, taxYearBounds('2023/24'))).toBe(0)
  })

  it('behaves as before for a payment with no covered period', () => {
    const cash = { txn_date: '2025-02-28', amount: 10800 }
    expect(accruedInPeriod(cash, taxYearBounds('2024/25'))).toBe(10800)
    expect(accruedInPeriod(cash, taxYearBounds('2025/26'))).toBe(0)
  })


  it('keeps an unaccrued payment on its own date, not mid-month', () => {
    // Rent paid on 2 April belongs to the tax year that ends on the 5th. A
    // mid-month anchor would move it into the next year without being asked.
    const shares = apportion({ txn_date: '2025-04-02', amount: 1200 })
    expect(shares[0].effectiveDate).toBe('2025-04-02')
    expect(accruedInPeriod({ txn_date: '2025-04-02', amount: 1200 },
      taxYearBounds('2024/25'))).toBe(1200)
    expect(accruedInPeriod({ txn_date: '2025-04-02', amount: 1200 },
      taxYearBounds('2025/26'))).toBe(0)
  })
})

describe('isAccrued', () => {
  it('is false without a covered period', () => {
    expect(isAccrued({ txn_date: '2025-02-28', amount: 100 })).toBe(false)
  })

  it('is false when the period is just the month it arrived in', () => {
    expect(isAccrued({
      txn_date: '2025-02-28', amount: 100,
      covers_from: '2025-02-01', covers_to: '2025-02-28',
    })).toBe(false)
  })

  it('is true when it spans several months', () => {
    expect(isAccrued({
      txn_date: '2025-02-28', amount: 100,
      covers_from: '2025-02-01', covers_to: '2025-09-30',
    })).toBe(true)
  })

  it('is true for a single month that is not the month of payment', () => {
    // Rent paid in March for April only still belongs to April.
    expect(isAccrued({
      txn_date: '2025-03-28', amount: 100,
      covers_from: '2025-04-01', covers_to: '2025-04-30',
    })).toBe(true)
  })
})
