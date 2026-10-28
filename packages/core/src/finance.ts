/**
 * NEXUS Finance: income, expenses, budgets per category, savings goals and subscriptions, typed in
 * by hand. Amounts are whole euro cents so sums stay exact; nothing here moves money.
 */
import { dateKey } from './habits'
import { SAFETY_HORIZON_MS, type PlannedNotice } from './safetyNet'

/** A refund lowers the expenses of its category instead of counting as income. */
export type MoneyKind = 'expense' | 'income' | 'refund'
export type Cycle = 'weekly' | 'monthly' | 'quarterly' | 'yearly'

interface Synced {
  id: string
  updatedAt: number
  deletedAt: number | null
}

export interface Transaction extends Synced {
  kind: MoneyKind
  /** Cents, always positive; [kind] says which way. */
  amount: number
  category: string
  note: string
  /** Local date YYYY-MM-DD. */
  date: string
  /** The subscription this payment was for, when it came from "Betaald". */
  subscriptionId: string | null
  createdAt: number
}

export interface CategoryBudget extends Synced {
  /** An expense category, or '' for all expenses together. */
  category: string
  /** Cents per month. */
  limit: number
  /** Percentage of the limit that gives a first notice; the second comes at 100%. */
  threshold: number
  /** From this month (YYYY-MM) on, what is left at the end of a month moves on to the next; null when off. */
  rolloverFrom: string | null
}

export interface SavingsGoal extends Synced {
  name: string
  target: number
  /** Optional local date YYYY-MM-DD to reach it by. */
  due: string | null
  createdAt: number
}

/** Money put into (positive) or taken out of (negative) a goal. */
export interface Contribution extends Synced {
  goalId: string
  amount: number
  date: string
}

export interface Subscription extends Synced {
  name: string
  amount: number
  category: string
  cycle: Cycle
  /** The next payment date, YYYY-MM-DD; "Betaald" moves it one cycle on. */
  next: string
  /** Days before [next] to get a reminder (at 09:00), or null for none. */
  remindDays: number | null
  createdAt: number
}

export interface FinanceSettings {
  /** Budget notices on or off. */
  alerts: boolean
  updatedAt: number
}

export interface FinanceState {
  transactions: Transaction[]
  budgets: CategoryBudget[]
  goals: SavingsGoal[]
  contributions: Contribution[]
  subscriptions: Subscription[]
  settings: FinanceSettings
  revision: number
}

export const EXPENSE_CATEGORIES = ['Eten en drinken', 'Vervoer', 'School', 'Uitgaan', 'Abonnementen', 'Kleding', 'Gezondheid', 'Andere']
export const INCOME_CATEGORIES = ['Job', 'Zakgeld', 'Studiebeurs', 'Andere']
export const KIND_LABELS: Record<MoneyKind, string> = { expense: 'Uitgave', income: 'Inkomen', refund: 'Terugbetaling' }
export const CYCLE_LABELS: Record<Cycle, string> = { weekly: 'Per week', monthly: 'Per maand', quarterly: 'Per kwartaal', yearly: 'Per jaar' }
/** Label of the budget over all expenses. */
export const TOTAL_BUDGET = 'Totaalbudget'
export const DEFAULT_THRESHOLD = 80
const REMIND_HOUR = 9
const MAX_TRANSACTIONS = 5000
const MAX_ITEMS = 200
const DATE = /^\d{4}-\d{2}-\d{2}$/
const CYCLES: Cycle[] = ['weekly', 'monthly', 'quarterly', 'yearly']

export const emptyFinance = (): FinanceState => ({ transactions: [], budgets: [], goals: [], contributions: [], subscriptions: [], settings: { alerts: true, updatedAt: 0 }, revision: 0 })

const isObject = (raw: unknown): raw is Record<string, unknown> => typeof raw === 'object' && raw !== null
const cents = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 1e11 ? v : null)
const text = (v: unknown, max: number, fallback = '') => (typeof v === 'string' && v.trim() ? v.slice(0, max) : fallback)
const date = (v: unknown) => (typeof v === 'string' && DATE.test(v) ? v : null)

