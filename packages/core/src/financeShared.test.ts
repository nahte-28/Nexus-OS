import { describe, expect, it } from 'vitest'
import { emptyFinance, ME, parseFinanceState, type FinanceState, type SharedExpense } from './finance'
import { friendBalances, myShare, sharedTotals, sharesOf } from './financeShared'

const friend = (id: string, name: string) => ({ id, name, createdAt: 1, updatedAt: 1, deletedAt: null })
const cost = (id: string, amount: number, paidBy: string, among: string[]): SharedExpense => ({ id, note: id, amount, date: '2026-10-20', paidBy, among, category: 'Eten en drinken', createdAt: 1, updatedAt: 1, deletedAt: null })

describe('shared costs', () => {
  it('splits equally and gives the leftover cents to the first ones', () => {
    expect([...sharesOf({ amount: 1000, among: [ME, 'a', 'b'] }).values()]).toEqual([334, 333, 333])
    expect(myShare({ amount: 1000, among: ['a', 'b'] })).toBe(0)
  })

  it('keeps only what is between you and each friend, paybacks included', () => {
    const s: FinanceState = {
      ...emptyFinance(),
      friends: [friend('a', 'Remo'), friend('b', 'Lina')],
      shared: [
        // You paid pizza for three: each friend owes 12.
        cost('pizza', 3600, ME, [ME, 'a', 'b']),
        // Remo paid the cinema for you and Lina: you owe him 10; Lina's part is between them.
        cost('cinema', 2000, 'a', [ME, 'b']),
        // Lina paid something you were not part of: nothing for you.
        cost('taxi', 1500, 'b', ['a', 'b']),
      ],
      settlements: [{ id: 's1', friendId: 'b', amount: 500, date: '2026-10-21', updatedAt: 1, deletedAt: null }],
    }
    expect(friendBalances(s).map((b) => [b.friend.name, b.balance])).toEqual([
      ['Lina', 700],
      ['Remo', 200],
    ])
    expect(sharedTotals(s)).toEqual({ owedToMe: 900, iOwe: 0 })
    // Survives a round trip through storage, and junk is dropped.
    const copy = parseFinanceState(JSON.parse(JSON.stringify({ ...s, shared: [...s.shared, { id: 'x', amount: 'veel' }], friends: [...s.friends, { id: ME, name: 'ik', updatedAt: 1 }] })))
    expect(friendBalances(copy)).toEqual(friendBalances(s))
  })
})
