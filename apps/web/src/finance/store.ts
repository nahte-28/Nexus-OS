import {
  budgetWarnings,
  dateKey,
  DEFAULT_THRESHOLD,
  dueRecurring,
  emptyFinance,
  financeFromBudget,
  mergeFinance,
  myShare,
  monthOf,
  nextDate,
  parseFinanceState,
  recurringTransactionId,
  sharedTransactionId,
  subscriptionNotices,
  type CategoryBudget,
  type RecurringItem,
  type SharedExpense,
  type FinanceState,
  type SavingsGoal,
  type Subscription,
  type Transaction,
} from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConnectEngine } from '../connect/engine'
import { logEvent } from '../devtools/log'
import { defaultDeadlineEffects, type DeadlineEffects } from '../life/alerts'
import { createDocRemote, createProblem, DocStore, startDocSync } from '../state/docStore'
import { readStorage, writeStorage } from '../state/storage'

export const FINANCE_MIGRATION = 'supabase/migrations/20261028100000_finance.sql'
const WARNED_KEY = 'nexus.finance.warned'
const CHECKED_KEY = 'nexus.finance.checkedAt'
const CHECK_MS = 30_000
/** A subscription reminder missed while NEXUS was closed still comes when it is this recent. */
const CATCH_UP_MS = 2 * 60 * 60_000
/** The same transaction twice within this time is a double click, not two payments. */
const DOUBLE_MS = 3000

export const financeStore = new DocStore<FinanceState>('nexus.finance', parseFinanceState)
export const financeSyncProblem = createProblem()

/** Where the earlier Budget app kept its copy on this device. */
const BUDGET_KEY = 'nexus.budget'
const TAKEN_LOCAL = 'nexus.finance.fromBudget'
const TAKEN_ACCOUNT = 'nexus.finance.fromBudgetAccount'

/** Takes over what the earlier Budget app kept on this device, once. */
export function takeOverLocalBudget(store = financeStore) {
  const old = readStorage(BUDGET_KEY)
  if (!old || readStorage(TAKEN_LOCAL)) return
  try {
    store.update((s) => mergeFinance(s, financeFromBudget(JSON.parse(old))))
  } catch {
    // A broken copy has nothing to take over.
  }
  writeStorage(TAKEN_LOCAL, '1')
}

/** Takes over the Budget row of the account once per device, so data from other devices comes along too. */
async function takeOverAccountBudget(client: SupabaseClient) {
  if (readStorage(TAKEN_ACCOUNT)) return
  try {
    const old = await createDocRemote(client, 'budget', financeFromBudget).pull()
    if (old && (old.transactions.length > 0 || old.budgets.length > 0)) financeStore.update((s) => mergeFinance(s, old))
    writeStorage(TAKEN_ACCOUNT, '1')
  } catch (err) {
    logEvent('sync', `Budget overnemen in Financiën mislukt: ${err instanceof Error ? err.message : err}`)
  }
}

export function startFinanceSync(client: SupabaseClient | null): () => void {
  takeOverLocalBudget()
  if (client) {
    void client.auth.getSession().then(({ data }) => data.session && takeOverAccountBudget(client))
    client.auth.onAuthStateChange((_event, session) => {
      if (session) void takeOverAccountBudget(client)
    })
  }
  return startDocSync(client, financeStore, { key: 'finance', parse: parseFinanceState, merge: mergeFinance, migration: FINANCE_MIGRATION, problem: financeSyncProblem, label: 'Financiën' })
}

const update = (fn: (s: FinanceState) => FinanceState) => financeStore.update(fn)
const edit = <T extends { id: string; updatedAt: number }>(items: T[], id: string, fn: (t: T) => T) => items.map((t) => (t.id === id ? fn(t) : t))

export type TransactionDraft = Pick<Transaction, 'kind' | 'amount' | 'category' | 'note' | 'date'>

