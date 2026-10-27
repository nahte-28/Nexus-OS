import { useState, useSyncExternalStore } from 'react'
import { activeHabits, ALL_DAYS, completion, dateKey, isDone, isDue, streak, toggleDone, type Habit } from '@nexus/core'
import { habitsStore, habitsSyncProblem } from '../habits/store'

const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const smallButton = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'
const WEEKDAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']
const DAY = 24 * 60 * 60_000

const useHabits = () => useSyncExternalStore(habitsStore.subscribe, habitsStore.getSnapshot)

function changeHabit(id: string, change: (h: Habit) => Habit) {
  habitsStore.update((s) => ({ ...s, habits: s.habits.map((h) => (h.id === id ? change(h) : h)) }))
}

function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** The last seven days, oldest first. */
const lastWeek = (now: number) => Array.from({ length: 7 }, (_, i) => startOfDay(startOfDay(now) - (6 - i) * DAY + 3_600_000))

/** Gewoontes: tick off what you do every day, keep your streak, get a nudge when one is still open. */
export function Habits() {
  const state = useHabits()
  const problem = useSyncExternalStore(habitsSyncProblem.subscribe, habitsSyncProblem.getSnapshot)
  const habits = activeHabits(state)
  const now = Date.now()
  const today = habits.filter((h) => isDue(h, now))
  const [editing, setEditing] = useState<string | null>(null)

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4 text-sm">
      {problem?.startsWith('setup:') && (
        <p className="rounded-lg border border-nx-border bg-nx-surface-2 p-3">
          Je gewoontes staan alleen op dit apparaat: de database is nog niet bijgewerkt. Voer <code className="font-mono text-xs">{problem.slice(6)}</code> uit in de SQL Editor van Supabase.
        </p>
      )}
      <section aria-label="Vandaag" className="space-y-2">
        <h2 className="text-lg font-semibold">
          Vandaag <span className="text-sm font-normal text-nx-muted">{today.filter((h) => isDone(h, now)).length} van {today.length} gedaan</span>
        </h2>
        {habits.length === 0 && <p className="text-nx-muted">Nog geen gewoontes. Voeg er een toe, bv. "30 minuten studeren" of "Sporten".</p>}
        {habits.length > 0 && today.length === 0 && <p className="text-nx-muted">Vandaag staat er niets op het programma.</p>}
        <ul className="space-y-2">
          {today.map((h) => (
            <TodayRow key={h.id} habit={h} now={now} />
          ))}
        </ul>
      </section>
      <AddHabit />
      {habits.length > 0 && (
        <section aria-label="Alle gewoontes" className="space-y-2">
          <h3 className="font-medium">Deze week</h3>
          <ul className="space-y-2">
            {habits.map((h) => (
              <WeekRow key={h.id} habit={h} now={now} editing={editing === h.id} onEdit={() => setEditing(editing === h.id ? null : h.id)} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function TodayRow({ habit, now }: { habit: Habit; now: number }) {
  const done = isDone(habit, now)
  const days = streak(habit, now)
  return (
    <li className="flex items-center gap-3 rounded-lg border border-nx-border bg-nx-surface-2 p-3">
      <input type="checkbox" className="size-5" checked={done} aria-label={`${habit.name} gedaan`} onChange={() => changeHabit(habit.id, (h) => toggleDone(h, now))} />
      <span className={`min-w-0 flex-1 ${done ? 'text-nx-muted line-through' : 'font-medium'}`}>{habit.name}</span>
      {days > 0 && (
        <span className="shrink-0 text-xs text-nx-muted" title="Dagen op rij">
          🔥 {days}
        </span>
      )}
    </li>
  )
}

function WeekRow({ habit, now, editing, onEdit }: { habit: Habit; now: number; editing: boolean; onEdit: () => void }) {
  const week = completion(habit, now)
  return (
    <li className="space-y-2 rounded-lg border border-nx-border p-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium">{habit.name}</span>
        <span className="text-xs text-nx-muted">
          {week.done}/{week.due}
        </span>
        <button type="button" className={smallButton} aria-expanded={editing} onClick={onEdit}>
          Wijzigen
        </button>
      </div>
      <div className="flex gap-1" role="group" aria-label={`${habit.name} deze week`}>
        {lastWeek(now).map((day) => {
          const due = isDue(habit, day)
          const done = isDone(habit, day)
          const label = new Date(day).toLocaleDateString('nl-BE', { weekday: 'short' })
          return (
            <button
              key={dateKey(day)}
              type="button"
              aria-pressed={done}
              aria-label={`${label} ${done ? 'gedaan' : 'niet gedaan'}`}
              onClick={() => changeHabit(habit.id, (h) => toggleDone(h, day))}
              className={`grid size-8 place-items-center rounded-full border text-[10px] ${done ? 'border-transparent bg-nx-accent text-nx-accent-text' : due ? 'border-nx-border' : 'border-dashed border-nx-border text-nx-muted'}`}
            >
              {label.slice(0, 2)}
            </button>
          )
        })}
      </div>
      {editing && <HabitForm habit={habit} />}
    </li>
  )
}

function DayPicker({ days, onChange }: { days: number[]; onChange: (days: number[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Dagen">
      {WEEKDAYS.map((label, i) => {
        const day = i + 1
        const on = days.includes(day)
        return (
          <button
            key={day}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? days.filter((d) => d !== day) : [...days, day].sort())}
            className={`size-8 rounded-full border border-nx-border text-xs ${on ? 'bg-nx-accent font-medium text-nx-accent-text' : 'hover:bg-nx-surface-2'}`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

/** Changes an existing habit: name, days, reminder, or removes it. */
function HabitForm({ habit }: { habit: Habit }) {
  const set = (patch: Partial<Habit>) => changeHabit(habit.id, (h) => ({ ...h, ...patch, updatedAt: Date.now() }))
  return (
    <div className="space-y-2 border-t border-nx-border pt-2">
      <input aria-label="Naam van de gewoonte" value={habit.name} onChange={(e) => set({ name: e.target.value })} className={field} />
      <DayPicker days={habit.days} onChange={(days) => days.length > 0 && set({ days })} />
      <Reminder remindAt={habit.remindAt} target={habit.target} onChange={set} />
      <button type="button" className={`${smallButton} text-red-500`} onClick={() => set({ deletedAt: Date.now() })}>
        Gewoonte verwijderen
      </button>
    </div>
  )
}

function Reminder({ remindAt, target, onChange }: { remindAt: string | null; target: Habit['target']; onChange: (patch: Partial<Habit>) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={remindAt !== null} onChange={(e) => onChange({ remindAt: e.target.checked ? '20:00' : null })} />
        Herinnering als het nog open staat om
      </label>
      <input type="time" aria-label="Herinnering om" disabled={remindAt === null} value={remindAt ?? '20:00'} onChange={(e) => e.target.value && onChange({ remindAt: e.target.value })} className={`${field} w-28`} />
      <select aria-label="Herinnering naar" disabled={remindAt === null} value={target} onChange={(e) => onChange({ target: e.target.value as Habit['target'] })} className={`${field} w-auto`}>
        <option value="phone">Gsm en horloge</option>
        <option value="this_device">Alleen dit apparaat</option>
      </select>
    </div>
  )
}

function AddHabit() {
  const [name, setName] = useState('')
  const [days, setDays] = useState(ALL_DAYS)
  const [remind, setRemind] = useState<Pick<Habit, 'remindAt' | 'target'>>({ remindAt: '20:00', target: 'phone' })
  const add = () => {
    const now = Date.now()
    habitsStore.update((s) => ({ ...s, habits: [...s.habits, { id: crypto.randomUUID(), name: name.trim(), days, ...remind, done: [], createdAt: now, updatedAt: now, deletedAt: null }] }))
    setName('')
  }
  return (
    <form
      aria-label="Nieuwe gewoonte"
      className="space-y-2 rounded-lg border border-nx-border p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim() && days.length > 0) add()
      }}
    >
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nieuwe gewoonte, bv. 30 minuten studeren" aria-label="Nieuwe gewoonte" className={field} />
        <button type="submit" disabled={!name.trim() || days.length === 0} className={primaryButton}>
          Toevoegen
        </button>
      </div>
      <DayPicker days={days} onChange={setDays} />
      <Reminder remindAt={remind.remindAt} target={remind.target} onChange={(patch) => setRemind((r) => ({ ...r, ...patch }))} />
    </form>
  )
}
