import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  addDays,
  guessColumns,
  importCandidates,
  parseCsv,
  type ImportCandidate,
  type ImportColumns,
  alive,
  amountText,
  budgetStatus,
  CYCLE_LABELS,
  dateKey,
  dayLabel,
  DEFAULT_THRESHOLD,
  EXPENSE_CATEGORIES,
  filterTransactions,
  financeFacts,
  financeExport,
  formatMoney,
  friendBalances,
  ME,
  myShare,
  sharedTotals,
  goalProgress,
  INCOME_CATEGORIES,
  KIND_LABELS,
  monthLabel,
  monthlyCost,
  monthOf,
  monthSeries,
  monthSummary,
  parseAmount,
  recurringPerMonth,
  shiftMonth,
  TOTAL_BUDGET,
  transactionsCsv,
  upcomingPayments,
  type Cycle,
  type FinanceActionId,
  type MoneyKind,
  type RecurringItem,
  type SavingsGoal,
  type Subscription,
  type Transaction,
} from '@nexus/core'
import {
  addContribution,
  addGoal,
  addRecurring,
  addFriend,
  addShared,
  addSubscription,
  addTransaction,
  clearFinance,
  financeStore,
  financeSyncProblem,
  importTransactions,
  markPaid,
  removeBudget,
  removeContribution,
  removeFriend,
  removeShared,
  removeRecurring,
  removeGoal,
  removeSubscription,
  removeTransaction,
  setAlerts,
  setBudget,
  settle,
  updateGoal,
  updateRecurring,
  updateSubscription,
  updateTransaction,
  type RecurringDraft,
  type SubscriptionDraft,
  type TransactionDraft,
} from '../finance/store'
import { adviceNoteTitle, saveAdvice, streamFinanceAdvice } from '../finance/advice'
import { onReveal, takeReveal } from '../search/reveal'
import { readStorage, writeStorage } from '../state/storage'

const fieldBase = 'min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const field = `w-full ${fieldBase}`
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const smallButton = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-60'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'
const card = 'rounded-lg border border-nx-border p-3'

const TABS = ['Overzicht', 'Transacties', 'Budgetten', 'Sparen', 'Abonnementen', 'Delen', 'Inzichten', 'Instellingen'] as const
type Tab = (typeof TABS)[number]
const HIDDEN_KEY = 'nexus.finance.hidden'

/** Which tab a shortcut from Zoeken overal opens, and whether its form opens with it. */
const ACTION_TABS: Record<FinanceActionId, Tab> = { 'new-transaction': 'Transacties', budgets: 'Budgetten', 'new-goal': 'Sparen', 'new-subscription': 'Abonnementen', 'new-recurring': 'Abonnementen', 'new-shared': 'Delen' }

const useFinance = () => useSyncExternalStore(financeStore.subscribe, financeStore.getSnapshot)

/** Amounts as text, or dots when they are hidden on this device. */
const MoneyContext = createContext((value: number, sign = false) => formatMoney(value, sign))
const useMoney = () => useContext(MoneyContext)