/** Adds a transaction; the same one again right after (a double click or double submit) is ignored. */
export function addTransaction(draft: TransactionDraft, now = Date.now(), subscriptionId: string | null = null): string | null {
  const note = draft.note.trim().slice(0, 200)
  const same = financeStore
    .getSnapshot()
    .transactions.find((t) => t.deletedAt === null && now - t.createdAt < DOUBLE_MS && t.kind === draft.kind && t.amount === draft.amount && t.category === draft.category && t.date === draft.date && t.note === note)
  if (same) return null
  const id = crypto.randomUUID()
  update((s) => ({ ...s, transactions: [...s.transactions, { ...draft, note, subscriptionId, id, createdAt: now, updatedAt: now, deletedAt: null }] }))
  return id
}

/** Adds the picked rows of a bank CSV; ids already present (an earlier import) are skipped. Returns how many were added. */
export function importTransactions(rows: Array<TransactionDraft & { id: string }>, now = Date.now()): number {
  const have = new Set(financeStore.getSnapshot().transactions.map((t) => t.id))
  const fresh = rows.filter((r) => !have.has(r.id))
  if (fresh.length === 0) return 0
  update((s) => ({
    ...s,
    transactions: [...s.transactions, ...fresh.map((r) => ({ id: r.id, kind: r.kind, amount: r.amount, category: r.category, note: r.note.trim().slice(0, 200), date: r.date, subscriptionId: null, createdAt: now, updatedAt: now, deletedAt: null }))],
  }))
  return fresh.length
}

export function updateTransaction(id: string, draft: TransactionDraft, now = Date.now()) {
  update((s) => ({ ...s, transactions: edit(s.transactions, id, (t) => ({ ...t, ...draft, note: draft.note.trim().slice(0, 200), updatedAt: now })) }))
}

export function removeTransaction(id: string, now = Date.now()) {
  update((s) => ({ ...s, transactions: edit(s.transactions, id, (t) => ({ ...t, note: '', deletedAt: now, updatedAt: now })) }))
}

/** Sets the monthly limit for [category] ('' for all expenses), replacing the one it had. */
export function setBudget(category: string, limit: number, threshold = DEFAULT_THRESHOLD, rollover = false, now = Date.now()) {
  // Leftovers carry from the month rollover was switched on; switching off forgets them.
  const from = (b?: CategoryBudget) => (rollover ? (b?.rolloverFrom ?? monthOf(now)) : null)
  update((s) => {
    const existing = s.budgets.find((b) => b.deletedAt === null && b.category === category)
    if (existing) return { ...s, budgets: edit(s.budgets, existing.id, (b) => ({ ...b, limit, threshold, rolloverFrom: from(b), updatedAt: now })) }
    const budget: CategoryBudget = { id: crypto.randomUUID(), category, limit, threshold, rolloverFrom: from(), updatedAt: now, deletedAt: null }
    return { ...s, budgets: [...s.budgets, budget] }
  })
}

export function removeBudget(id: string, now = Date.now()) {
  update((s) => ({ ...s, budgets: edit(s.budgets, id, (b) => ({ ...b, deletedAt: now, updatedAt: now })) }))
}

export function addGoal(goal: Pick<SavingsGoal, 'name' | 'target' | 'due'>, now = Date.now()): string {
  const id = crypto.randomUUID()
  update((s) => ({ ...s, goals: [...s.goals, { ...goal, name: goal.name.trim().slice(0, 80) || 'Spaardoel', id, createdAt: now, updatedAt: now, deletedAt: null }] }))
  return id
}

export function updateGoal(id: string, goal: Pick<SavingsGoal, 'name' | 'target' | 'due'>, now = Date.now()) {
  update((s) => ({ ...s, goals: edit(s.goals, id, (g) => ({ ...g, ...goal, name: goal.name.trim().slice(0, 80) || g.name, updatedAt: now })) }))
}

/** Removes a goal and what was put into it. */
export function removeGoal(id: string, now = Date.now()) {
  update((s) => ({
    ...s,
    goals: edit(s.goals, id, (g) => ({ ...g, name: '', deletedAt: now, updatedAt: now })),
    contributions: s.contributions.map((c) => (c.goalId === id && c.deletedAt === null ? { ...c, deletedAt: now, updatedAt: now } : c)),
  }))
}

/** Money put into a goal (positive) or taken out (negative). */
export function addContribution(goalId: string, amount: number, now = Date.now()) {
  update((s) => ({ ...s, contributions: [...s.contributions, { id: crypto.randomUUID(), goalId, amount, date: dateKey(now), updatedAt: now, deletedAt: null }] }))
}

