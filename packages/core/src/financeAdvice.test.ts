import { describe, expect, it } from 'vitest'
import { emptyFinance, ME, type FinanceState } from './finance'
import { financeFacts } from './financeAdvice'

describe('facts for financial advice', () => {
  it('sends totals per category, budgets and subscriptions, but no descriptions or friends', () => {
    const now = new Date(2026, 9, 20, 12).getTime()
    const s: FinanceState = {
      ...emptyFinance(),
      transactions: [
        { id: 'a', kind: 'expense', amount: 2345, category: 'Eten en drinken', note: 'Geheim cadeau voor Lina', date: '2026-10-05', subscriptionId: null, createdAt: 1, updatedAt: 1, deletedAt: null },
        { id: 'b', kind: 'income', amount: 50000, category: 'Job', note: 'Loon', date: '2026-10-01', subscriptionId: null, createdAt: 1, updatedAt: 1, deletedAt: null },
      ],
      budgets: [{ id: 'x', category: 'Eten en drinken', limit: 10000, threshold: 80, rolloverFrom: null, updatedAt: 1, deletedAt: null }],
      subscriptions: [{ id: 's', name: 'Spotify', amount: 1199, category: 'Abonnementen', cycle: 'monthly', next: '2026-11-01', remindDays: null, createdAt: 1, updatedAt: 1, deletedAt: null }],
      friends: [{ id: 'f', name: 'Lina', createdAt: 1, updatedAt: 1, deletedAt: null }],
      shared: [{ id: 'p', note: 'Pizza', amount: 2000, date: '2026-10-06', paidBy: ME, among: [ME, 'f'], category: 'Eten en drinken', createdAt: 1, updatedAt: 1, deletedAt: null }],
    }
    const facts = financeFacts(s, now)
    expect(facts).toContain('Inkomen: €500.00. Uitgaven: €23.45.')
    expect(facts).toContain('- Eten en drinken: €23.45 van €100.00 (23%)')
    expect(facts).toContain('Spotify: €11.99 per maand')
    expect(facts).toContain('Vrienden zijn je samen €10.00 schuldig')
    expect(facts).not.toMatch(/Geheim|Lina|Pizza|Loon/)
  })
})