/** NEXUS Financiën: income, expenses, budgets, savings goals and subscriptions, typed in by hand. */
export function Finance() {
  const [tab, setTab] = useState<Tab>('Overzicht')
  // Bumped by a shortcut so the form of that tab opens, also when the tab was already shown.
  const [intent, setIntent] = useState<{ action: FinanceActionId; at: number } | null>(null)
  const [hidden, setHidden] = useState(() => readStorage(HIDDEN_KEY) === '1')
  const problem = useSyncExternalStore(financeSyncProblem.subscribe, financeSyncProblem.getSnapshot)

  useEffect(() => {
    const open = () => {
      const id = takeReveal('finance') as FinanceActionId | null
      if (!id || !(id in ACTION_TABS)) return
      setTab(ACTION_TABS[id])
      setIntent({ action: id, at: Date.now() })
    }
    open()
    return onReveal(open)
  }, [])

  const toggleHidden = (value: boolean) => {
    setHidden(value)
    writeStorage(HIDDEN_KEY, value ? '1' : '0')
  }
  const money = (value: number, sign = false) => (hidden ? '€ •••' : formatMoney(value, sign))
  const opens = (action: FinanceActionId) => (intent?.action === action ? intent.at : 0)

  return (
    <MoneyContext.Provider value={money}>
      <div className="flex h-full min-h-0 flex-col text-sm">
        <div role="tablist" aria-label="Financiën" className="flex gap-1 overflow-x-auto border-b border-nx-border px-3 py-2">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`shrink-0 rounded-md px-3 py-1 ${tab === t ? 'bg-nx-surface-2 font-medium' : 'hover:bg-nx-surface-2'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div role="tabpanel" aria-label={tab} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {problem?.startsWith('setup:') && (
            <p className="rounded-lg border border-nx-border bg-nx-surface-2 p-3">
              Je financiën staan alleen op dit apparaat: de database is nog niet bijgewerkt. Voer <code className="font-mono text-xs">{problem.slice(6)}</code> uit in de SQL Editor van Supabase.
            </p>
          )}
          {tab === 'Overzicht' && <Overview onTab={setTab} />}
          {tab === 'Transacties' && <Transactions openAt={opens('new-transaction')} />}
          {tab === 'Budgetten' && <Budgets />}
          {tab === 'Sparen' && <Goals openAt={opens('new-goal')} />}
          {tab === 'Abonnementen' && <Subscriptions openAt={opens('new-subscription')} openRecurringAt={opens('new-recurring')} />}
          {tab === 'Delen' && <Shared openAt={opens('new-shared')} />}
          {tab === 'Inzichten' && <Insights />}
          {tab === 'Instellingen' && <Settings hidden={hidden} onHidden={toggleHidden} />}
        </div>
      </div>
    </MoneyContext.Provider>
  )
}

function MonthSwitcher({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const current = monthOf(Date.now())
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={smallButton} aria-label="Vorige maand" onClick={() => onChange(shiftMonth(month, -1))}>
        ‹
      </button>
      <h2 className="min-w-0 flex-1 text-center text-lg font-semibold first-letter:uppercase">{monthLabel(month)}</h2>
      <button type="button" className={smallButton} aria-label="Volgende maand" disabled={month >= current} onClick={() => onChange(shiftMonth(month, 1))}>
        ›
      </button>
    </div>
  )
}

function Tile({ label, value, note, warn = false }: { label: string; value: string; note?: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-nx-border bg-nx-surface-2 p-3">
      <p className="text-xs text-nx-muted">
        {warn && <span aria-hidden="true">⚠️ </span>}
        {label}
      </p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {note && <p className="text-xs text-nx-muted">{note}</p>}
    </div>
  )
}

function Meter({ label, percent, over = false }: { label: string; percent: number; over?: boolean }) {
  const shown = Math.max(0, Math.min(100, percent))
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={shown} className="h-2 rounded-full bg-nx-surface-2">
      <div className={`h-2 rounded-full ${over ? 'bg-red-500' : 'bg-nx-accent'}`} style={{ width: `${shown}%` }} />
    </div>
  )
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function Overview({ onTab }: { onTab: (t: Tab) => void }) {
  const state = useFinance()
  const money = useMoney()
  const now = Date.now()
  const [month, setMonth] = useState(() => monthOf(now))
  const summary = monthSummary(state, month, now)
  const budgets = budgetStatus(state, month, now)
  const payments = upcomingPayments(state, now, 14)
  const goals = alive(state.goals).map((g) => goalProgress(state, g, now))
  const top = summary.byCategory[0]?.amount ?? 0
  const empty = alive(state.transactions).length === 0 && budgets.length === 0 && goals.length === 0 && payments.length === 0

  return (
    <>
      <MonthSwitcher month={month} onChange={setMonth} />
      <section aria-label="Deze maand" className="grid grid-cols-3 gap-2">
        <Tile label="Uitgegeven" value={money(summary.expenses)} note={summary.projected !== null && summary.expenses > 0 ? `aan dit tempo ${money(summary.projected)}` : undefined} />
        <Tile label="Inkomsten" value={money(summary.income)} />
        <Tile label="Saldo van de maand" value={money(summary.net, true)} note="inkomsten min uitgaven" />
      </section>
      {empty && (
        <div className={`${card} space-y-2`}>
          <p>Hou hier bij wat je uitgeeft en verdient. Alles typ je zelf in: NEXUS koppelt geen bankrekening en betaalt niets.</p>
          <button type="button" className={primaryButton} onClick={() => onTab('Transacties')}>
            Eerste transactie toevoegen
          </button>
        </div>
      )}
      {budgets.length > 0 && (
        <Section
          title="Budgetten"
          action={
            <button type="button" className={smallButton} onClick={() => onTab('Budgetten')}>
              Beheren
            </button>
          }
        >
          <ul className="space-y-2">
            {budgets.map((b) => (
              <li key={b.budget.id} className="space-y-1">
                <div className="flex justify-between gap-2">
                  <span>{b.label}</span>
                  <span className="tabular-nums text-nx-muted">
                    {b.used}% · {b.left < 0 ? `${money(-b.left)} te veel` : `nog ${money(b.left)}`}
                  </span>
                </div>
                <Meter label={`${b.label} gebruikt`} percent={b.used} over={b.used >= 100} />
              </li>
            ))}
          </ul>
        </Section>
      )}
      {summary.byCategory.length > 0 && (
        <Section title="Uitgaven per categorie">
          <ul className="space-y-1">
            {summary.byCategory.map((c) => (
              <li key={c.category} className="grid grid-cols-[8rem_1fr_auto] items-center gap-2">
                <span className="truncate">{c.category}</span>
                <span className="h-2 rounded-full bg-nx-surface-2">
                  <span className="block h-2 rounded-full bg-nx-accent" style={{ width: `${Math.max(2, (c.amount / top) * 100)}%` }} />
                </span>
                <span className="tabular-nums text-nx-muted">{money(c.amount)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {payments.length > 0 && (
        <Section title="Komende betalingen">
          <PaymentList payments={payments} />
        </Section>
      )}
      {goals.length > 0 && (
        <Section
          title="Spaardoelen"
          action={
            <button type="button" className={smallButton} onClick={() => onTab('Sparen')}>
              Beheren
            </button>
          }
        >
          <ul className="space-y-2">
            {goals.map((g) => (
              <li key={g.goal.id} className="space-y-1">
                <div className="flex justify-between gap-2">
                  <span>{g.goal.name}</span>
                  <span className="tabular-nums text-nx-muted">
                    {money(g.saved)} van {money(g.goal.target)}
                  </span>
                </div>
                <Meter label={`${g.goal.name} gespaard`} percent={g.percent} />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  )
}

function PaymentList({ payments }: { payments: ReturnType<typeof upcomingPayments> }) {
  const money = useMoney()
  // Only the first payment of each subscription can be marked paid: that is the one its date points at.
  const firsts = new Set<string>()
  return (
    <ul className="divide-y divide-nx-border">
      {payments.map((p) => {
        const first = !firsts.has(p.sub.id)
        firsts.add(p.sub.id)
        return (
          <li key={`${p.sub.id}@${p.date}`} className="flex items-center gap-2 py-1.5">
            <span className="min-w-0 flex-1 truncate">
              {p.sub.name}
              <span className="text-nx-muted"> · {p.overdue ? `was ${dayLabel(p.date)}` : dayLabel(p.date)}</span>
            </span>
            <span className="tabular-nums">{money(p.sub.amount)}</span>
            {first && (
              <button type="button" className={smallButton} aria-label={`${p.sub.name} van ${dayLabel(p.date)} betaald`} onClick={() => markPaid(p.sub.id)}>
                Betaald
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function categoriesFor(kind: MoneyKind) {
  return kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
}

function TransactionForm({ initial, onDone }: { initial?: Transaction; onDone: () => void }) {
  const [kind, setKind] = useState<MoneyKind>(initial?.kind ?? 'expense')
  const [amount, setAmount] = useState(initial ? amountText(initial.amount) : '')
  const [category, setCategory] = useState(initial?.category ?? EXPENSE_CATEGORIES[0])
  const [note, setNote] = useState(initial?.note ?? '')
  const [date, setDate] = useState(initial?.date ?? dateKey(Date.now()))
  const cents = parseAmount(amount)
  const categories = categoriesFor(kind)
  return (
    <form
      aria-label={initial ? 'Transactie bewerken' : 'Nieuwe transactie'}
      className={`${card} space-y-2`}
      onSubmit={(e) => {
        e.preventDefault()
        if (cents === null) return
        const draft: TransactionDraft = { kind, amount: cents, category, note, date }
        if (initial) updateTransaction(initial.id, draft)
        else addTransaction(draft)
        onDone()
      }}
    >
      <div role="group" aria-label="Soort" className="flex flex-wrap gap-1">
        {(['expense', 'income', 'refund'] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => {
              setKind(k)
              if (!categoriesFor(k).includes(category)) setCategory(categoriesFor(k)[0])
            }}
            className={`rounded-full border border-nx-border px-3 py-1 ${kind === k ? 'bg-nx-accent font-medium text-nx-accent-text' : 'hover:bg-nx-surface-2'}`}
          >
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Bedrag, bv. 4,50" aria-label="Bedrag" className={field} />
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categorie" className={field}>
          {(categories.includes(category) ? categories : [category, ...categories]).map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Datum" className={field} />
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Omschrijving (optioneel)" aria-label="Omschrijving" className={field} />
      </div>
      {kind === 'refund' && <p className="text-xs text-nx-muted">Een terugbetaling verlaagt de uitgaven van haar categorie in plaats van als inkomen te tellen.</p>}
      {amount.trim() !== '' && cents === null && <p className="text-xs text-red-500">Typ een bedrag zoals 4,50.</p>}
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={cents === null}>
          {initial ? 'Bewaren' : 'Toevoegen'}
        </button>
        <button type="button" className={button} onClick={onDone}>
          Annuleren
        </button>
      </div>
    </form>
  )
}

function download(name: string, type: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const exportCsv = () => download(`nexus-transacties-${dateKey(Date.now())}.csv`, 'text/csv;charset=utf-8', `﻿${transactionsCsv(financeStore.getSnapshot())}`)
const exportJson = () => download(`nexus-financien-${dateKey(Date.now())}.json`, 'application/json', JSON.stringify(financeExport(financeStore.getSnapshot(), Date.now()), null, 2))

function Transactions({ openAt }: { openAt: number }) {
  const state = useFinance()
  const money = useMoney()
  const [adding, setAdding] = useState(openAt > 0)
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<MoneyKind | ''>('')
  const [category, setCategory] = useState('')
  const [month, setMonth] = useState<string>(() => monthOf(Date.now()))
  useEffect(() => {
    if (openAt) setAdding(true)
  }, [openAt])

  const list = filterTransactions(state, { query, kind: kind || null, category: category || null, month: month || null })
  const months = [...new Set([monthOf(Date.now()), ...alive(state.transactions).map((t) => monthOf(t.date))])].sort().reverse()
  const categories = [...new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES, ...alive(state.transactions).map((t) => t.category)])]
  const days = [...new Set(list.map((t) => t.date))]
  const total = list.reduce((n, t) => n + (t.kind === 'income' ? t.amount : -t.amount * (t.kind === 'refund' ? -1 : 1)), 0)

  return (
    <>
      {imported && <p role="status">{imported}</p>}
      {adding ? (
        <TransactionForm key={openAt} onDone={() => setAdding(false)} />
      ) : importing ? (
        <ImportPanel
          onDone={(message) => {
            setImporting(false)
            setImported(message)
            if (message) setMonth('')
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primaryButton} onClick={() => setAdding(true)}>
            + Transactie
          </button>
          <button
            type="button"
            className={button}
            onClick={() => {
              setImported(null)
              setImporting(true)
            }}
          >
            Importeren uit CSV
          </button>
          <button type="button" className={button} onClick={exportCsv} disabled={alive(state.transactions).length === 0}>
            Exporteren als CSV
          </button>
        </div>
      )}
      <div role="search" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoeken…" aria-label="Zoek in transacties" className={field} />
        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Maand" className={field}>
          <option value="">Alle maanden</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value as MoneyKind | '')} aria-label="Soort" className={field}>
          <option value="">Alle soorten</option>
          {(['expense', 'income', 'refund'] as const).map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categorie" className={field}>
          <option value="">Alle categorieën</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <section aria-label="Transacties" className="space-y-2">
        {list.length === 0 ? (
          <p className="text-nx-muted">{alive(state.transactions).length === 0 ? 'Nog geen transacties.' : 'Niets gevonden met deze filters.'}</p>
        ) : (
          <p className="text-xs text-nx-muted tabular-nums">
            {list.length} {list.length === 1 ? 'transactie' : 'transacties'}, samen {money(total, true)}
          </p>
        )}
        {days.map((day) => (
          <div key={day}>
            <h4 className="text-xs font-semibold text-nx-muted first-letter:uppercase">{dayLabel(day)}</h4>
            <ul className="divide-y divide-nx-border">
              {list
                .filter((t) => t.date === day)
                .map((t) =>
                  editing === t.id ? (
                    <li key={t.id} className="py-1.5">
                      <TransactionForm initial={t} onDone={() => setEditing(null)} />
                    </li>
                  ) : (
                    <li key={t.id} className="flex items-center gap-2 py-1.5">
                      <span className="min-w-0 flex-1 truncate">
                        {t.category}
                        {t.kind === 'refund' && <span className="text-nx-muted"> · terugbetaling</span>}
                        {t.note && <span className="text-nx-muted"> · {t.note}</span>}
                      </span>
                      <span className={`tabular-nums ${t.kind === 'expense' ? '' : 'font-medium'}`}>{money(t.kind === 'expense' ? -t.amount : t.amount, true)}</span>
                      <button type="button" className={smallButton} aria-label={`${t.category} ${formatMoney(t.amount)} bewerken`} onClick={() => setEditing(t.id)}>
                        ✎
                      </button>
                      <button type="button" className={smallButton} aria-label={`${t.category} ${formatMoney(t.amount)} verwijderen`} onClick={() => removeTransaction(t.id)}>
                        ✕
                      </button>
                    </li>
                  ),
                )}
            </ul>
          </div>
        ))}
      </section>
    </>
  )
}

function Budgets() {
  const state = useFinance()
  const money = useMoney()
  const now = Date.now()
  const status = budgetStatus(state, monthOf(now), now)
  const taken = new Set(status.map((b) => b.budget.category))
  const free = ['', ...EXPENSE_CATEGORIES].filter((c) => !taken.has(c))
  const [editing, setEditing] = useState<string | null>(null)

  return (
    <>
      <p className="text-nx-muted">
        Een budget is een grens per maand, voor al je uitgaven samen of voor één categorie. Bij de drempel die je kiest en bij 100% krijg je één melding per maand, ook op je gsm{state.settings.alerts ? '' : ' (nu uitgezet in Instellingen)'}.
      </p>
      {status.length === 0 && <p>Nog geen budgetten.</p>}
      <ul className="space-y-3">
        {status.map((b) =>
          editing === b.budget.id ? (
            <li key={b.budget.id}>
              <BudgetForm categories={[b.budget.category]} initial={b.budget} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={b.budget.id} className={`${card} space-y-1`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{b.label}</span>
                <span className="tabular-nums text-nx-muted">
                  {money(b.spent)} van {money(b.available)}
                </span>
              </div>
              <Meter label={`${b.label} gebruikt`} percent={b.used} over={b.used >= 100} />
              <div className="flex items-center justify-between gap-2 text-xs text-nx-muted">
                <span>
                  {b.used}% gebruikt · melding bij {b.budget.threshold}% en 100%
                  {b.budget.rolloverFrom && (b.carried > 0 ? ` · ${money(b.carried)} overgedragen van vorige maand` : ' · overschot schuift door')}
                </span>
                <span className="flex gap-1">
                  <button type="button" className={smallButton} onClick={() => setEditing(b.budget.id)}>
                    Wijzigen
                  </button>
                  <button type="button" className={smallButton} aria-label={`Budget ${b.label} verwijderen`} onClick={() => removeBudget(b.budget.id)}>
                    ✕
                  </button>
                </span>
              </div>
            </li>
          ),
        )}
      </ul>
      {free.length > 0 && <BudgetForm key={free.join()} categories={free} onDone={() => {}} />}
    </>
  )
}

function BudgetForm({ categories, initial, onDone }: { categories: string[]; initial?: { category: string; limit: number; threshold: number; rolloverFrom: string | null }; onDone: () => void }) {
  const [rollover, setRollover] = useState(!!initial?.rolloverFrom)
  const [category, setCategory] = useState(initial?.category ?? categories[0])
  const [limit, setLimit] = useState(initial ? amountText(initial.limit) : '')
  const [threshold, setThreshold] = useState(String(initial?.threshold ?? DEFAULT_THRESHOLD))
  const cents = parseAmount(limit)
  const percent = Number(threshold)
  const valid = cents !== null && Number.isInteger(percent) && percent >= 10 && percent <= 100
  return (
    <form
      aria-label={initial ? 'Budget wijzigen' : 'Nieuw budget'}
      className={`${card} space-y-2`}
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        setBudget(category, cents, percent, rollover)
        setLimit('')
        onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="text-xs text-nx-muted">Voor</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={!!initial} className={field}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c || `${TOTAL_BUDGET} (alle uitgaven)`}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-nx-muted">Per maand (€)</span>
          <input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="bv. 250" className={field} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-nx-muted">Eerste melding bij (%)</span>
          <input type="number" min={10} max={100} step={5} value={threshold} onChange={(e) => setThreshold(e.target.value)} className={field} />
        </label>
      </div>
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={rollover} onChange={(e) => setRollover(e.target.checked)} className="mt-0.5" />
        <span>
          Wat overblijft, schuift door naar de volgende maand
          <span className="block text-xs text-nx-muted">Geef je meer uit dan je budget, dan begint de volgende maand gewoon bij je budget, zonder schuld.</span>
        </span>
      </label>
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={!valid}>
          {initial ? 'Bewaren' : 'Budget instellen'}
        </button>
        {initial && (
          <button type="button" className={button} onClick={onDone}>
            Annuleren
          </button>
        )}
      </div>
    </form>
  )
}

function GoalForm({ initial, onDone }: { initial?: SavingsGoal; onDone: () => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [target, setTarget] = useState(initial ? amountText(initial.target) : '')
  const [due, setDue] = useState(initial?.due ?? '')
  const cents = parseAmount(target)
  return (
    <form
      aria-label={initial ? 'Spaardoel wijzigen' : 'Nieuw spaardoel'}
      className={`${card} space-y-2`}
      onSubmit={(e) => {
        e.preventDefault()
        if (cents === null || !name.trim()) return
        const goal = { name, target: cents, due: due || null }
        if (initial) updateGoal(initial.id, goal)
        else addGoal(goal)
        onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Naam, bv. Laptop" aria-label="Naam" className={field} />
        <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Doelbedrag, bv. 600" aria-label="Doelbedrag" className={field} />
        <label className="flex items-center gap-2">
          <span className="shrink-0 text-xs text-nx-muted">Tegen</span>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Einddatum (optioneel)" className={field} />
        </label>
      </div>
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={cents === null || !name.trim()}>
          {initial ? 'Bewaren' : 'Spaardoel maken'}
        </button>
        <button type="button" className={button} onClick={onDone}>
          Annuleren
        </button>
      </div>
    </form>
  )
}

function Goals({ openAt }: { openAt: number }) {
  const state = useFinance()
  const [adding, setAdding] = useState(openAt > 0)
  const [editing, setEditing] = useState<string | null>(null)
  useEffect(() => {
    if (openAt) setAdding(true)
  }, [openAt])
  const now = Date.now()
  const goals = alive(state.goals)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((g) => goalProgress(state, g, now))

  return (
    <>
      {adding ? (
        <GoalForm key={openAt} onDone={() => setAdding(false)} />
      ) : (
        <button type="button" className={primaryButton} onClick={() => setAdding(true)}>
          + Spaardoel
        </button>
      )}
      {goals.length === 0 && !adding && <p className="text-nx-muted">Nog geen spaardoelen. Een doel met een datum toont hoeveel je per maand opzij moet zetten.</p>}
      <ul className="space-y-3">
        {goals.map((g) => (editing === g.goal.id ? (
            <li key={g.goal.id}>
              <GoalForm initial={g.goal} onDone={() => setEditing(null)} />
            </li>
          ) : <GoalCard key={g.goal.id} progress={g} onEdit={() => setEditing(g.goal.id)} />))}
      </ul>
    </>
  )
}

function GoalCard({ progress, onEdit }: { progress: ReturnType<typeof goalProgress>; onEdit: () => void }) {
  const state = useFinance()
  const money = useMoney()
  const [amount, setAmount] = useState('')
  const cents = parseAmount(amount)
  const { goal, saved, left, percent, perMonth } = progress
  const history = alive(state.contributions)
    .filter((c) => c.goalId === goal.id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt)
  const put = (sign: 1 | -1) => {
    if (cents === null) return
    addContribution(goal.id, sign * cents)
    setAmount('')
  }
  return (
    <li className={`${card} space-y-2`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{goal.name}</span>
        <span className="tabular-nums text-nx-muted">
          {money(saved)} van {money(goal.target)}
        </span>
      </div>
      <Meter label={`${goal.name} gespaard`} percent={percent} />
      <p className="text-xs text-nx-muted">
        {left === 0
          ? 'Doelbedrag bereikt.'
          : `Nog ${money(left)}${goal.due ? ` tot ${dayLabel(goal.due)}` : ''}${perMonth !== null ? `: dat is ongeveer ${money(perMonth)} per maand.` : '.'}`}
      </p>
      <form
        className="flex flex-wrap gap-2"
        aria-label={`Bijdrage aan ${goal.name}`}
        onSubmit={(e) => {
          e.preventDefault()
          put(1)
        }}
      >
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Bedrag" aria-label="Bedrag" className={`${fieldBase} w-28`} />
        <button type="submit" className={button} disabled={cents === null}>
          Opzijzetten
        </button>
        <button type="button" className={button} disabled={cents === null} onClick={() => put(-1)}>
          Opnemen
        </button>
        <span className="flex-1" />
        <button type="button" className={smallButton} onClick={onEdit}>
          Wijzigen
        </button>
        <button type="button" className={smallButton} aria-label={`Spaardoel ${goal.name} verwijderen`} onClick={() => removeGoal(goal.id)}>
          ✕
        </button>
      </form>
      {history.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-nx-muted">Bijdragen ({history.length})</summary>
          <ul className="mt-1 divide-y divide-nx-border">
            {history.map((c) => (
              <li key={c.id} className="flex items-center gap-2 py-1 text-xs">
                <span className="flex-1">{dayLabel(c.date)}</span>
                <span className="tabular-nums">{money(c.amount, true)}</span>
                <button type="button" className={smallButton} aria-label={`Bijdrage van ${dayLabel(c.date)} verwijderen`} onClick={() => removeContribution(c.id)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  )
}

const REMIND_CHOICES: Array<{ value: string; label: string }> = [
  { value: '', label: 'Geen herinnering' },
  { value: '0', label: 'Op de dag zelf' },
  { value: '1', label: '1 dag ervoor' },
  { value: '2', label: '2 dagen ervoor' },
  { value: '3', label: '3 dagen ervoor' },
  { value: '7', label: '1 week ervoor' },
]

function SubscriptionForm({ initial, onDone }: { initial?: Subscription; onDone: () => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [amount, setAmount] = useState(initial ? amountText(initial.amount) : '')
  const [cycle, setCycle] = useState<Cycle>(initial?.cycle ?? 'monthly')
  const [next, setNext] = useState(initial?.next ?? dateKey(Date.now()))
  const [category, setCategory] = useState(initial?.category ?? 'Abonnementen')
  const [remind, setRemind] = useState(initial ? (initial.remindDays === null ? '' : String(initial.remindDays)) : '1')
  const cents = parseAmount(amount)
  const valid = cents !== null && name.trim() !== ''
  return (
    <form
      aria-label={initial ? 'Abonnement wijzigen' : 'Nieuw abonnement'}
      className={`${card} space-y-2`}
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        const draft: SubscriptionDraft = { name, amount: cents, cycle, next, category, remindDays: remind === '' ? null : Number(remind) }
        if (initial) updateSubscription(initial.id, draft)
        else addSubscription(draft)
        onDone()
      }}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Naam, bv. Spotify" aria-label="Naam" className={field} />
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Bedrag, bv. 11,99" aria-label="Bedrag" className={field} />
        <select value={cycle} onChange={(e) => setCycle(e.target.value as Cycle)} aria-label="Frequentie" className={field}>
          {(Object.keys(CYCLE_LABELS) as Cycle[]).map((c) => (
            <option key={c} value={c}>
              {CYCLE_LABELS[c]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2">
          <span className="shrink-0 text-xs text-nx-muted">Volgende</span>
          <input type="date" value={next} onChange={(e) => e.target.value && setNext(e.target.value)} aria-label="Volgende betaaldatum" className={field} />
        </label>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categorie" className={field}>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select value={remind} onChange={(e) => setRemind(e.target.value)} aria-label="Herinnering" className={field}>
          {REMIND_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-nx-muted">De herinnering komt om 09:00, hier en op je gsm. NEXUS betaalt of zegt niets op: dat doe je zelf.</p>
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={!valid}>
          {initial ? 'Bewaren' : 'Abonnement toevoegen'}
        </button>
        <button type="button" className={button} onClick={onDone}>
          Annuleren
        </button>
      </div>
    </form>
  )
}

function Subscriptions({ openAt, openRecurringAt }: { openAt: number; openRecurringAt: number }) {
  const state = useFinance()
  const money = useMoney()
  const [adding, setAdding] = useState(openAt > 0)
  const [editing, setEditing] = useState<string | null>(null)
  useEffect(() => {
    if (openAt) setAdding(true)
  }, [openAt])
  const subs = alive(state.subscriptions).sort((a, b) => a.next.localeCompare(b.next))
  const perMonth = subs.reduce((n, s) => n + monthlyCost(s), 0)
  const today = dateKey(Date.now())

  return (
    <>
      {subs.length > 0 && (
        <section aria-label="Samen" className="grid grid-cols-2 gap-2">
          <Tile label="Per maand" value={money(perMonth)} note="gemiddeld, alle abonnementen" />
          <Tile label="Per jaar" value={money(perMonth * 12)} />
        </section>
      )}
      {adding ? (
        <SubscriptionForm key={openAt} onDone={() => setAdding(false)} />
      ) : (
        <button type="button" className={primaryButton} onClick={() => setAdding(true)}>
          + Abonnement
        </button>
      )}
      {subs.length === 0 && !adding && <p className="text-nx-muted">Nog geen abonnementen of vaste kosten.</p>}
      <ul className="space-y-2">
        {subs.map((s) =>
          editing === s.id ? (
            <li key={s.id}>
              <SubscriptionForm initial={s} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={s.id} className={`${card} flex flex-wrap items-center gap-2`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{s.name}</span>
                <span className="block text-xs text-nx-muted">
                  {money(s.amount)} {CYCLE_LABELS[s.cycle].toLowerCase()} · {s.next < today ? <span className="text-red-500">verlopen sinds {dayLabel(s.next)}</span> : `volgende ${dayLabel(s.next)}`}
                  {s.remindDays !== null && ' · 🔔'}
                </span>
              </span>
              <button type="button" className={smallButton} aria-label={`${s.name} betaald`} onClick={() => markPaid(s.id)} disabled={s.next > addDays(today, 31)}>
                Betaald
              </button>
              <button type="button" className={smallButton} onClick={() => setEditing(s.id)}>
                Wijzigen
              </button>
              <button type="button" className={smallButton} aria-label={`Abonnement ${s.name} verwijderen`} onClick={() => removeSubscription(s.id)}>
                ✕
              </button>
            </li>
          ),
        )}
      </ul>
      {subs.length > 0 && <p className="text-xs text-nx-muted">"Betaald" zet de betaling bij je transacties en schuift de datum één periode op.</p>}
      <RecurringList openAt={openRecurringAt} />
    </>
  )
}

function RecurringForm({ initial, onDone }: { initial?: RecurringItem; onDone: () => void }) {
  const [kind, setKind] = useState<RecurringItem['kind']>(initial?.kind ?? 'income')
  const [name, setName] = useState(initial?.name ?? '')
  const [amount, setAmount] = useState(initial ? amountText(initial.amount) : '')
  const [cycle, setCycle] = useState<Cycle>(initial?.cycle ?? 'monthly')
  const [next, setNext] = useState(initial?.next ?? dateKey(Date.now()))
  const [category, setCategory] = useState(initial?.category ?? (kind === 'income' ? 'Zakgeld' : 'Andere'))
  const cents = parseAmount(amount)
  const valid = cents !== null && name.trim() !== ''
  const categories = categoriesFor(kind)
  return (
    <form
      aria-label={initial ? 'Vast bedrag wijzigen' : 'Nieuw vast bedrag'}
      className={`${card} space-y-2`}
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        const draft: RecurringDraft = { kind, name, amount: cents, cycle, next, category: categories.includes(category) ? category : 'Andere' }
        if (initial) updateRecurring(initial.id, draft)
        else addRecurring(draft)
        onDone()
      }}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <select
          value={kind}
          onChange={(e) => {
            const k = e.target.value as RecurringItem['kind']
            setKind(k)
            setCategory(k === 'income' ? 'Zakgeld' : 'Andere')
          }}
          aria-label="Soort"
          className={field}
        >
          <option value="income">Inkomen</option>
          <option value="expense">Uitgave</option>
        </select>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Naam, bv. Zakgeld" aria-label="Naam" className={field} />
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Bedrag, bv. 50" aria-label="Bedrag" className={field} />
        <select value={cycle} onChange={(e) => setCycle(e.target.value as Cycle)} aria-label="Frequentie" className={field}>
          {(Object.keys(CYCLE_LABELS) as Cycle[]).map((c) => (
            <option key={c} value={c}>
              {CYCLE_LABELS[c]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2">
          <span className="shrink-0 text-xs text-nx-muted">Volgende</span>
          <input type="date" value={next} onChange={(e) => e.target.value && setNext(e.target.value)} aria-label="Volgende datum" className={field} />
        </label>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categorie" className={field}>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <p className="text-xs text-nx-muted">Op elke datum zet NEXUS het bedrag vanzelf bij je transacties. Ligt de datum in het verleden, dan komen ook de gemiste keren erbij (hoogstens 12).</p>
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={!valid}>
          {initial ? 'Bewaren' : 'Vast bedrag toevoegen'}
        </button>
        <button type="button" className={button} onClick={onDone}>
          Annuleren
        </button>
      </div>
    </form>
  )
}

function RecurringList({ openAt }: { openAt: number }) {
  const state = useFinance()
  const money = useMoney()
  const [adding, setAdding] = useState(openAt > 0)
  const [editing, setEditing] = useState<string | null>(null)
  useEffect(() => {
    if (openAt) setAdding(true)
  }, [openAt])
  const items = alive(state.recurring).sort((a, b) => a.next.localeCompare(b.next))
  const perMonth = recurringPerMonth(state)

  return (
    <Section
      title="Vaste bedragen"
      action={
        !adding && (
          <button type="button" className={smallButton} onClick={() => setAdding(true)}>
            + Vast bedrag
          </button>
        )
      }
    >
      <p className="text-xs text-nx-muted">Loon, zakgeld, huur of kotgeld: wat elke keer hetzelfde is, komt vanzelf in je transacties.</p>
      {items.length > 0 && (
        <p className="text-xs">
          Per maand gemiddeld <span className="font-medium">{money(perMonth.income)}</span> erbij en <span className="font-medium">{money(perMonth.expenses)}</span> eraf.
        </p>
      )}
      {adding && <RecurringForm key={openAt} onDone={() => setAdding(false)} />}
      {items.length === 0 && !adding && <p className="text-nx-muted">Nog geen vaste bedragen.</p>}
      <ul className="space-y-2">
        {items.map((r) =>
          editing === r.id ? (
            <li key={r.id}>
              <RecurringForm initial={r} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={r.id} className={`${card} flex flex-wrap items-center gap-2`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.name}</span>
                <span className="block text-xs text-nx-muted">
                  {r.kind === 'income' ? '+' : '−'}
                  {money(r.amount)} {CYCLE_LABELS[r.cycle].toLowerCase()} · {r.category} · volgende {dayLabel(r.next)}
                </span>
              </span>
              <button type="button" className={smallButton} onClick={() => setEditing(r.id)}>
                Wijzigen
              </button>
              <button type="button" className={smallButton} aria-label={`Vast bedrag ${r.name} stoppen`} onClick={() => removeRecurring(r.id)}>
                ✕
              </button>
            </li>
          ),
        )}
      </ul>
    </Section>
  )
}

function Insights() {
  const state = useFinance()
  const money = useMoney()
  const now = Date.now()
  const [count, setCount] = useState(6)
  const [category, setCategory] = useState('')
  const month = monthOf(now)
  const series = monthSeries(state, month, count, category || null)
  const top = Math.max(1, ...series.flatMap((m) => [m.income, m.expenses]))
  const average = Math.round(series.reduce((n, m) => n + m.expenses, 0) / series.length)
  const thisMonth = monthSummary(state, month, now).byCategory
  const lastMonth = monthSummary(state, shiftMonth(month, -1), now).byCategory
  const rows = [...new Set([...thisMonth, ...lastMonth].map((c) => c.category))].map((c) => ({
    category: c,
    now: thisMonth.find((x) => x.category === c)?.amount ?? 0,
    before: lastMonth.find((x) => x.category === c)?.amount ?? 0,
  }))
  const categories = [...new Set(alive(state.transactions).map((t) => t.category))].sort((a, b) => a.localeCompare(b, 'nl'))
  const short = (m: string) => new Intl.DateTimeFormat('nl-BE', { month: 'short' }).format(new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1))

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <select value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="Periode" className={fieldBase}>
          <option value={6}>Laatste 6 maanden</option>
          <option value={12}>Laatste 12 maanden</option>
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categorie" className={fieldBase}>
          <option value="">Alle categorieën</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <figure className="space-y-1">
        <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-medium">Inkomsten en uitgaven per maand</span>
          <span className="flex gap-3 text-xs text-nx-muted">
            <span className="flex items-center gap-1">
              <span aria-hidden="true" className="size-2.5 rounded-sm bg-nx-accent" /> Uitgaven
            </span>
            <span className="flex items-center gap-1">
              <span aria-hidden="true" className="size-2.5 rounded-sm bg-nx-muted/50" /> Inkomsten
            </span>
          </span>
        </figcaption>
        <div role="img" aria-label={series.map((m) => `${monthLabel(m.month)}: uitgaven ${money(m.expenses)}, inkomsten ${money(m.income)}`).join('; ')} className="flex h-32 items-end gap-1 border-b border-nx-border">
          {series.map((m) => (
            <div key={m.month} title={`${monthLabel(m.month)}: uitgaven ${money(m.expenses)}, inkomsten ${money(m.income)}`} className="flex h-full flex-1 items-end justify-center gap-0.5">
              <div className="w-full max-w-4 rounded-t bg-nx-accent" style={{ height: `${(Math.max(0, m.expenses) / top) * 100}%` }} />
              <div className="w-full max-w-4 rounded-t bg-nx-muted/50" style={{ height: `${(m.income / top) * 100}%` }} />
            </div>
          ))}
        </div>
        <div aria-hidden="true" className="flex text-xs text-nx-muted">
          {series.map((m) => (
            <span key={m.month} className="flex-1 text-center">
              {short(m.month)}
            </span>
          ))}
        </div>
      </figure>
      <p className="text-nx-muted">
        Gemiddeld gaf je de laatste {count} maanden {money(average)} per maand uit{category ? ` aan ${category}` : ''}. Uitgaven tellen min terugbetalingen; wat je opzijzet voor een spaardoel telt niet mee.
      </p>
      {rows.length > 0 && !category && (
        <Section title="Deze maand tegenover vorige maand">
          <table className="w-full text-left tabular-nums">
            <thead className="text-nx-muted">
              <tr>
                <th className="py-1 font-normal">Categorie</th>
                <th className="py-1 font-normal">Vorige maand</th>
                <th className="py-1 font-normal">Deze maand</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.category} className="border-t border-nx-border">
                  <td className="py-1">{r.category}</td>
                  <td className="py-1">{money(r.before)}</td>
                  <td className="py-1">{money(r.now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-nx-muted">Deze maand is nog niet voorbij, dus de bedragen kunnen nog stijgen.</p>
        </Section>
      )}
      <Advice />
    </>
  )
}

/** NEXUS AI looks at a month and gives tips; saved in Notities. Only totals go out. */
function Advice() {
  const now = Date.now()
  const [month, setMonth] = useState(monthOf(now))
  const [wish, setWish] = useState('')
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const facts = financeFacts(financeStore.getSnapshot(), now, month)
  // With amounts hidden on this device, the preview stays closed too.
  const hidden = useMoney()(1).includes('•')

  const start = () => {
    setError(null)
    setText('')
    setState('busy')
    streamFinanceAdvice(month, wish, setText)
      .then((markdown) => {
        saveAdvice(month, markdown)
        setState('done')
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setState('idle')
      })
  }

  return (
    <Section title="Advies van NEXUS AI">
      <p className="text-nx-muted">
        NEXUS AI bekijkt je maand en geeft tips om te besparen of beter te plannen. Het advies komt ook in Notities. De AI krijgt alleen de totalen hieronder: geen omschrijvingen van transacties en geen namen van vrienden.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={month}
          onChange={(e) => {
            setMonth(e.target.value)
            setState('idle')
            setText('')
          }}
          aria-label="Maand voor het advies"
          className={fieldBase}
          disabled={state === 'busy'}
        >
          {[0, 1, 2].map((n) => {
            const m = shiftMonth(monthOf(now), -n)
            return (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            )
          })}
        </select>
        <input value={wish} onChange={(e) => setWish(e.target.value)} maxLength={500} placeholder="Vraag of wens (optioneel), bv. ik wil sparen voor een laptop" aria-label="Vraag aan NEXUS AI" className={`${fieldBase} min-w-48 flex-1`} disabled={state === 'busy'} />
      </div>
      {!hidden && (
        <details className={card}>
          <summary className="cursor-pointer">Wat NEXUS AI krijgt</summary>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-nx-muted">{facts}</pre>
        </details>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={primaryButton} disabled={state === 'busy'} onClick={start}>
          {state === 'busy' ? 'Bezig…' : state === 'done' ? 'Opnieuw vragen' : 'Advies vragen'}
        </button>
        {state === 'done' && <span className="text-nx-muted">Bewaard in Notities als "{adviceNoteTitle(month)}".</span>}
      </div>
      {error && (
        <p role="alert" className="text-red-500">
          {error}
        </p>
      )}
      {text && (
        <article aria-label="Advies" className="whitespace-pre-wrap rounded-lg border border-nx-border bg-nx-surface-2 p-3">
          {text}
        </article>
      )}
    </Section>
  )
}

function Settings({ hidden, onHidden }: { hidden: boolean; onHidden: (v: boolean) => void }) {
  const state = useFinance()
  const [confirm, setConfirm] = useState(false)
  const [cleared, setCleared] = useState(false)
  const count = alive(state.transactions).length + alive(state.budgets).length + alive(state.goals).length + alive(state.subscriptions).length
  return (
    <>
      <Section title="Meldingen">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={state.settings.alerts} onChange={(e) => setAlerts(e.target.checked)} />
          <span>Melding als een budget zijn drempel of 100% haalt</span>
        </label>
        <p className="text-xs text-nx-muted">Herinneringen voor abonnementen stel je per abonnement in.</p>
      </Section>
      <Section title="Privacy">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={hidden} onChange={(e) => onHidden(e.target.checked)} />
          <span>Bedragen verbergen op dit apparaat</span>
        </label>
        <p className="text-xs text-nx-muted">
          Financiën staat alleen in het profiel Persoonlijk. De kaart op het dashboard toont nooit bedragen, alleen percentages. Je gegevens staan op je apparaten en in je eigen NEXUS-account, waar alleen jij ze kunt lezen. NEXUS AI en het Weekoverzicht lezen je financiën niet, en er is geen bankkoppeling.
        </p>
      </Section>
      <Section title="Exporteren">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} onClick={exportCsv} disabled={alive(state.transactions).length === 0}>
            Transacties als CSV (Excel)
          </button>
          <button type="button" className={button} onClick={exportJson} disabled={count === 0}>
            Alles als JSON
          </button>
        </div>
        <p className="text-xs text-nx-muted">Alle bedragen zijn in euro.</p>
      </Section>
      <Section title="Alles verwijderen">
        {cleared && <p role="status">Je financiële gegevens zijn verwijderd, ook op je andere apparaten zodra die synchroniseren.</p>}
        {confirm ? (
          <div className="space-y-2 rounded-lg border border-red-500/60 p-3">
            <p>Dit verwijdert al je transacties, budgetten, spaardoelen en abonnementen op al je apparaten. Dat kan niet ongedaan worden. Exporteer eerst als je ze wilt bewaren.</p>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white"
                onClick={() => {
                  clearFinance()
                  setConfirm(false)
                  setCleared(true)
                }}
              >
                Ja, alles verwijderen
              </button>
              <button type="button" className={button} onClick={() => setConfirm(false)}>
                Annuleren
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className={button} disabled={count === 0} onClick={() => setConfirm(true)}>
            Financiële gegevens verwijderen…
          </button>
        )}
      </Section>
    </>
  )
}

/** A bank file as text: UTF-8, or Windows-1252 as many Belgian banks still write. */
async function readBankFile(file: File): Promise<string> {
  const bytes = await file.arrayBuffer()
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  return utf8.includes('\uFFFD') ? new TextDecoder('windows-1252').decode(bytes) : utf8
}

const MAX_IMPORT_BYTES = 5 * 1024 * 1024

/** Import from a bank's CSV: pick the file, check the columns, untick what you do not want, import. */
function ImportPanel({ onDone }: { onDone: (message: string | null) => void }) {
  const state = useFinance()
  const money = useMoney()
  const [rows, setRows] = useState<string[][] | null>(null)
  const [headerRow, setHeaderRow] = useState(-1)
  const [columns, setColumns] = useState<ImportColumns | null>(null)
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [categories, setCategories] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const load = async (file: File | undefined) => {
    setError(null)
    if (!file) return
    if (file.size > MAX_IMPORT_BYTES) return setError('Dat bestand is te groot (meer dan 5 MB). Exporteer een kortere periode.')
    const parsed = parseCsv(await readBankFile(file))
    const guess = guessColumns(parsed)
    if (!guess) return setError('Ik vond geen kolommen met een datum en een bedrag. Is dit een CSV-export van je bank?')
    setRows(parsed)
    setHeaderRow(guess.headerRow)
    setColumns(guess.columns)
    setPicked({})
    setCategories({})
  }

  const result = rows && columns ? importCandidates(rows, headerRow, columns, state) : null
  const isPicked = (c: ImportCandidate) => picked[c.id] ?? !c.duplicate
  const chosen = result?.candidates.filter(isPicked) ?? []
  const header = rows && headerRow >= 0 ? rows[headerRow] : null
  const width = rows ? Math.max(...rows.slice(0, 20).map((r) => r.length)) : 0
  const columnName = (i: number) => (header?.[i] ? header[i] : `Kolom ${i + 1}${rows?.[headerRow + 1]?.[i] ? ` (bv. ${rows[headerRow + 1][i].slice(0, 20)})` : ''}`)
  const columnSelect = (label: string, value: number, onChange: (i: number) => void, none = false) => (
    <label className="space-y-1">
      <span className="text-xs text-nx-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} className={field}>
        {none && <option value={-1}>Geen</option>}
        {Array.from({ length: width }, (_, i) => (
          <option key={i} value={i}>
            {columnName(i)}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <section aria-label="Importeren uit CSV" className={`${card} space-y-3`}>
      <h3 className="font-medium">Importeren uit CSV</h3>
      <p className="text-nx-muted">
        Exporteer je rekeningverrichtingen als CSV in de app of op de website van je bank (KBC, Belfius, BNP Paribas Fortis, ING, Argenta…) en kies het bestand hier. Het bestand blijft op dit apparaat; je ziet alles eerst voor er iets
        wordt toegevoegd.
      </p>
      <input type="file" accept=".csv,text/csv,text/plain" aria-label="CSV-bestand van je bank" onChange={(e) => void load(e.target.files?.[0])} className="block text-sm" />
      {error && (
        <p role="alert" className="text-red-500">
          {error}
        </p>
      )}
      {result && columns && (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            {columnSelect('Datum', columns.date, (date) => setColumns({ ...columns, date }))}
            {columnSelect('Bedrag', columns.amount, (amount) => setColumns({ ...columns, amount }))}
            {columnSelect('Omschrijving', columns.description[0] ?? -1, (i) => setColumns({ ...columns, description: i < 0 ? [] : [i, ...columns.description.slice(1).filter((d) => d !== i)] }), true)}
            {columnSelect('Extra omschrijving', columns.description[1] ?? -1, (i) => setColumns({ ...columns, description: [columns.description[0] ?? -1, i].filter((d) => d >= 0) }), true)}
          </div>
          <p className="text-xs text-nx-muted">
            {result.candidates.length} gevonden
            {result.candidates.some((c) => c.duplicate) && `, waarvan ${result.candidates.filter((c) => c.duplicate).length} al in Financiën (niet aangevinkt)`}
            {result.skipped > 0 && `; ${result.skipped} ${result.skipped === 1 ? 'rij' : 'rijen'} zonder geldige datum of bedrag overgeslagen`}. Een negatief bedrag is een uitgave, een positief bedrag inkomen.
          </p>
          <div className="max-h-80 overflow-y-auto rounded-md border border-nx-border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-nx-surface text-nx-muted">
                <tr>
                  <th className="p-1.5 font-normal">
                    <input
                      type="checkbox"
                      aria-label="Alles aanvinken"
                      checked={chosen.length === result.candidates.length && chosen.length > 0}
                      onChange={(e) => setPicked(Object.fromEntries(result.candidates.map((c) => [c.id, e.target.checked])))}
                    />
                  </th>
                  <th className="p-1.5 font-normal">Datum</th>
                  <th className="p-1.5 font-normal">Omschrijving</th>
                  <th className="p-1.5 text-right font-normal">Bedrag</th>
                  <th className="p-1.5 font-normal">Categorie</th>
                </tr>
              </thead>
              <tbody>
                {result.candidates.map((c) => (
                  <tr key={c.id} className={`border-t border-nx-border ${isPicked(c) ? '' : 'text-nx-muted'}`}>
                    <td className="p-1.5">
                      <input type="checkbox" aria-label={`${c.date} ${c.note || 'transactie'} importeren`} checked={isPicked(c)} onChange={(e) => setPicked({ ...picked, [c.id]: e.target.checked })} />
                    </td>
                    <td className="p-1.5 whitespace-nowrap tabular-nums">{dayLabel(c.date)}</td>
                    <td className="max-w-48 truncate p-1.5" title={c.note}>
                      {c.duplicate && <span className="mr-1 rounded bg-nx-surface-2 px-1">staat er al</span>}
                      {c.note || '–'}
                    </td>
                    <td className="p-1.5 text-right whitespace-nowrap tabular-nums">{money(c.kind === 'expense' ? -c.amount : c.amount, true)}</td>
                    <td className="p-1.5">
                      <select value={categories[c.id] ?? c.category} onChange={(e) => setCategories({ ...categories, [c.id]: e.target.value })} aria-label={`Categorie van ${c.note || c.date}`} className={`${fieldBase} py-0.5 text-xs`}>
                        {categoriesFor(c.kind).map((k) => (
                          <option key={k}>{k}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="flex gap-2">
        {result && (
          <button
            type="button"
            className={primaryButton}
            disabled={chosen.length === 0}
            onClick={() => {
              const n = importTransactions(chosen.map((c) => ({ id: c.id, kind: c.kind, amount: c.amount, category: categories[c.id] ?? c.category, note: c.note, date: c.date })))
              onDone(`${n} ${n === 1 ? 'transactie' : 'transacties'} geïmporteerd.`)
            }}
          >
            {chosen.length === 1 ? '1 transactie importeren' : `${chosen.length} transacties importeren`}
          </button>
        )}
        <button type="button" className={button} onClick={() => onDone(null)}>
          Annuleren
        </button>
      </div>
    </section>
  )
}

function SharedForm({ onDone }: { onDone: () => void }) {
  const state = useFinance()
  const friends = alive(state.friends)
  const [note, setNote] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(dateKey(Date.now()))
  const [paidBy, setPaidBy] = useState(ME)
  // Who is left out, so a friend added while the form is open is in it too.
  const [left, setLeft] = useState<string[]>([])
  const [category, setCategory] = useState('Eten en drinken')
  const people = [{ id: ME, name: 'Ik' }, ...friends.map((f) => ({ id: f.id, name: f.name }))]
  const among = people.map((p) => p.id).filter((id) => !left.includes(id))
  const cents = parseAmount(amount)
  // Only costs between you and friends: you paid, or you are one of those it is for.
  const valid = cents !== null && among.length > 0 && (paidBy === ME ? among.some((p) => p !== ME) : among.includes(ME))
  const share = cents !== null && among.length > 0 ? myShare({ amount: cents, among }) : 0
  return (
    <form
      aria-label="Nieuwe gedeelde kosten"
      className={`${card} space-y-2`}
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        addShared({ note, amount: cents, date, paidBy, among, category })
        onDone()
      }}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="Waarvoor, bv. Pizza" aria-label="Omschrijving" className={field} />
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Totaal, bv. 36" aria-label="Totaalbedrag" className={field} />
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Datum" className={field} />
        <label className="flex items-center gap-2">
          <span className="shrink-0 text-xs text-nx-muted">Betaald door</span>
          <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} aria-label="Betaald door" className={field}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categorie van je deel" className={field}>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <fieldset className="flex flex-wrap gap-3">
        <legend className="mb-1 text-xs text-nx-muted">Gedeeld door</legend>
        {people.map((p) => (
          <label key={p.id} className="flex items-center gap-1">
            <input
              type="checkbox"
              className="accent-[var(--nx-accent)]"
              checked={among.includes(p.id)}
              onChange={(e) => setLeft((list) => (e.target.checked ? list.filter((x) => x !== p.id) : [...list, p.id]))}
            />
            {p.name}
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-nx-muted">
        Gelijk verdeeld. {share > 0 ? `Jouw deel van ${formatMoney(share)} komt bij je uitgaven.` : 'Jij doet niet mee, dus er komt niets bij je uitgaven.'}
      </p>
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={!valid}>
          Gedeelde kosten toevoegen
        </button>
        <button type="button" className={button} onClick={onDone}>
          Annuleren
        </button>
      </div>
    </form>
  )
}

function Shared({ openAt }: { openAt: number }) {
  const state = useFinance()
  const money = useMoney()
  const [adding, setAdding] = useState(openAt > 0)
  const [name, setName] = useState('')
  useEffect(() => {
    if (openAt) setAdding(true)
  }, [openAt])
  const balances = friendBalances(state)
  const totals = sharedTotals(state)
  const names = new Map(alive(state.friends).map((f) => [f.id, f.name]))
  const who = (id: string) => (id === ME ? 'jij' : (names.get(id) ?? 'iemand'))
  const recent = alive(state.shared)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
    .slice(0, 30)

  return (
    <>
      <section aria-label="Saldo" className="grid grid-cols-2 gap-2">
        <Tile label="Ze zijn je schuldig" value={money(totals.owedToMe)} />
        <Tile label="Jij bent schuldig" value={money(totals.iOwe)} warn={totals.iOwe > 0} />
      </section>
      <Section title="Vrienden">
        <form
          aria-label="Vriend toevoegen"
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (addFriend(name)) setName('')
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Naam, bv. Remo" aria-label="Naam van je vriend" className={field} />
          <button type="submit" className={button} disabled={!name.trim()}>
            Toevoegen
          </button>
        </form>
        {balances.length === 0 && <p className="text-nx-muted">Voeg eerst de vrienden toe met wie je kosten deelt. Alleen hun naam blijft bewaard.</p>}
        <ul className="space-y-2">
          {balances.map(({ friend, balance }) => (
            <li key={friend.id} className={`${card} flex flex-wrap items-center gap-2`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{friend.name}</span>
                <span className={`block text-xs ${balance < 0 ? 'text-red-500' : 'text-nx-muted'}`}>
                  {balance > 0 ? `is je ${money(balance)} schuldig` : balance < 0 ? `je bent ${money(-balance)} schuldig` : 'jullie staan quitte'}
                </span>
              </span>
              {balance !== 0 && (
                <button type="button" className={smallButton} aria-label={`${friend.name} terugbetaald`} onClick={() => settle(friend.id, balance)}>
                  Terugbetaald
                </button>
              )}
              <button
                type="button"
                className={smallButton}
                aria-label={`${friend.name} verwijderen`}
                title={balance !== 0 ? 'Eerst terugbetalen' : undefined}
                disabled={balance !== 0}
                onClick={() => removeFriend(friend.id)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </Section>
      <Section
        title="Gedeelde kosten"
        action={
          !adding &&
          balances.length > 0 && (
            <button type="button" className={smallButton} onClick={() => setAdding(true)}>
              + Gedeelde kosten
            </button>
          )
        }
      >
        {adding && balances.length > 0 && <SharedForm key={openAt} onDone={() => setAdding(false)} />}
        {recent.length === 0 && !adding && <p className="text-nx-muted">Nog niets gedeeld.</p>}
        <ul className="space-y-1">
          {recent.map((e) => (
            <li key={e.id} className="flex items-center gap-2 border-b border-nx-border py-1.5 last:border-0">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{e.note || 'Gedeelde kosten'}</span>
                <span className="block text-xs text-nx-muted">
                  {dayLabel(e.date)} · {who(e.paidBy) === 'jij' ? 'jij betaalde' : `${who(e.paidBy)} betaalde`} {money(e.amount)} · voor {e.among.map(who).join(', ')}
                </span>
              </span>
              <span className="shrink-0 text-xs tabular-nums">{myShare(e) > 0 ? `jouw deel ${money(myShare(e))}` : ''}</span>
              <button type="button" className={smallButton} aria-label={`${e.note || 'Gedeelde kosten'} verwijderen`} onClick={() => removeShared(e.id)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </>
  )
}
