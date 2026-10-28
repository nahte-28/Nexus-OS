/**
 * Financiën: costs shared with friends. Only what is between you and each friend is kept track of;
 * what friends owe each other is theirs to settle. Pure logic, amounts in cents.
 */
import { alive, ME, type FinanceState, type Friend, type PersonId, type SharedExpense } from './finance'

/** Each person's part of [e], split equally; the cents left over go to the first ones in [among]. */
export function sharesOf(e: Pick<SharedExpense, 'amount' | 'among'>): Map<PersonId, number> {
  const n = e.among.length
  const base = Math.floor(e.amount / n)
  const rest = e.amount - base * n
  return new Map(e.among.map((p, i) => [p, base + (i < rest ? 1 : 0)]))
}

/** Your own part of [e], or 0 when you are not in it. */
export const myShare = (e: Pick<SharedExpense, 'amount' | 'among'>) => sharesOf(e).get(ME) ?? 0

/** The transaction id of your share of [e]; fixed, so editing the expense updates the same one. */
export const sharedTransactionId = (e: Pick<SharedExpense, 'id'>) => `shared-${e.id}`

export interface FriendBalance {
  friend: Friend
  /** Positive: the friend owes you. Negative: you owe the friend. */
  balance: number
}

/** What each friend and you owe each other, from shared costs and paybacks. Deleted friends drop out. */
export function friendBalances(s: FinanceState): FriendBalance[] {
  const totals = new Map<string, number>()
  const add = (id: string, n: number) => totals.set(id, (totals.get(id) ?? 0) + n)
  for (const e of alive(s.shared)) {
    const shares = sharesOf(e)
    if (e.paidBy === ME) {
      for (const [p, share] of shares) if (p !== ME) add(p, share)
    } else if (shares.has(ME)) {
      add(e.paidBy, -shares.get(ME)!)
    }
  }
  // A friend paying you lowers what they owe; you paying them lowers what you owe.
  for (const t of alive(s.settlements)) add(t.friendId, -t.amount)
  return alive(s.friends)
    .map((friend) => ({ friend, balance: totals.get(friend.id) ?? 0 }))
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance) || a.friend.name.localeCompare(b.friend.name, 'nl'))
}

/** Together: what friends owe you and what you owe them. */
export function sharedTotals(s: FinanceState): { owedToMe: number; iOwe: number } {
  const all = friendBalances(s)
  return { owedToMe: all.reduce((n, b) => n + Math.max(0, b.balance), 0), iOwe: all.reduce((n, b) => n + Math.max(0, -b.balance), 0) }
}

/** The shared costs involving [friendId], newest first. */
export function sharedWith(s: FinanceState, friendId: string): SharedExpense[] {
  return alive(s.shared)
    .filter((e) => e.paidBy === friendId || e.among.includes(friendId))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
}
