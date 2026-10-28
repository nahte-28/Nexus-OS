import { describe, expect, it } from 'vitest'
import {
  budgetStatus,
  dueRecurring,
  recurringPerMonth,
  carriedInto,
  budgetWarnings,
  emptyFinance,
  financeFromBudget,
  filterTransactions,
  goalProgress,
  mergeFinance,
  monthlyCost,
  monthSeries,
  monthSummary,
  nextDate,
  parseAmount,
  parseFinanceState,
  subscriptionNotices,
  transactionsCsv,
  upcomingPayments,
  type FinanceState,
  type Transaction,
} from './finance'
import { searchAll } from './search'

const now = new Date(2026, 9, 15, 12).getTime()
let n = 0
const tx = (over: Partial<Transaction>): Transaction => ({ id: `t${n++}`, kind: 'expense', amount: 1000, category: 'Uitgaan', note: '', date: '2026-10-14', subscriptionId: null, createdAt: 1, updatedAt: 1, deletedAt: null, ...over })
const state = (over: Partial<FinanceState>): FinanceState => ({ ...emptyFinance(), ...over })

describe('finance', () => {
  it('reads amounts in Belgian and English notation, in cents', () => {
    expect(parseAmount('12,50')).toBe(1250)
    expect(parseAmount('€ 3')).toBe(300)
    expect(parseAmount('0,1')).toBe(10)
    expect(parseAmount('1.234,5')).toBeNull()
    expect(parseAmount('0')).toBeNull()
  })

  it('sums several categories and months exactly, with refunds lowering expenses', () => {
    const s = state({
      transactions: [
        tx({ amount: 1999, category: 'Eten en drinken' }),
        tx({ amount: 1, category: 'Eten en drinken' }),
        tx({ amount: 4500, category: 'Kleding' }),
        tx({ kind: 'refund', amount: 4500, category: 'Kleding' }),
        tx({ kind: 'income', amount: 30000, category: 'Job' }),
        tx({ amount: 700, date: '2026-09-30' }),
        tx({ amount: 900, deletedAt: 5 }),
      ],
    })
    const oct = monthSummary(s, '2026-10', now)
    expect(oct.expenses).toBe(2000)
    expect(oct.income).toBe(30000)
    expect(oct.net).toBe(28000)
    expect(oct.byCategory).toEqual([{ category: 'Eten en drinken', amount: 2000 }])
    expect(oct.projected).toBe(Math.round((2000 / 15) * 31))
    expect(monthSummary(s, '2026-09', now).expenses).toBe(700)
    expect(monthSeries(s, '2026-10', 3).map((m) => m.expenses)).toEqual([0, 700, 2000])
  })

  it('warns once per threshold per budget, only the highest when both pass at once', () => {
    const budgets = [
      { id: 'all', category: '', limit: 10000, threshold: 80, rolloverFrom: null, updatedAt: 1, deletedAt: null },
      { id: 'out', category: 'Uitgaan', limit: 2000, threshold: 50, rolloverFrom: null, updatedAt: 1, deletedAt: null },
    ]
    const s = state({ budgets, transactions: [tx({ amount: 8500 })] })
    expect(budgetStatus(s, '2026-10', now).map((b) => [b.label, b.used])).toEqual([
      ['Totaalbudget', 85],
      ['Uitgaan', 425],
    ])
    const first = budgetWarnings(s, '2026-10', now, [])
    expect(first.map((w) => w.ref)).toEqual(['finance:2026-10:all@80', 'finance:2026-10:out@100'])
    expect(first[1].refs).toEqual(['finance:2026-10:out@50', 'finance:2026-10:out@100'])
    expect(budgetWarnings(s, '2026-10', now, first.flatMap((w) => w.refs))).toEqual([])
    expect(budgetWarnings({ ...s, settings: { alerts: false, updatedAt: 2 } }, '2026-10', now, [])).toEqual([])
  })

  it('carries what is left of a budget into the next months, never a debt', () => {
    const budget = { id: 'b', category: 'Uitgaan', limit: 5000, threshold: 80, rolloverFrom: '2026-08', updatedAt: 1, deletedAt: null }
    const s = state({
      budgets: [budget],
      transactions: [tx({ amount: 3000, date: '2026-08-05' }), tx({ amount: 9000, date: '2026-09-05' }), tx({ amount: 1000, date: '2026-07-05' })],
    })
    // August leaves 20, September spends 90 of 70: nothing left, and no debt into October.
    expect(carriedInto(s, budget, '2026-09', now)).toBe(2000)
    expect(carriedInto(s, budget, '2026-10', now)).toBe(0)
    expect(budgetStatus(s, '2026-09', now)[0]).toMatchObject({ carried: 2000, available: 7000, left: -2000, used: 129 })
    // Without rollover only the limit counts; before rolloverFrom nothing carries.
    expect(carriedInto(s, { ...budget, rolloverFrom: null }, '2026-09', now)).toBe(0)
    expect(carriedInto(s, budget, '2026-08', now)).toBe(0)
    const quiet = state({ budgets: [budget] })
    expect(budgetStatus(quiet, '2026-10', now)[0]).toMatchObject({ carried: 10000, available: 15000 })
  })

  it('shows goal progress and what to save per month to make the date', () => {
    const goal = { id: 'g', name: 'Laptop', target: 60000, due: '2027-01-31', createdAt: 1, updatedAt: 1, deletedAt: null }
    const s = state({ goals: [goal], contributions: [{ id: 'c1', goalId: 'g', amount: 25000, date: '2026-10-01', updatedAt: 1, deletedAt: null }, { id: 'c2', goalId: 'g', amount: -5000, date: '2026-10-02', updatedAt: 1, deletedAt: null }] })
    expect(goalProgress(s, goal, now)).toMatchObject({ saved: 20000, left: 40000, percent: 33, perMonth: 10000 })
  })

  it('moves subscription dates by cycle and reminds before each payment', () => {
    expect(nextDate('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(nextDate('2026-10-15', 'weekly')).toBe('2026-10-22')
    expect(nextDate('2026-10-15', 'yearly')).toBe('2027-10-15')
    expect(monthlyCost({ amount: 1200, cycle: 'yearly' })).toBe(100)
    const sub = { id: 's', name: 'Spotify', amount: 1199, category: 'Abonnementen', cycle: 'monthly' as const, next: '2026-10-17', remindDays: 1, createdAt: 1, updatedAt: 1, deletedAt: null }
    const s = state({ subscriptions: [sub] })
    const notices = subscriptionNotices(s, now, now + 40 * 86_400_000)
    expect(notices.map((x) => x.ref)).toEqual(['subscription:s@2026-10-17', 'subscription:s@2026-11-17'])
    expect(notices[0].at).toBe(new Date(2026, 9, 16, 9).getTime())
    expect(notices[0].title).toBe('Spotify wordt morgen betaald')
    expect(upcomingPayments(state({ subscriptions: [{ ...sub, next: '2026-10-10' }] }), now, 31).map((p) => [p.date, p.overdue])).toEqual([
      ['2026-10-10', true],
      ['2026-11-10', false],
    ])
  })

  it('finds the dates a fixed amount still has to add, at most 12 after a long break', () => {
    const item = { id: 'r1', name: 'Zakgeld', kind: 'income' as const, amount: 5000, category: 'Zakgeld', cycle: 'monthly' as const, next: '2026-09-01', createdAt: 1, updatedAt: 1, deletedAt: null }
    const s = { ...emptyFinance(), recurring: [item, { ...item, id: 'r2', kind: 'expense' as const, amount: 1000, cycle: 'weekly' as const, next: '2026-11-01' }] }
    expect(dueRecurring(s, '2026-10-28')).toEqual([{ item, dates: ['2026-09-01', '2026-10-01'], next: '2026-11-01' }])
    expect(dueRecurring({ ...s, recurring: [{ ...item, next: '2020-01-15' }] }, '2026-10-28')[0].dates).toHaveLength(12)
    expect(recurringPerMonth(s)).toEqual({ income: 5000, expenses: 4333 })
  })

  it('merges copies item by item and survives junk', () => {
    const a = state({ transactions: [tx({ id: 'x', amount: 100, updatedAt: 1 })], settings: { alerts: false, updatedAt: 5 } })
    const b = state({ transactions: [tx({ id: 'x', amount: 200, updatedAt: 2 }), tx({ id: 'y' })], settings: { alerts: true, updatedAt: 3 } })
    const m = mergeFinance(a, b)
    expect(m.transactions.map((t) => [t.id, t.amount])).toEqual([
      ['x', 200],
      ['y', 1000],
    ])
    expect(m.settings.alerts).toBe(false)
    expect(parseFinanceState({ transactions: [{ id: 1 }, tx({ id: 'ok' })], budgets: 'no' }).transactions.map((t) => t.id)).toEqual(['ok'])
  })

  it('takes over the earlier Budget app: its transactions and its monthly budget as the total budget', () => {
    const old = { transactions: [{ id: 'a', kind: 'expense', amount: 450, category: 'Uitgaan', note: 'Cola', date: '2026-10-20', createdAt: 1, updatedAt: 1, deletedAt: null }], monthly: 25000, monthlyAt: 9, revision: 3 }
    const s = financeFromBudget(old)
    expect(s.transactions[0]).toMatchObject({ id: 'a', amount: 450, subscriptionId: null })
    expect(s.budgets).toEqual([{ id: 'budget-total', category: '', limit: 25000, threshold: 80, rolloverFrom: null, updatedAt: 9, deletedAt: null }])
    // Taken over on two devices, it is still one budget.
    expect(mergeFinance(s, financeFromBudget(old)).budgets).toHaveLength(1)
    expect(financeFromBudget({ transactions: [], monthly: null }).budgets).toEqual([])
  })

  it('filters, exports CSV for Excel and is found in search', () => {
    const s = state({ transactions: [tx({ note: 'Cinema; met "Lien"' }), tx({ kind: 'income', amount: 5000, category: 'Job', date: '2026-10-01' })] })
    expect(filterTransactions(s, { query: 'cinema' })).toHaveLength(1)
    expect(filterTransactions(s, { kind: 'income' })[0].category).toBe('Job')
    expect(transactionsCsv(s).split('\r\n')).toEqual(['Datum;Soort;Categorie;Bedrag;Notitie', '2026-10-14;Uitgave;Uitgaan;-10,00;"Cinema; met ""Lien"""', '2026-10-01;Inkomen;Job;50,00;', ''])
    const found = searchAll('transactie', { apps: [], notes: [], files: [], life: [], reminders: [], actions: [{ id: 'new-transaction', title: 'Transactie toevoegen', app: 'finance' }] })
    expect(found[0]).toMatchObject({ kind: 'action', id: 'new-transaction', app: 'finance' })
  })
})