function synced(r: Record<string, unknown>): Synced | null {
  if (typeof r.id !== 'string' || typeof r.updatedAt !== 'number') return null
  return { id: r.id, updatedAt: r.updatedAt, deletedAt: typeof r.deletedAt === 'number' ? r.deletedAt : null }
}

export function parseTransaction(raw: unknown): Transaction | null {
  if (!isObject(raw)) return null
  const base = synced(raw)
  const day = date(raw.date)
  const amount = cents(raw.amount)
  // A deleted one keeps nothing but its id, so its amount may be gone.
  if (!base || !day || (amount === null && base.deletedAt === null)) return null
  return {
    ...base,
    kind: raw.kind === 'income' || raw.kind === 'refund' ? raw.kind : 'expense',
    amount: amount ?? 0,
    category: text(raw.category, 40, 'Andere'),
    note: text(raw.note, 200),
    date: day,
    subscriptionId: typeof raw.subscriptionId === 'string' ? raw.subscriptionId : null,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : base.updatedAt,
  }
}

function parseBudget(raw: unknown): CategoryBudget | null {
  if (!isObject(raw)) return null
  const base = synced(raw)
  const limit = cents(raw.limit)
  if (!base || (limit === null && base.deletedAt === null)) return null
  const threshold = typeof raw.threshold === 'number' && raw.threshold >= 10 && raw.threshold <= 100 ? Math.round(raw.threshold) : DEFAULT_THRESHOLD
  const rolloverFrom = typeof raw.rolloverFrom === 'string' && /^\d{4}-\d{2}$/.test(raw.rolloverFrom) ? raw.rolloverFrom : null
  return { ...base, category: typeof raw.category === 'string' ? raw.category.slice(0, 40) : '', limit: limit ?? 0, threshold, rolloverFrom }
}

function parseGoal(raw: unknown): SavingsGoal | null {
  if (!isObject(raw)) return null
  const base = synced(raw)
  const target = cents(raw.target)
  if (!base || (target === null && base.deletedAt === null)) return null
  return { ...base, name: text(raw.name, 80, 'Spaardoel'), target: target ?? 0, due: date(raw.due), createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : base.updatedAt }
}

function parseContribution(raw: unknown): Contribution | null {
  if (!isObject(raw)) return null
  const base = synced(raw)
  const day = date(raw.date)
  const amount = typeof raw.amount === 'number' && Number.isInteger(raw.amount) ? raw.amount : null
  if (!base || !day || typeof raw.goalId !== 'string' || amount === null) return null
  return { ...base, goalId: raw.goalId, amount, date: day }
}

function parseSubscription(raw: unknown): Subscription | null {
  if (!isObject(raw)) return null
  const base = synced(raw)
  const next = date(raw.next)
  const amount = cents(raw.amount)
  if (!base || !next || (amount === null && base.deletedAt === null)) return null
  return {
    ...base,
    name: text(raw.name, 80, 'Abonnement'),
    amount: amount ?? 0,
    category: text(raw.category, 40, 'Abonnementen'),
    cycle: CYCLES.includes(raw.cycle as Cycle) ? (raw.cycle as Cycle) : 'monthly',
    next,
    remindDays: typeof raw.remindDays === 'number' && Number.isInteger(raw.remindDays) && raw.remindDays >= 0 && raw.remindDays <= 14 ? raw.remindDays : null,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : base.updatedAt,
  }
}

function list<T>(raw: unknown, parse: (r: unknown) => T | null, max: number): T[] {
  return Array.isArray(raw) ? raw.map(parse).filter((t): t is T => t !== null).slice(-max) : []
}

