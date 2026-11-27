import { useState, useSyncExternalStore, type FormEvent } from 'react'
import {
  activeCourses,
  activeGoals,
  activeHabits,
  dateKey,
  GOAL_KIND_LABELS,
  GOAL_KINDS,
  GOAL_LIMITS,
  GOAL_STATUS_LABELS,
  GOAL_TITLE_MAX,
  semesterGoalProgress,
  goalTitle,
  MAX_GOALS,
  newGoal,
  semesterOf,
  type Goal,
  type GoalFacts,
  type GoalKind,
  type GoalStatus,
} from '@nexus/core'
import { goalsStore, goalsSyncProblem, useGoals } from '../goals/store'
import { gradesStore } from '../grades/store'
import { habitsStore } from '../habits/store'
import { focusStore } from '../study/timer'
import { openApp } from '../shell/openApp'

const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const smallButton = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'

const TONE: Record<GoalStatus, string> = {
  reached: 'border-nx-success text-nx-success dark:text-nx-success',
  on_track: 'border-nx-accent text-nx-accent',
  behind: 'border-nx-warning text-nx-warning dark:text-nx-warning',
  missed: 'border-nx-danger text-nx-danger dark:text-nx-danger',
  empty: 'border-nx-border text-nx-muted',
}

/** Where a goal gets its numbers. */
const SOURCE: Record<GoalKind, { app: 'grades' | 'study' | 'habits'; label: string }> = {
  average: { app: 'grades', label: 'Cijfers' },
  course: { app: 'grades', label: 'Cijfers' },
  credits: { app: 'grades', label: 'Cijfers' },
  focus: { app: 'study', label: 'Studie' },
  habit: { app: 'habits', label: 'Gewoontes' },
}

function useFacts(): GoalFacts {
  const grades = useSyncExternalStore(gradesStore.subscribe, gradesStore.getSnapshot)
  const habits = useSyncExternalStore(habitsStore.subscribe, habitsStore.getSnapshot)
  const focus = useSyncExternalStore(focusStore.subscribe, focusStore.getSnapshot)
  return { grades, habits, focusLog: focus.log }
}

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `goal-${Date.now()}-${Math.random().toString(36).slice(2)}`)

function changeGoal(id: string, patch: Partial<Goal>) {
  const now = Date.now()
  goalsStore.update((s) => ({ ...s, goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch, updatedAt: now } : g)) }))
}

/** Doelen: semester goals that follow themselves from Cijfers, Studie and Gewoontes. */
export function Goals() {
  const state = useGoals()
  const facts = useFacts()
  const problem = useSyncExternalStore(goalsSyncProblem.subscribe, goalsSyncProblem.getSnapshot)
  const now = Date.now()
  const goals = activeGoals(state)
  const today = dateKey(now)
  const running = goals.filter((g) => g.end >= today)
  const done = goals.filter((g) => !running.includes(g))
  const [adding, setAdding] = useState(goals.length === 0)

  return (
    <div className="h-full overflow-y-auto"><div className="mx-auto max-w-3xl space-y-4 p-4 text-sm">
      {problem?.startsWith('setup:') && (
        <p className="rounded-lg border border-nx-border bg-nx-surface-2 p-3">
          Je doelen staan alleen op dit apparaat: de database is nog niet bijgewerkt. Voer <code className="font-mono text-xs">{problem.slice(6)}</code> uit in de SQL Editor van Supabase, of kijk in Account › Database-check.
        </p>
      )}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="sr-only">Doelen</h2>
        {!adding && goals.length < MAX_GOALS && (
          <button type="button" className={primaryButton} onClick={() => setAdding(true)}>
            Doel toevoegen
          </button>
        )}
      </div>
      <p className="text-nx-muted">Je doelen houden zichzelf bij: NEXUS rekent ze uit met je cijfers, je focustijd en je gewoontes. Je hoeft niets af te vinken.</p>
      {adding && <AddGoal facts={facts} onDone={() => setAdding(false)} />}
      {goals.length === 0 && !adding && <p className="text-nx-muted">Nog geen doelen.</p>}
      {running.length > 0 && (
        <section aria-label="Lopende doelen" className="space-y-2">
          <ul className="space-y-2">
            {running.map((g) => (
              <GoalRow key={g.id} goal={g} facts={facts} now={now} />
            ))}
          </ul>
        </section>
      )}
      {done.length > 0 && (
        <section aria-label="Afgelopen" className="space-y-2">
          <h3 className="font-medium">Afgelopen</h3>
          <ul className="space-y-2">
            {done.map((g) => (
              <GoalRow key={g.id} goal={g} facts={facts} now={now} />
            ))}
          </ul>
        </section>
      )}
    </div></div>
  )
}