export function removeContribution(id: string, now = Date.now()) {
  update((s) => ({ ...s, contributions: edit(s.contributions, id, (c) => ({ ...c, deletedAt: now, updatedAt: now })) }))
}

export type SubscriptionDraft = Pick<Subscription, 'name' | 'amount' | 'category' | 'cycle' | 'next' | 'remindDays'>

export function addSubscription(draft: SubscriptionDraft, now = Date.now()): string {
  const id = crypto.randomUUID()
  update((s) => ({ ...s, subscriptions: [...s.subscriptions, { ...draft, name: draft.name.trim().slice(0, 80) || 'Abonnement', id, createdAt: now, updatedAt: now, deletedAt: null }] }))
  return id
}

export function updateSubscription(id: string, draft: SubscriptionDraft, now = Date.now()) {
  update((s) => ({ ...s, subscriptions: edit(s.subscriptions, id, (x) => ({ ...x, ...draft, name: draft.name.trim().slice(0, 80) || x.name, updatedAt: now })) }))
}

export function removeSubscription(id: string, now = Date.now()) {
  update((s) => ({ ...s, subscriptions: edit(s.subscriptions, id, (x) => ({ ...x, name: '', deletedAt: now, updatedAt: now })) }))
}

/** You paid the coming payment: it becomes an expense on its date, and the next date moves one cycle on. */
export function markPaid(id: string, now = Date.now()) {
  const sub = financeStore.getSnapshot().subscriptions.find((x) => x.id === id && x.deletedAt === null)
  if (!sub) return
  addTransaction({ kind: 'expense', amount: sub.amount, category: sub.category, note: sub.name, date: sub.next }, now, sub.id)
  update((s) => ({ ...s, subscriptions: edit(s.subscriptions, id, (x) => ({ ...x, next: nextDate(x.next, x.cycle), updatedAt: now })) }))
}

export type RecurringDraft = Pick<RecurringItem, 'name' | 'kind' | 'amount' | 'category' | 'cycle' | 'next'>

export function addRecurring(draft: RecurringDraft, now = Date.now()): string {
  const id = crypto.randomUUID()
  update((s) => ({ ...s, recurring: [...s.recurring, { ...draft, name: draft.name.trim().slice(0, 80) || 'Vast bedrag', id, createdAt: now, updatedAt: now, deletedAt: null }] }))
  applyRecurring(now)
  return id
}

export function updateRecurring(id: string, draft: RecurringDraft, now = Date.now()) {
  update((s) => ({ ...s, recurring: edit(s.recurring, id, (r) => ({ ...r, ...draft, name: draft.name.trim().slice(0, 80) || r.name, updatedAt: now })) }))
  applyRecurring(now)
}

/** Stops a fixed amount; what it already added stays in the transactions. */
export function removeRecurring(id: string, now = Date.now()) {
  update((s) => ({ ...s, recurring: edit(s.recurring, id, (r) => ({ ...r, name: '', amount: 0, deletedAt: now, updatedAt: now })) }))
}

/**
 * Adds the transactions of fixed amounts whose date has come, and moves each on to its next date.
 * A transaction that is there already (from another device, or deleted by hand) is not added again.
 */
export function applyRecurring(now = Date.now(), store = financeStore): number {
  const due = dueRecurring(store.getSnapshot(), dateKey(now))
  if (due.length === 0) return 0
  let added = 0
  store.update((s) => {
    const have = new Set(s.transactions.map((t) => t.id))
    const fresh: Transaction[] = []
    for (const { item, dates } of due) {
      for (const day of dates) {
        const id = recurringTransactionId(item, day)
        if (have.has(id)) continue
        fresh.push({ id, kind: item.kind, amount: item.amount, category: item.category, note: item.name, date: day, subscriptionId: null, createdAt: now, updatedAt: now, deletedAt: null })
      }
    }
    added = fresh.length
    const next = new Map(due.map((d) => [d.item.id, d.next]))
    return {
      ...s,
      transactions: [...s.transactions, ...fresh],
      recurring: s.recurring.map((r) => (next.has(r.id) ? { ...r, next: next.get(r.id)!, updatedAt: now } : r)),
    }
  })
  if (added > 0) logEvent('system', `Financiën: ${added} vaste ${added === 1 ? 'bedrag' : 'bedragen'} toegevoegd`)
  return added
}