export function parseFinanceState(raw: unknown): FinanceState {
  if (!isObject(raw)) return emptyFinance()
  const settings = isObject(raw.settings) ? raw.settings : {}
  return {
    transactions: list(raw.transactions, parseTransaction, MAX_TRANSACTIONS),
    budgets: list(raw.budgets, parseBudget, MAX_ITEMS),
    goals: list(raw.goals, parseGoal, MAX_ITEMS),
    contributions: list(raw.contributions, parseContribution, MAX_TRANSACTIONS),
    subscriptions: list(raw.subscriptions, parseSubscription, MAX_ITEMS),
    settings: { alerts: settings.alerts !== false, updatedAt: typeof settings.updatedAt === 'number' ? settings.updatedAt : 0 },
    revision: typeof raw.revision === 'number' ? raw.revision : 0,
  }
}

/** A copy of the earlier Budget app as Financiën: the same transactions, its monthly budget as the total budget. */
export function financeFromBudget(raw: unknown): FinanceState {
  const empty = emptyFinance()
  if (!isObject(raw)) return empty
  const limit = cents(raw.monthly)
  const at = typeof raw.monthlyAt === 'number' ? raw.monthlyAt : 0
  return {
    ...empty,
    transactions: list(raw.transactions, parseTransaction, MAX_TRANSACTIONS),
    // A fixed id, so taking it over on two devices gives one budget.
    budgets: limit ? [{ id: 'budget-total', category: '', limit, threshold: DEFAULT_THRESHOLD, rolloverFrom: null, updatedAt: at, deletedAt: null }] : [],
  }
}

function mergeById<T extends Synced>(a: T[], b: T[]): T[] {
  const byId = new Map(a.map((t) => [t.id, t]))
  for (const t of b) {
    const mine = byId.get(t.id)
    if (!mine || t.updatedAt > mine.updatedAt) byId.set(t.id, t)
  }
  return [...byId.values()]
}

/** Two copies item by item (the newer change wins); the newer settings win. */
export function mergeFinance(a: FinanceState, b: FinanceState): FinanceState {
  return {
    transactions: mergeById(a.transactions, b.transactions),
    budgets: mergeById(a.budgets, b.budgets),
    goals: mergeById(a.goals, b.goals),
    contributions: mergeById(a.contributions, b.contributions),
    subscriptions: mergeById(a.subscriptions, b.subscriptions),
    settings: b.settings.updatedAt > a.settings.updatedAt ? b.settings : a.settings,
    revision: Math.max(a.revision, b.revision),
  }
}

export const alive = <T extends Synced>(items: T[]) => items.filter((t) => t.deletedAt === null)

/** "12,50" or "12.5" or "€ 3" in cents; null when it is no amount. */
export function parseAmount(input: string): number | null {
  const clean = input.replace(/[€\s]/g, '')
  if (!/^\d{1,7}([.,]\d{1,2})?$/.test(clean)) return null
  const value = Math.round(Number(clean.replace(',', '.')) * 100)
  return value > 0 ? value : null
}

/** Cents as the text a person types, e.g. 1250 as "12,50". */
export const amountText = (value: number) => (value / 100).toFixed(2).replace('.', ',').replace(/,00$/, '')

/** "€ 12,50" in Belgian notation; [sign] adds + or −. */
export function formatMoney(value: number, sign = false): string {
  const out = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(Math.abs(value) / 100)
  return sign ? `${value < 0 ? '−' : '+'}${out}` : value < 0 ? `−${out}` : out
}

/** YYYY-MM of a local date or time. */
export const monthOf = (t: number | string) => (typeof t === 'string' ? t.slice(0, 7) : dateKey(t).slice(0, 7))

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  return monthOf(new Date(y, m - 1 + n, 1).getTime())
}

export const monthLabel = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('nl-BE', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
}

const localDate = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const dayLabel = (day: string) => new Intl.DateTimeFormat('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' }).format(localDate(day))

export function addDays(day: string, n: number): string {
  const d = localDate(day)
  d.setDate(d.getDate() + n)
  return dateKey(d.getTime())
}

/** One [cycle] after [day]; the 31st becomes the last day of a shorter month. */
export function nextDate(day: string, cycle: Cycle): string {
  if (cycle === 'weekly') return addDays(day, 7)
  const [y, m, d] = day.split('-').map(Number)
  const months = cycle === 'monthly' ? 1 : cycle === 'quarterly' ? 3 : 12
  const last = new Date(y, m - 1 + months + 1, 0).getDate()
  return dateKey(new Date(y, m - 1 + months, Math.min(d, last)).getTime())
}