function GoalRow({ goal, facts, now }: { goal: Goal; facts: GoalFacts; now: number }) {
  const p = semesterGoalProgress(goal, facts, now)
  const title = goalTitle(goal, facts)
  const [editing, setEditing] = useState(false)
  const limits = GOAL_LIMITS[goal.kind]
  const source = SOURCE[goal.kind]
  return (
    <li className="space-y-2 rounded-lg border border-nx-border p-3" aria-label={title}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{title}</span>
        <span className={`rounded-full border px-2 py-0.5 text-xs ${TONE[p.status]}`}>{GOAL_STATUS_LABELS[p.status]}</span>
        <span className="ml-auto text-xs text-nx-muted">tot {goal.end}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-nx-surface-2" role="progressbar" aria-label={`Voortgang ${title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.share * 100)}>
        <div className="h-full rounded-full bg-nx-accent" style={{ width: `${Math.round(p.share * 100)}%` }} />
      </div>
      <p>{p.line}</p>
      {p.hint && <p className="text-nx-muted">{p.hint}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={smallButton} onClick={() => openApp(source.app)}>
          Open {source.label}
        </button>
        <button type="button" className={smallButton} onClick={() => setEditing((e) => !e)}>
          {editing ? 'Klaar' : 'Aanpassen'}
        </button>
      </div>
      {editing && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            Doel ({limits.unit})
            <input
              className={field}
              type="number"
              min={limits.min}
              max={limits.max}
              step={limits.step}
              value={goal.target}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (Number.isFinite(v)) changeGoal(goal.id, { target: Math.min(Math.max(v, limits.min), limits.max) })
              }}
            />
          </label>
          <label className="flex flex-col gap-1">
            Tot
            <input className={field} type="date" min={goal.start} value={goal.end} onChange={(e) => e.target.value >= goal.start && changeGoal(goal.id, { end: e.target.value })} />
          </label>
          <button
            type="button"
            className={smallButton}
            onClick={() => {
              if (window.confirm(`Doel "${title}" verwijderen?`)) changeGoal(goal.id, { deletedAt: Date.now() })
            }}
          >
            Verwijderen
          </button>
        </div>
      )}
    </li>
  )
}

function AddGoal({ facts, onDone }: { facts: GoalFacts; onDone: () => void }) {
  const [kind, setKind] = useState<GoalKind>('average')
  const [target, setTarget] = useState(GOAL_LIMITS.average.default)
  const [ref, setRef] = useState('')
  const [title, setTitle] = useState('')
  const [end, setEnd] = useState(() => semesterOf(Date.now()).end)
  const courses = activeCourses(facts.grades)
  const habits = activeHabits(facts.habits)
  const limits = GOAL_LIMITS[kind]
  const needsRef = kind === 'course' || kind === 'habit'
  const options = kind === 'course' ? courses.map((c) => ({ id: c.id, name: c.name })) : habits.map((h) => ({ id: h.id, name: h.name }))
  const pick = (next: GoalKind) => {
    setKind(next)
    setTarget(GOAL_LIMITS[next].default)
    setRef('')
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (needsRef && !ref) return
    const now = Date.now()
    const goal = newGoal(newId(), kind, now, { title, target, ref: needsRef ? ref : null, end })
    goalsStore.update((s) => ({ ...s, goals: [...s.goals, goal] }))
    onDone()
  }
  return (
    <form aria-label="Nieuw doel" className="space-y-3 rounded-lg border border-nx-border p-3" onSubmit={submit}>
      <fieldset className="space-y-1">
        <legend className="font-medium">Wat wil je halen?</legend>
        {GOAL_KINDS.map((k) => (
          <label key={k} className="flex items-center gap-2">
            <input type="radio" name="goal-kind" checked={kind === k} onChange={() => pick(k)} />
            {GOAL_KIND_LABELS[k]}
          </label>
        ))}
      </fieldset>
      {needsRef && (
        <label className="flex flex-col gap-1">
          {kind === 'course' ? 'Vak' : 'Gewoonte'}
          {options.length > 0 ? (
            <select className={field} value={ref} onChange={(e) => setRef(e.target.value)}>
              <option value="">Kies…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-nx-muted">{kind === 'course' ? 'Voeg eerst een vak toe in Cijfers.' : 'Voeg eerst een gewoonte toe in Gewoontes.'}</span>
          )}
        </label>
      )}
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          Doel ({limits.unit})
          <input className={field} type="number" min={limits.min} max={limits.max} step={limits.step} value={target} onChange={(e) => setTarget(Number(e.target.value))} />
        </label>
        <label className="flex flex-col gap-1">
          Tot
          <input className={field} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        Naam (mag leeg)
        <input className={field} value={title} maxLength={GOAL_TITLE_MAX} placeholder="bv. Slagen voor alles" onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={needsRef && !ref}>
          Doel opslaan
        </button>
        <button type="button" className={smallButton} onClick={onDone}>
          Annuleren
        </button>
      </div>
    </form>
  )
}