export function addFriend(name: string, now = Date.now()): string | null {
  const clean = name.trim().slice(0, 60)
  if (!clean) return null
  const existing = financeStore.getSnapshot().friends.find((f) => f.deletedAt === null && f.name.toLowerCase() === clean.toLowerCase())
  if (existing) return existing.id
  const id = crypto.randomUUID()
  update((s) => ({ ...s, friends: [...s.friends, { id, name: clean, createdAt: now, updatedAt: now, deletedAt: null }] }))
  return id
}

export function renameFriend(id: string, name: string, now = Date.now()) {
  const clean = name.trim().slice(0, 60)
  if (clean) update((s) => ({ ...s, friends: edit(s.friends, id, (f) => ({ ...f, name: clean, updatedAt: now })) }))
}

/** Removes a friend; shared costs stay, so your own share in the transactions does not change. */
export function removeFriend(id: string, now = Date.now()) {
  update((s) => ({ ...s, friends: edit(s.friends, id, (f) => ({ ...f, name: '', deletedAt: now, updatedAt: now })) }))
}

export type SharedDraft = Pick<SharedExpense, 'note' | 'amount' | 'date' | 'paidBy' | 'among' | 'category'>

/** Your share of a shared cost as one of your expenses, or deleted when you are not in it (any more). */
function withMyShare(transactions: Transaction[], e: SharedExpense, now: number): Transaction[] {
  const id = sharedTransactionId(e)
  const share = e.deletedAt === null ? myShare(e) : 0
  const mine = transactions.find((t) => t.id === id)
  if (share === 0) return mine && mine.deletedAt === null ? edit(transactions, id, (t) => ({ ...t, note: '', deletedAt: now, updatedAt: now })) : transactions
  const t: Transaction = { id, kind: 'expense', amount: share, category: e.category, note: `Gedeeld: ${e.note || 'kosten'}`.slice(0, 200), date: e.date, subscriptionId: null, createdAt: mine?.createdAt ?? now, updatedAt: now, deletedAt: null }
  return mine ? edit(transactions, id, () => t) : [...transactions, t]
}

export function addShared(draft: SharedDraft, now = Date.now()): string {
  const id = crypto.randomUUID()
  const e: SharedExpense = { ...draft, note: draft.note.trim().slice(0, 120), among: [...new Set(draft.among)], id, createdAt: now, updatedAt: now, deletedAt: null }
  update((s) => ({ ...s, shared: [...s.shared, e], transactions: withMyShare(s.transactions, e, now) }))
  return id
}

export function removeShared(id: string, now = Date.now()) {
  update((s) => {
    const shared = edit(s.shared, id, (e) => ({ ...e, note: '', amount: 0, deletedAt: now, updatedAt: now }))
    const e = shared.find((x) => x.id === id)
    return e ? { ...s, shared, transactions: withMyShare(s.transactions, e, now) } : s
  })
}

/** A payback: positive when [friendId] paid you, negative when you paid them. */
export function settle(friendId: string, amount: number, now = Date.now()) {
  if (amount === 0) return
  update((s) => ({ ...s, settlements: [...s.settlements, { id: crypto.randomUUID(), friendId, amount, date: dateKey(now), updatedAt: now, deletedAt: null }] }))
}

export function removeSettlement(id: string, now = Date.now()) {
  update((s) => ({ ...s, settlements: edit(s.settlements, id, (t) => ({ ...t, deletedAt: now, updatedAt: now })) }))
}

export function setAlerts(alerts: boolean, now = Date.now()) {
  update((s) => ({ ...s, settings: { alerts, updatedAt: now } }))
}

/**
 * Deletes all financial data on every device: each item keeps only its id and the moment it was
 * deleted, so other copies learn it is gone.
 */
