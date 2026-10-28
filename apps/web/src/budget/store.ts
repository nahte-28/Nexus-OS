import { budgetWarnings, mergeBudget, monthOf, parseBudgetState, type BudgetState, type Transaction } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConnectEngine } from '../connect/engine'
import { logEvent } from '../devtools/log'
import { defaultDeadlineEffects, type DeadlineEffects } from '../life/alerts'
import { createProblem, DocStore, startDocSync } from '../state/docStore'
import { readStorage, writeStorage } from '../state/storage'

export const BUDGET_MIGRATION = 'supabase/migrations/20261028090000_budget.sql'
const WARNED_KEY = 'nexus.budget.warned'

export const budgetStore = new DocStore<BudgetState>('nexus.budget', parseBudgetState)
export const budgetSyncProblem = createProblem()

export function startBudgetSync(client: SupabaseClient | null): () => void {
  return startDocSync(client, budgetStore, { key: 'budget', parse: parseBudgetState, merge: mergeBudget, migration: BUDGET_MIGRATION, problem: budgetSyncProblem, label: 'Budget' })
}

export type TransactionDraft = Pick<Transaction, 'kind' | 'amount' | 'category' | 'note' | 'date'>

export function addTransaction(draft: TransactionDraft, now = Date.now()): string {
  const id = crypto.randomUUID()
  budgetStore.update((s) => ({ ...s, transactions: [...s.transactions, { ...draft, note: draft.note.trim().slice(0, 200), id, createdAt: now, updatedAt: now, deletedAt: null }] }))
  return id
}

export function removeTransaction(id: string, now = Date.now()) {
  budgetStore.update((s) => ({ ...s, transactions: s.transactions.map((t) => (t.id === id ? { ...t, note: '', deletedAt: now, updatedAt: now } : t)) }))
}

export function setMonthlyBudget(cents: number | null, now = Date.now()) {
  budgetStore.update((s) => ({ ...s, monthly: cents, monthlyAt: now }))
}

function warned(): string[] {
  try {
    const list = JSON.parse(readStorage(WARNED_KEY) ?? '[]') as unknown
    return Array.isArray(list) ? list.filter((r): r is string => typeof r === 'string') : []
  } catch {
    return []
  }
}

/** Tells this device and the phone when spending passes 80% and 100% of the month's budget, once each. */
export async function fireBudgetWarnings(state: BudgetState, effects: DeadlineEffects, now = Date.now()): Promise<number> {
  const month = monthOf(now)
  const done = warned()
  const due = budgetWarnings(state, month, now, done)
  if (due.length === 0) return 0
  // Keep this month's refs only; older months are over.
  writeStorage(WARNED_KEY, JSON.stringify([...done.filter((r) => r.startsWith(`budget:${month}@`)), ...due.map((w) => w.ref)]))
  // Passing both at once (one big expense) gives only the highest.
  const notice = due.at(-1)!
  await effects.local(notice.title, notice.text, notice.ref).catch(() => {})
  try {
    await effects.phones(notice.title, notice.text, notice.ref)
  } catch (err) {
    logEvent('reminders', `Budgetmelding naar gsm versturen mislukt: ${err instanceof Error ? err.message : err}`, true)
  }
  return 1
}

export function startBudgetAlerts(connect: Pick<ConnectEngine, 'notifyPhones'>, store = budgetStore): () => void {
  const effects = defaultDeadlineEffects(connect)
  return store.subscribe(() => void fireBudgetWarnings(store.getSnapshot(), effects))
}
