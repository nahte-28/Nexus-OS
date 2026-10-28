import { describe, expect, it } from 'vitest'
import { budgetWarnings, formatMoney, mergeBudget, monthLabel, monthSummary, parseAmount, parseBudgetState, shiftMonth, type BudgetState, type Transaction } from './budget'

const now = new Date(2026, 9, 15, 12).getTime()
const tx = (id: string, amount: number, over: Partial<Transaction> = {}): Transaction => ({
  id, kind: 'expense', amount, category: 'Eten en drinken', note: '', date: '2026-10-10', createdAt: 0, updatedAt: 1, deletedAt: null, ...over,
})

describe('Budget', () => {
  it('reads amounts and writes euros the Belgian way', () => {
    expect(parseAmount('12,50')).toBe(1250)
    expect(parseAmount('€ 3')).toBe(300)
    expect(parseAmount('4.2')).toBe(420)
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('0')).toBeNull()
    expect(formatMoney(1250).replace(/\s/g, ' ')).toBe('€ 12,50')
    expect(formatMoney(-500, true).replace(/\s/g, ' ')).toBe('−€ 5,00')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(monthLabel('2026-10')).toBe('oktober 2026')
  })

  it('sums a month against the budget', () => {
    const s: BudgetState = {
      transactions: [tx('a', 3000), tx('b', 1000, { category: 'Vervoer' }), tx('c', 5000, { kind: 'income', category: 'Job' }), tx('d', 999, { date: '2026-09-30' }), tx('e', 700, { deletedAt: 5 })],
      monthly: 10000, monthlyAt: 1, revision: 1,
    }
    expect(monthSummary(s, '2026-10', now)).toEqual({
      income: 5000,
      expenses: 4000,
      byCategory: [{ category: 'Eten en drinken', amount: 3000 }, { category: 'Vervoer', amount: 1000 }],
      left: 6000,
      used: 40,
      projected: Math.round((4000 / 15) * 31),
    })
    expect(monthSummary(s, '2026-09', now).projected).toBeNull()
  })

  it('warns once at 80% and at 100%', () => {
    const s: BudgetState = { transactions: [tx('a', 8500)], monthly: 10000, monthlyAt: 1, revision: 1 }
    const first = budgetWarnings(s, '2026-10', now, [])
    expect(first.map((w) => w.ref)).toEqual(['budget:2026-10@80'])
    expect(budgetWarnings(s, '2026-10', now, ['budget:2026-10@80'])).toEqual([])
    const over = { ...s, transactions: [tx('a', 12000)] }
    expect(budgetWarnings(over, '2026-10', now, ['budget:2026-10@80']).map((w) => w.title)).toEqual(['Budget op'])
    expect(budgetWarnings({ ...s, monthly: null }, '2026-10', now, [])).toEqual([])
  })

  it('merges two copies and survives bad data', () => {
    const a: BudgetState = { transactions: [tx('a', 100)], monthly: 5000, monthlyAt: 2, revision: 3 }
    const b: BudgetState = { transactions: [tx('a', 200, { updatedAt: 9 }), tx('b', 50)], monthly: 8000, monthlyAt: 1, revision: 4 }
    const m = mergeBudget(a, b)
    expect(m.transactions.map((t) => t.amount)).toEqual([200, 50])
    expect(m.monthly).toBe(5000)
    expect(m.revision).toBe(4)
    expect(parseBudgetState({ transactions: [{ id: 'x', amount: 1.5, date: '2026-10-01', updatedAt: 1 }], monthly: -3 })).toEqual({ transactions: [], monthly: null, monthlyAt: 0, revision: 0 })
  })
})
