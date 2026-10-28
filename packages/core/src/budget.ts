/**
 * Budget: what you spend and earn, per month, against a monthly budget. Amounts are whole cents so
 * sums stay exact.
 */

export type MoneyKind = 'expense' | 'income'

export interface Transaction {
  id: string
  kind: MoneyKind
  /** Cents, always positive; [kind] says which way. */
  amount: number
  category: string
  note: string
  /** Local date YYYY-MM-DD. */
  date: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface BudgetState {
  transactions: Transaction[]
  /** Cents per month for expenses, or null without a budget. */
  monthly: number | null
  /** When [monthly] was last changed, so the newer setting wins when copies merge. */
  monthlyAt: number
  revision: number
}

export const EXPENSE_CATEGORIES = ['Eten en drinken', 'Vervoer', 'School', 'Uitgaan', 'Abonnementen', 'Kleding', 'Gezondheid', 'Andere']
export const INCOME_CATEGORIES = ['Job', 'Zakgeld', 'Studiebeurs', 'Andere']
/** Notices when spending passes these shares of the budget. */
export const BUDGET_THRESHOLDS = [80, 100]
const MAX_TRANSACTIONS = 5000
const DATE = /^\d{4}-\d{2}-\d{2}$/

export const emptyBudget = (): BudgetState => ({ transactions: [], monthly: null, monthlyAt: 0, revision: 0 })

export function parseTransaction(raw: unknown): Transaction | null {
  if (typeof raw !== 'object' || raw === null) return null
  const t = raw as Partial<Transaction>
  if (typeof t.id !== 'string' || typeof t.updatedAt !== 'number' || typeof t.date !== 'string' || !DATE.test(t.date)) return null
  if (typeof t.amount !== 'number' || !Number.isInteger(t.amount) || t.amount < 0) return null
  return {
    id: t.id,
    kind: t.kind === 'income' ? 'income' : 'expense',
    amount: t.amount,
    category: typeof t.category === 'string' && t.category.trim() ? t.category.slice(0, 40) : 'Andere',
    note: typeof t.note === 'string' ? t.note.slice(0, 200) : '',
    date: t.date,
    createdAt: typeof t.createdAt === 'number' ? t.createdAt : t.updatedAt,
    updatedAt: t.updatedAt,
    deletedAt: typeof t.deletedAt === 'number' ? t.deletedAt : null,
  }
}

export function parseBudgetState(raw: unknown): BudgetState {
  if (typeof raw !== 'object' || raw === null) return emptyBudget()
  const r = raw as Partial<BudgetState>
  return {
    transactions: Array.isArray(r.transactions) ? r.transactions.map(parseTransaction).filter((t): t is Transaction => t !== null).slice(-MAX_TRANSACTIONS) : [],
    monthly: typeof r.monthly === 'number' && Number.isInteger(r.monthly) && r.monthly > 0 ? r.monthly : null,
    monthlyAt: typeof r.monthlyAt === 'number' ? r.monthlyAt : 0,
    revision: typeof r.revision === 'number' ? r.revision : 0,
  }
}

/** Two copies transaction by transaction (the newer change wins); the newer budget setting wins. */
export function mergeBudget(a: BudgetState, b: BudgetState): BudgetState {
  const byId = new Map(a.transactions.map((t) => [t.id, t]))
  for (const t of b.transactions) {
    const mine = byId.get(t.id)
    if (!mine || t.updatedAt > mine.updatedAt) byId.set(t.id, t)
  }
  const setting = b.monthlyAt > a.monthlyAt ? b : a
  return { transactions: [...byId.values()], monthly: setting.monthly, monthlyAt: setting.monthlyAt, revision: Math.max(a.revision, b.revision) }
}

/** "12,50" or "12.5" or "€ 3" in cents; null when it is no amount. */
export function parseAmount(text: string): number | null {
  const clean = text.replace(/[€\s]/g, '')
  if (!/^\d{1,7}([.,]\d{1,2})?$/.test(clean)) return null
  const cents = Math.round(Number(clean.replace(',', '.')) * 100)
  return cents > 0 ? cents : null
}

/** "€ 12,50" in Belgian notation; [sign] adds + or −. */
export function formatMoney(cents: number, sign = false): string {
  const text = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(Math.abs(cents) / 100)
  return sign ? `${cents < 0 ? '−' : '+'}${text}` : cents < 0 ? `−${text}` : text
}

/** YYYY-MM of a local date or time. */
export const monthOf = (t: number | string) => {
  if (typeof t === 'string') return t.slice(0, 7)
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return monthOf(d.getTime())
}

export const monthLabel = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('nl-BE', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
}

export const activeTransactions = (s: BudgetState) => s.transactions.filter((t) => t.deletedAt === null)

export interface MonthSummary {
  income: number
  expenses: number
  /** Expenses per category, largest first. */
  byCategory: Array<{ category: string; amount: number }>
  /** Budget minus expenses; null without a budget. */
  left: number | null
  /** Share of the budget spent (0–100+), or null. */
  used: number | null
  /** Expenses at this pace by the end of the month; only for the current month. */
  projected: number | null
}

export function monthSummary(s: BudgetState, month: string, now: number): MonthSummary {
  const list = activeTransactions(s).filter((t) => monthOf(t.date) === month)
  const expenses = list.filter((t) => t.kind === 'expense')
  const total = expenses.reduce((n, t) => n + t.amount, 0)
  const categories = new Map<string, number>()
  for (const t of expenses) categories.set(t.category, (categories.get(t.category) ?? 0) + t.amount)
  let projected: number | null = null
  if (month === monthOf(now)) {
    const d = new Date(now)
    const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    projected = Math.round((total / d.getDate()) * days)
  }
  return {
    income: list.filter((t) => t.kind === 'income').reduce((n, t) => n + t.amount, 0),
    expenses: total,
    byCategory: [...categories].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
    left: s.monthly === null ? null : s.monthly - total,
    used: s.monthly === null ? null : Math.round((total / s.monthly) * 100),
    projected,
  }
}

/** The thresholds passed in [month] that [warned] does not hold yet, e.g. [80] when 85% is spent. */
export function budgetWarnings(s: BudgetState, month: string, now: number, warned: string[]): Array<{ ref: string; title: string; text: string }> {
  const { used, expenses, left } = monthSummary(s, month, now)
  if (used === null || s.monthly === null) return []
  return BUDGET_THRESHOLDS.filter((p) => used >= p && !warned.includes(`budget:${month}@${p}`)).map((p) => ({
    ref: `budget:${month}@${p}`,
    title: p >= 100 ? 'Budget op' : `${p}% van je budget gebruikt`,
    text:
      p >= 100
        ? `Je gaf deze maand ${formatMoney(expenses)} uit, ${formatMoney(-left!)} meer dan je budget van ${formatMoney(s.monthly!)}.`
        : `Je gaf deze maand ${formatMoney(expenses)} uit van ${formatMoney(s.monthly!)}. Nog ${formatMoney(left!)} over.`,
  }))
}