/** What a subscription costs per month on average, in cents. */
export function monthlyCost(s: Pick<Subscription, 'amount' | 'cycle'>): number {
  const factor = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }[s.cycle]
  return Math.round(s.amount * factor)
}

/** Signed effect on spending: expenses count up, refunds count down, income is 0. */
const spent = (t: Transaction) => (t.kind === 'expense' ? t.amount : t.kind === 'refund' ? -t.amount : 0)

export interface MonthSummary {
  income: number
  /** Expenses minus refunds. */
  expenses: number
  /** Income minus expenses: what this month added to or took from your money. */
  net: number
  /** Net expenses per category, largest first; categories at 0 or less are left out. */
  byCategory: Array<{ category: string; amount: number }>
  /** Expenses at this pace by the end of the month; only for the current month. */
  projected: number | null
}

export function monthSummary(s: FinanceState, month: string, now: number): MonthSummary {
  const items = alive(s.transactions).filter((t) => monthOf(t.date) === month)
  const expenses = items.reduce((n, t) => n + spent(t), 0)
  const income = items.filter((t) => t.kind === 'income').reduce((n, t) => n + t.amount, 0)
  const categories = new Map<string, number>()
  for (const t of items) if (t.kind !== 'income') categories.set(t.category, (categories.get(t.category) ?? 0) + spent(t))
  let projected: number | null = null
  if (month === monthOf(now)) {
    const d = new Date(now)
    projected = Math.round((Math.max(0, expenses) / d.getDate()) * new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())
  }
  return {
    income,
    expenses,
    net: income - expenses,
    byCategory: [...categories]
      .filter(([, amount]) => amount > 0)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
    projected,
  }
}

export interface BudgetStatus {
  budget: CategoryBudget
  label: string
  spent: number
  /** Left over from earlier months (rollover), 0 when off. */
  carried: number
  /** The limit plus what was carried over. */
  available: number
  left: number
  /** Share of what is available that was spent, 0–100+. */
  used: number
}

/** How much of [month] the budget's category spent: expenses minus refunds. */
function spentIn(s: FinanceState, budget: CategoryBudget, month: string, now: number): number {
  const { expenses, byCategory } = monthSummary(s, month, now)
  return budget.category === '' ? expenses : (byCategory.find((c) => c.category === budget.category)?.amount ?? 0)
}

/** How many months back a rollover is followed at most. */
const MAX_ROLLOVER_MONTHS = 24

/**
 * What a budget with rollover brings into [month]: each month from [rolloverFrom] on passes on what
 * was left of its limit plus what it got itself. Overspending is not carried as debt; it ends at 0.
 */
export function carriedInto(s: FinanceState, budget: CategoryBudget, month: string, now: number): number {
  if (!budget.rolloverFrom || budget.rolloverFrom >= month) return 0
  let m = budget.rolloverFrom < shiftMonth(month, -MAX_ROLLOVER_MONTHS) ? shiftMonth(month, -MAX_ROLLOVER_MONTHS) : budget.rolloverFrom
  let carry = 0
  for (; m < month; m = shiftMonth(m, 1)) carry = Math.max(0, budget.limit + carry - spentIn(s, budget, m, now))
  return carry
}

/** Each budget against what was spent in [month]; the total budget first, then by category name. */
export function budgetStatus(s: FinanceState, month: string, now: number): BudgetStatus[] {
  return alive(s.budgets)
    .map((budget) => {
      const spent = spentIn(s, budget, month, now)
      const carried = carriedInto(s, budget, month, now)
      const available = budget.limit + carried
      return { budget, label: budget.category || TOTAL_BUDGET, spent, carried, available, left: available - spent, used: Math.round((Math.max(0, spent) / available) * 100) }
    })
    .sort((a, b) => (a.budget.category === '' ? -1 : b.budget.category === '' ? 1 : a.label.localeCompare(b.label, 'nl')))
}

