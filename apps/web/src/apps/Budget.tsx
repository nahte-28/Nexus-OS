import { useState, useSyncExternalStore } from 'react'
import { activeTransactions, dateKey, EXPENSE_CATEGORIES, formatMoney, INCOME_CATEGORIES, monthLabel, monthOf, monthSummary, parseAmount, shiftMonth, type MoneyKind } from '@nexus/core'
import { addTransaction, budgetStore, budgetSyncProblem, removeTransaction, setMonthlyBudget } from '../budget/store'

const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const smallButton = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'

const useBudget = () => useSyncExternalStore(budgetStore.subscribe, budgetStore.getSnapshot)
const dayLabel = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d))
}

/** Budget: what you spend and earn per month, against a monthly budget, with a nudge at 80% and 100%. */
export function Budget() {
  const state = useBudget()
  const problem = useSyncExternalStore(budgetSyncProblem.subscribe, budgetSyncProblem.getSnapshot)
  const now = Date.now()
  const [month, setMonth] = useState(() => monthOf(now))
  const summary = monthSummary(state, month, now)
  const list = activeTransactions(state)
    .filter((t) => monthOf(t.date) === month)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
  const days = [...new Set(list.map((t) => t.date))]
  const top = summary.byCategory[0]?.amount ?? 0

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4 text-sm">
      {problem?.startsWith('setup:') && (
        <p className="rounded-lg border border-nx-border bg-nx-surface-2 p-3">
          Je budget staat alleen op dit apparaat: de database is nog niet bijgewerkt. Voer <code className="font-mono text-xs">{problem.slice(6)}</code> uit in de SQL Editor van Supabase.
        </p>
      )}
      <div className="flex items-center gap-2">
        <button type="button" className={smallButton} aria-label="Vorige maand" onClick={() => setMonth(shiftMonth(month, -1))}>
          ‹
        </button>
        <h2 className="min-w-0 flex-1 text-center text-lg font-semibold first-letter:uppercase">{monthLabel(month)}</h2>
        <button type="button" className={smallButton} aria-label="Volgende maand" disabled={month >= monthOf(now)} onClick={() => setMonth(shiftMonth(month, 1))}>
          ›
        </button>
      </div>

      <section aria-label="Deze maand" className="grid grid-cols-3 gap-2">
        <Tile label="Uitgegeven" value={formatMoney(summary.expenses)} />
        <Tile label="Inkomsten" value={formatMoney(summary.income)} />
        <Tile label={summary.left !== null && summary.left < 0 ? 'Over budget' : 'Nog over'} value={summary.left === null ? '–' : formatMoney(Math.abs(summary.left))} warn={summary.left !== null && summary.left < 0} />
      </section>

      <MonthlyBudget monthly={state.monthly} used={summary.used} projected={summary.projected} />

      {summary.byCategory.length > 0 && (
        <section aria-label="Per categorie" className="space-y-1">
          <h3 className="font-medium">Per categorie</h3>
          <ul className="space-y-1">
            {summary.byCategory.map((c) => (
              <li key={c.category} className="grid grid-cols-[8rem_1fr_auto] items-center gap-2">
                <span className="truncate">{c.category}</span>
                <span className="h-2 rounded-full bg-nx-surface-2">
                  <span className="block h-2 rounded-full bg-nx-accent" style={{ width: `${Math.max(2, (c.amount / top) * 100)}%` }} />
                </span>
                <span className="tabular-nums text-nx-muted">{formatMoney(c.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AddTransaction key={month} month={month} now={now} />

      <section aria-label="Overzicht" className="space-y-2">
        {list.length === 0 && <p className="text-nx-muted">Nog niets ingevuld voor deze maand.</p>}
        {days.map((day) => (
          <div key={day}>
            <h4 className="text-xs font-semibold text-nx-muted first-letter:uppercase">{dayLabel(day)}</h4>
            <ul className="divide-y divide-nx-border">
              {list
                .filter((t) => t.date === day)
                .map((t) => (
                  <li key={t.id} className="flex items-center gap-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate">
                      {t.category}
                      {t.note && <span className="text-nx-muted"> · {t.note}</span>}
                    </span>
                    <span className={`tabular-nums ${t.kind === 'income' ? 'font-medium' : ''}`}>{formatMoney(t.kind === 'income' ? t.amount : -t.amount, true)}</span>
                    <button type="button" className={smallButton} aria-label={`${t.category} ${formatMoney(t.amount)} verwijderen`} onClick={() => removeTransaction(t.id)}>
                      ✕
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  )
}

function Tile({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-nx-border bg-nx-surface-2 p-3">
      <p className="text-xs text-nx-muted">
        {warn && <span aria-hidden="true">⚠️ </span>}
        {label}
      </p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function MonthlyBudget({ monthly, used, projected }: { monthly: number | null; used: number | null; projected: number | null }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(monthly ? String(monthly / 100).replace('.', ',') : '')
  const cents = parseAmount(text)
  if (editing || monthly === null) {
    return (
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setMonthlyBudget(text.trim() ? cents : null)
          setEditing(false)
        }}
      >
        <label className="flex items-center gap-2">
          <span>Budget per maand €</span>
          <input inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} placeholder="bv. 250" aria-label="Budget per maand" className={`${field} w-28`} />
        </label>
        <button type="submit" className={button} disabled={text.trim() !== '' && cents === null}>
          Bewaren
        </button>
        {monthly === null && <span className="text-xs text-nx-muted">Met een budget krijg je een melding bij 80% en 100%.</span>}
      </form>
    )
  }
  const shown = Math.min(100, used ?? 0)
  return (
    <section aria-label="Budget" className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span>
          {used}% van {formatMoney(monthly)}
          {projected !== null && <span className="text-nx-muted"> · aan dit tempo {formatMoney(projected)} deze maand</span>}
        </span>
        <button type="button" className={smallButton} onClick={() => setEditing(true)}>
          Wijzigen
        </button>
      </div>
      <div role="meter" aria-label="Budget gebruikt" aria-valuemin={0} aria-valuemax={100} aria-valuenow={shown} className="h-2 rounded-full bg-nx-surface-2">
        <div className={`h-2 rounded-full ${used !== null && used >= 100 ? 'bg-red-500' : 'bg-nx-accent'}`} style={{ width: `${shown}%` }} />
      </div>
    </section>
  )
}

function AddTransaction({ month, now }: { month: string; now: number }) {
  const [kind, setKind] = useState<MoneyKind>('expense')
  const [amount, setAmount] = useState('')
  const categories = kind === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0])
  const [note, setNote] = useState('')
  // Today in the current month, else the first of the month shown.
  const [date, setDate] = useState(() => (month === monthOf(now) ? dateKey(now) : `${month}-01`))
  const cents = parseAmount(amount)
  return (
    <form
      aria-label="Nieuw bedrag"
      className="space-y-2 rounded-lg border border-nx-border p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (cents === null) return
        addTransaction({ kind, amount: cents, category, note, date })
        setAmount('')
        setNote('')
      }}
    >
      <div role="group" aria-label="Soort" className="flex gap-1">
        {(['expense', 'income'] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => {
              setKind(k)
              setCategory((k === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES)[0])
            }}
            className={`rounded-full border border-nx-border px-3 py-1 ${kind === k ? 'bg-nx-accent font-medium text-nx-accent-text' : 'hover:bg-nx-surface-2'}`}
          >
            {k === 'expense' ? 'Uitgave' : 'Inkomen'}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Bedrag, bv. 4,50" aria-label="Bedrag" className={field} />
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categorie" className={field}>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Datum" className={field} />
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Notitie (optioneel)" aria-label="Notitie" className={field} />
      </div>
      <button type="submit" className={primaryButton} disabled={cents === null}>
        Toevoegen
      </button>
    </form>
  )
}