export function clearFinance(now = Date.now()) {
  update((s) => {
    const gone = <T extends { deletedAt: number | null; updatedAt: number }>(t: T): T => ({ ...t, deletedAt: t.deletedAt ?? now, updatedAt: now })
    return {
      ...emptyFinance(),
      transactions: s.transactions.map((t) => ({ ...gone(t), amount: 0, note: '', category: 'Andere' })),
      budgets: s.budgets.map((b) => ({ ...gone(b), limit: 0, category: '' })),
      goals: s.goals.map((g) => ({ ...gone(g), name: '', target: 0, due: null })),
      contributions: s.contributions.map((c) => ({ ...gone(c), amount: 0 })),
      subscriptions: s.subscriptions.map((x) => ({ ...gone(x), name: '', amount: 0 })),
      recurring: s.recurring.map((r) => ({ ...gone(r), name: '', amount: 0 })),
      friends: s.friends.map((f) => ({ ...gone(f), name: '' })),
      shared: s.shared.map((e) => ({ ...gone(e), note: '', amount: 0, among: [] })),
      settlements: s.settlements.map((t) => ({ ...gone(t), amount: 0 })),
      settings: { alerts: true, updatedAt: now },
      revision: s.revision,
    }
  })
  writeStorage(WARNED_KEY, '[]')
}

function warned(): string[] {
  try {
    const list = JSON.parse(readStorage(WARNED_KEY) ?? '[]') as unknown
    return Array.isArray(list) ? list.filter((r): r is string => typeof r === 'string') : []
  } catch {
    return []
  }
}

async function send(effects: DeadlineEffects, title: string, text: string, ref: string) {
  await effects.local(title, text, ref).catch(() => {})
  try {
    await effects.phones(title, text, ref)
  } catch (err) {
    logEvent('reminders', `Financiënmelding naar gsm versturen mislukt: ${err instanceof Error ? err.message : err}`, true)
  }
}

/** Tells this device and the phone when a budget passes its threshold and 100%, once each per month. */
export async function fireBudgetWarnings(state: FinanceState, effects: DeadlineEffects, now = Date.now()): Promise<number> {
  const month = monthOf(now)
  const done = warned()
  const due = budgetWarnings(state, month, now, done)
  if (due.length === 0) return 0
  // Keep this month's refs only; older months are over.
  writeStorage(WARNED_KEY, JSON.stringify([...done.filter((r) => r.startsWith(`finance:${month}:`)), ...due.flatMap((w) => w.refs)]))
  for (const w of due) await send(effects, w.title, w.text, w.ref)
  return due.length
}

/** Sends the subscription reminders that came due since the last check. */
export async function fireSubscriptionNotices(state: FinanceState, effects: DeadlineEffects, now = Date.now()): Promise<number> {
  const checked = Number(readStorage(CHECKED_KEY))
  const from = Math.max(Number.isFinite(checked) && checked > 0 ? checked : 0, now - CATCH_UP_MS)
  writeStorage(CHECKED_KEY, String(now))
  const due = subscriptionNotices(state, from, now)
  for (const n of due) await send(effects, n.title, n.text ?? '', n.ref)
  return due.length
}

/** Fixed amounts on their date, budget notices after every change and subscription reminders on time, while NEXUS runs; one tab does it. */
export function startFinanceAlerts(connect: Pick<ConnectEngine, 'notifyPhones'>, store = financeStore): () => void {
  let stopped = false
  let timer: ReturnType<typeof setInterval> | undefined
  let release: (() => void) | undefined
  let unsubscribe: (() => void) | undefined
  const effects = defaultDeadlineEffects(connect)
  const run = () => {
    const budgets = () => void fireBudgetWarnings(store.getSnapshot(), effects)
    const tick = () => {
      applyRecurring()
      budgets()
      void fireSubscriptionNotices(store.getSnapshot(), effects)
    }
    tick()
    timer = setInterval(tick, CHECK_MS)
    unsubscribe = store.subscribe(budgets)
  }
  if (typeof navigator !== 'undefined' && navigator.locks) {
    void navigator.locks.request('nexus-finance', () => {
      if (stopped) return
      run()
      return new Promise<void>((resolve) => (release = resolve))
    })
  } else {
    run()
  }
  return () => {
    stopped = true
    clearInterval(timer)
    unsubscribe?.()
    release?.()
  }
}