export const budgetRef = (month: string, budgetId: string, percent: number) => `finance:${month}:${budgetId}@${percent}`

/** Notices for thresholds passed in [month] that [warned] does not hold yet; at most one per budget, the highest. */
export function budgetWarnings(s: FinanceState, month: string, now: number, warned: string[]): Array<{ ref: string; title: string; text: string; refs: string[] }> {
  if (!s.settings.alerts) return []
  const out: Array<{ ref: string; title: string; text: string; refs: string[] }> = []
  for (const b of budgetStatus(s, month, now)) {
    const passed = [...new Set([b.budget.threshold, 100])].filter((p) => b.used >= p && !warned.includes(budgetRef(month, b.budget.id, p)))
    if (passed.length === 0) continue
    // Passing both at once (one big expense) gives only the highest, but marks both as sent.
    const p = passed.at(-1)!
    out.push({
      ref: budgetRef(month, b.budget.id, p),
      refs: passed.map((q) => budgetRef(month, b.budget.id, q)),
      title: p >= 100 ? `${b.label}: budget op` : `${b.label}: ${p}% van je budget gebruikt`,
      text:
        b.left < 0
          ? `Je gaf deze maand ${formatMoney(b.spent)} uit, ${formatMoney(-b.left)} meer dan je budget van ${formatMoney(b.available)}.`
          : `Je gaf deze maand ${formatMoney(b.spent)} uit van ${formatMoney(b.available)}. Nog ${formatMoney(b.left)} over.`,
    })
  }
  return out
}

export interface GoalProgress {
  goal: SavingsGoal
  saved: number
  left: number
  /** 0–100, capped. */
  percent: number
  /** Cents to put aside per month to reach it by its date, when it has one and is not reached. */
  perMonth: number | null
}

export function goalProgress(s: FinanceState, goal: SavingsGoal, now: number): GoalProgress {
  const saved = alive(s.contributions)
    .filter((c) => c.goalId === goal.id)
    .reduce((n, c) => n + c.amount, 0)
  const left = Math.max(0, goal.target - saved)
  let perMonth: number | null = null
  if (goal.due && left > 0) {
    const today = new Date(now)
    const due = localDate(goal.due)
    const months = Math.max(1, (due.getFullYear() - today.getFullYear()) * 12 + due.getMonth() - today.getMonth() + (due.getDate() >= today.getDate() ? 1 : 0))
    perMonth = Math.ceil(left / months)
  }
  return { goal, saved, left, percent: Math.min(100, Math.round((Math.max(0, saved) / goal.target) * 100)), perMonth }
}

/** Payment dates of [sub] from its next date on, up to and including [until]. */
export function paymentDates(sub: Subscription, until: string, max = 60): string[] {
  const out: string[] = []
  for (let day = sub.next; day <= until && out.length < max; day = nextDate(day, sub.cycle)) out.push(day)
  return out
}

/** The coming payments of all subscriptions within [days] of today, soonest first; overdue ones included. */
export function upcomingPayments(s: FinanceState, now: number, days = 31): Array<{ sub: Subscription; date: string; overdue: boolean }> {
  const today = dateKey(now)
  const until = addDays(today, days)
  return alive(s.subscriptions)
    .flatMap((sub) => paymentDates(sub, until).map((day) => ({ sub, date: day, overdue: day < today })))
    .sort((a, b) => a.date.localeCompare(b.date) || a.sub.name.localeCompare(b.sub.name, 'nl'))
}

export const subscriptionRef = (sub: Pick<Subscription, 'id'>, day: string) => `subscription:${sub.id}@${day}`

/** Reminders for subscription payments with a reminder moment in (from, to]. */
export function subscriptionNotices(s: FinanceState, from: number, to: number): PlannedNotice[] {
  const out: PlannedNotice[] = []
  const until = addDays(dateKey(to), 15)
  for (const sub of alive(s.subscriptions)) {
    if (sub.remindDays === null) continue
    for (const day of paymentDates(sub, until)) {
      const at = localDate(addDays(day, -sub.remindDays)).setHours(REMIND_HOUR, 0, 0, 0)
      if (at <= from || at > to) continue
      const when = sub.remindDays === 0 ? 'vandaag' : sub.remindDays === 1 ? 'morgen' : `op ${dayLabel(day)}`
      out.push({ ref: subscriptionRef(sub, day), at, title: `${sub.name} wordt ${when} betaald`, text: `${formatMoney(sub.amount)}, ${CYCLE_LABELS[sub.cycle].toLowerCase()}. NEXUS betaalt niets zelf.` })
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

/** The subscription reminders the phone should know ahead (safety net and web push). */
export const plannedSubscriptionNotices = (s: FinanceState, now: number, horizon = SAFETY_HORIZON_MS) => subscriptionNotices(s, now, now + horizon)

export interface MonthTotals {
  month: string
  income: number
  expenses: number
}

/** The last [count] months up to [month], oldest first; only [category] when given. */
export function monthSeries(s: FinanceState, month: string, count: number, category: string | null = null): MonthTotals[] {
  const items = alive(s.transactions).filter((t) => category === null || t.category === category)
  return Array.from({ length: count }, (_, i) => {
    const m = shiftMonth(month, i - count + 1)
    const inMonth = items.filter((t) => monthOf(t.date) === m)
    return { month: m, income: inMonth.filter((t) => t.kind === 'income').reduce((n, t) => n + t.amount, 0), expenses: inMonth.reduce((n, t) => n + spent(t), 0) }
  })
}

export interface TransactionFilter {
  query?: string
  kind?: MoneyKind | null
  category?: string | null
  /** YYYY-MM, or null for all months. */
  month?: string | null
}

/** Live transactions that match [f], newest first. */
export function filterTransactions(s: FinanceState, f: TransactionFilter): Transaction[] {
  const words = (f.query ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  return alive(s.transactions)
    .filter((t) => (!f.kind || t.kind === f.kind) && (!f.category || t.category === f.category) && (!f.month || monthOf(t.date) === f.month))
    .filter((t) => {
      const hay = `${t.category} ${t.note} ${amountText(t.amount)}`.toLowerCase()
      return words.every((w) => hay.includes(w))
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
}

const csvCell = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/** Transactions as CSV for Excel in Belgium: semicolons, decimal comma, newest first. */
export function transactionsCsv(s: FinanceState): string {
  const rows = filterTransactions(s, {}).map((t) => [t.date, KIND_LABELS[t.kind], t.category, (t.kind === 'income' || t.kind === 'refund' ? '' : '-') + (t.amount / 100).toFixed(2).replace('.', ','), t.note])
  return [['Datum', 'Soort', 'Categorie', 'Bedrag', 'Notitie'], ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n'
}

/** Everything that is not deleted, readable, for a backup or to take elsewhere. */
export function financeExport(s: FinanceState, now: number) {
  const strip = <T extends Synced>(items: T[]) => alive(items).map(({ deletedAt: _d, updatedAt: _u, ...rest }) => rest)
  return {
    app: 'NEXUS Financiën',
    exportedAt: new Date(now).toISOString(),
    currency: 'EUR',
    note: 'Bedragen in eurocent.',
    transactions: strip(s.transactions),
    budgets: strip(s.budgets),
    goals: strip(s.goals),
    contributions: strip(s.contributions),
    subscriptions: strip(s.subscriptions),
  }
}

/** Shortcuts in Zoeken overal (Ctrl+K); the id says what Financiën opens. */
export const FINANCE_ACTIONS = [
  { id: 'new-transaction', title: 'Transactie toevoegen' },
  { id: 'budgets', title: 'Open budgetten' },
  { id: 'new-goal', title: 'Nieuw spaardoel' },
  { id: 'new-subscription', title: 'Abonnement toevoegen' },
] as const
export type FinanceActionId = (typeof FINANCE_ACTIONS)[number]['id']
