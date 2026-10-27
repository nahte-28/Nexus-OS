import { useState, useSyncExternalStore } from 'react'
import {
  ACCENT_IDS,
  agendaDay,
  dagstartNotice,
  appointmentsOf,
  DEFAULT_APPOINTMENT_REMIND,
  DEFAULT_REMIND,
  deadlinesOf,
  parseAppointment,
  parseDeadline,
  projectProgress,
  projectsOf,
  REMIND_OPTIONS,
  TARGET_LABELS,
  type AccentId,
  type AgendaEntry,
  type DagstartSettings,
  type Appointment,
  type Deadline,
  type LifeItem,
  type Project,
  type ReminderTarget,
} from '@nexus/core'
import { useConnect } from '../connect/ConnectContext'
import { defaultDeadlineEffects } from '../life/alerts'
import { sendDagstartTest } from '../life/dagstart'
import { lifeSyncProblem } from '../life/sync'
import { lifeStore } from '../life/store'
import { profilesStore, useProfiles } from '../profiles/store'
import { remindersStore } from '../reminders/store'
import { ACCENTS } from '../theme/accents'

const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'
const TABS = ['Overzicht', 'Deadlines', 'Afspraken', 'Projecten', 'Dagstart'] as const
const DAY = 24 * 60 * 60_000

const useLife = () => useSyncExternalStore(lifeStore.subscribe, lifeStore.getSnapshot)

function localInput(at: number): string {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Tomorrow at 23:59, the usual school deadline. */
function defaultDue(now = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() + 1)
  d.setHours(23, 59, 0, 0)
  return localInput(d.getTime())
}

function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const clock = (t: number) => new Date(t).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })
const when = (t: number) => new Date(t).toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function dayTitle(dayStart: number, today: number): string {
  if (dayStart === today) return 'Vandaag'
  if (dayStart === startOfDay(today + DAY + 3_600_000)) return 'Morgen'
  const word = new Date(dayStart).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' })
  return word.charAt(0).toUpperCase() + word.slice(1)
}

function ProjectDot({ project }: { project: Project | undefined }) {
  if (!project?.color) return null
  return <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: ACCENTS[project.color].focus[0] }} />
}

/** NEXUS Life: lessons, deadlines and projects together, offline and on every device. */
export function Agenda() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overzicht')
  const problem = useSyncExternalStore(lifeSyncProblem.subscribe, lifeSyncProblem.getSnapshot)
  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-nx-border px-3 py-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1 ${tab === t ? 'bg-nx-surface-2 font-medium' : 'hover:bg-nx-surface-2'}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {problem === 'setup' && (
          <p className="rounded-lg border border-nx-border bg-nx-surface-2 p-3">
            Je agenda staat alleen op dit apparaat: de database is nog niet bijgewerkt. Voer{' '}
            <code className="font-mono text-xs">supabase/migrations/20261027090000_life.sql</code> en{' '}
            <code className="font-mono text-xs">20261027120000_life_appointments.sql</code> uit in de SQL Editor van Supabase.
          </p>
        )}
        {tab === 'Overzicht' && <Overview onAdd={setTab} />}
        {tab === 'Deadlines' && <Deadlines />}
        {tab === 'Afspraken' && <Appointments />}
        {tab === 'Projecten' && <Projects />}
        {tab === 'Dagstart' && <Dagstart />}
      </div>
    </div>
  )
}

function Overview({ onAdd }: { onAdd: (tab: 'Deadlines' | 'Afspraken') => void }) {
  const items = useLife()
  const reminders = useSyncExternalStore(remindersStore.subscribe, remindersStore.getSnapshot)
  const { state } = useProfiles()
  const now = Date.now()
  const today = startOfDay(now)
  const projects = new Map(projectsOf(items).map((p) => [p.id, p]))
  const overdue = deadlinesOf(items).filter((d) => d.doneAt === null && d.dueAt < now)
  // Seven days ahead; +1 hour per step keeps each start on the right day across a time change.
  const days = Array.from({ length: 7 }, (_, i) => startOfDay(today + i * DAY + 3_600_000))
  const input = { calendarEvents: state.calendarEvents, timetable: state.lessons, items, reminders }
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 flex-1 text-lg font-semibold">Je week</h2>
        <button type="button" className={button} onClick={() => onAdd('Afspraken')}>
          + Afspraak
        </button>
        <button type="button" className={primaryButton} onClick={() => onAdd('Deadlines')}>
          + Deadline
        </button>
      </div>
      {overdue.length > 0 && (
        <section aria-label="Te laat" className="space-y-1 rounded-lg border border-red-500/40 p-3">
          <h3 className="font-medium text-red-500">Te laat</h3>
          <ul className="space-y-1">
            {overdue.map((d) => (
              <DeadlineLine key={d.id} deadline={d} project={projects.get(d.projectId ?? '')} />
            ))}
          </ul>
        </section>
      )}
      {days.map((day) => {
        const entries = agendaDay(input, day)
        return (
          <section key={day} aria-label={dayTitle(day, today)} className="space-y-1">
            <h3 className="font-medium">{dayTitle(day, today)}</h3>
            {entries.length === 0 ? (
              <p className="text-nx-muted">Niets gepland.</p>
            ) : (
              <ul className="space-y-1">
                {entries.map((e, i) => (
                  <Entry key={i} entry={e} project={e.kind === 'deadline' ? projects.get(e.deadline.projectId ?? '') : undefined} />
                ))}
              </ul>
            )}
          </section>
        )
      })}
      {state.calendarEvents.length === 0 && state.lessons.length === 0 && (
        <p className="text-nx-muted">Je lessen verschijnen hier zodra je in Profielen je lesrooster of de agendalink van school instelt.</p>
      )}
    </>
  )
}

function Entry({ entry, project }: { entry: AgendaEntry; project?: Project }) {
  if (entry.kind === 'deadline') return <DeadlineLine deadline={entry.deadline} project={project} showTime />
  return (
    <li className="flex items-baseline gap-2 rounded-md bg-nx-surface-2 px-2 py-1.5">
      <span className="w-24 shrink-0 text-nx-muted tabular-nums">
        {clock(entry.at)}
        {entry.kind === 'lesson' || entry.kind === 'appointment' ? `–${clock(entry.end)}` : ''}
      </span>
      <span className="min-w-0 flex-1">
        {entry.kind === 'reminder' ? '⏰ ' : entry.kind === 'appointment' ? '📅 ' : ''}
        {entry.title}
        {entry.detail && <span className="text-nx-muted"> · {entry.detail}</span>}
      </span>
    </li>
  )
}

function DeadlineLine({ deadline: d, project, showTime }: { deadline: Deadline; project?: Project; showTime?: boolean }) {
  const done = d.doneAt !== null
  return (
    <li className="flex items-center gap-2 rounded-md border border-nx-border px-2 py-1.5">
      <input
        type="checkbox"
        checked={done}
        aria-label={`${d.title} klaar`}
        onChange={() => void lifeStore.updateDeadline(d.id, { doneAt: done ? null : Date.now() })}
      />
      {showTime && <span className="w-[4.75rem] shrink-0 text-nx-muted tabular-nums">{clock(d.dueAt)}</span>}
      <span className={`min-w-0 flex-1 ${done ? 'text-nx-muted line-through' : 'font-medium'}`}>
        {d.title}
        {!showTime && <span className="font-normal text-nx-muted"> · {when(d.dueAt)}</span>}
      </span>
      {project && (
        <span className="flex shrink-0 items-center gap-1 text-xs text-nx-muted">
          <ProjectDot project={project} />
          {project.name}
        </span>
      )}
    </li>
  )
}

function Deadlines() {
  const items = useLife()
  const projects = projectsOf(items).filter((p) => !p.archived)
  const all = deadlinesOf(items)
  const [editing, setEditing] = useState<Deadline | null>(null)
  const [filter, setFilter] = useState<string>('')
  const shown = all.filter((d) => !filter || d.projectId === filter)
  const open = shown.filter((d) => d.doneAt === null)
  const done = shown.filter((d) => d.doneAt !== null).reverse()
  const byId = new Map(projectsOf(items).map((p) => [p.id, p]))
  return (
    <>
      <DeadlineForm key={editing?.id ?? 'new'} projects={projects} editing={editing} onDone={() => setEditing(null)} />
      {projects.length > 0 && (
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Project" className={`${field} sm:w-60`}>
          <option value="">Alle projecten</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      {open.length === 0 ? (
        <p className="text-nx-muted">Geen open deadlines.</p>
      ) : (
        <ul className="space-y-2" aria-label="Open deadlines">
          {open.map((d) => (
            <DeadlineRow key={d.id} deadline={d} project={byId.get(d.projectId ?? '')} onEdit={() => setEditing(d)} />
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <details>
          <summary className="cursor-pointer text-nx-muted">Klaar ({done.length})</summary>
          <ul className="mt-2 space-y-2" aria-label="Afgewerkte deadlines">
            {done.map((d) => (
              <DeadlineRow key={d.id} deadline={d} project={byId.get(d.projectId ?? '')} onEdit={() => setEditing(d)} />
            ))}
          </ul>
        </details>
      )}
    </>
  )
}

function DeadlineRow({ deadline: d, project, onEdit }: { deadline: Deadline; project?: Project; onEdit: () => void }) {
  const done = d.doneAt !== null
  const late = !done && d.dueAt < Date.now()
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-nx-border bg-nx-surface-2 p-3">
      <input
        type="checkbox"
        checked={done}
        aria-label={`${d.title} klaar`}
        onChange={() => void lifeStore.updateDeadline(d.id, { doneAt: done ? null : Date.now() })}
      />
      <div className="min-w-0 flex-1">
        <p className={done ? 'text-nx-muted line-through' : 'font-medium'}>{d.title}</p>
        <p className={`text-xs ${late ? 'text-red-500' : 'text-nx-muted'}`}>
          {late ? 'Te laat · ' : ''}
          {when(d.dueAt)}
          {project ? ` · ${project.name}` : ''}
          {d.remind.length > 0 && !done ? ` · ${TARGET_LABELS[d.target]}` : ''}
        </p>
        {d.notes && <p className="mt-1 whitespace-pre-wrap text-nx-muted">{d.notes}</p>}
      </div>
      <button type="button" className={button} onClick={onEdit}>
        Bewerken
      </button>
      <button type="button" className={`${button} text-red-500`} onClick={() => window.confirm(`"${d.title}" verwijderen?`) && void lifeStore.remove(d.id)}>
        Verwijderen
      </button>
    </li>
  )
}

function DeadlineForm({ projects, editing, onDone }: { projects: Project[]; editing: Deadline | null; onDone: () => void }) {
  const [title, setTitle] = useState(editing?.title ?? '')
  const [due, setDue] = useState(editing ? localInput(editing.dueAt) : defaultDue)
  const [projectId, setProjectId] = useState(editing?.projectId ?? '')
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const [remind, setRemind] = useState<number[]>(editing?.remind ?? DEFAULT_REMIND)
  const [target, setTarget] = useState<ReminderTarget>(editing?.target ?? 'phone')
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="space-y-2 rounded-lg border border-nx-border p-3"
      aria-label={editing ? 'Deadline bewerken' : 'Nieuwe deadline'}
      onSubmit={(e) => {
        e.preventDefault()
        const parsed = parseDeadline({ title, dueAt: new Date(due).getTime(), projectId: projectId || null, notes, remind, target })
        if (!parsed.ok) {
          setError(parsed.error)
          return
        }
        setError(null)
        const saved = editing ? lifeStore.updateDeadline(editing.id, parsed.value) : lifeStore.addDeadline(parsed.value)
        void saved.then(() => {
          setTitle('')
          setNotes('')
          setDue(defaultDue())
          onDone()
        })
      }}
    >
      <h3 className="font-medium">{editing ? 'Deadline bewerken' : 'Nieuwe deadline'}</h3>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="Wat moet af? Bv. Verslag labo 3" aria-label="Titel" className={field} />
      <div className="grid gap-2 sm:grid-cols-3">
        <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Tegen" className={field} />
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Project" className={field}>
          <option value="">Geen project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select value={target} onChange={(e) => setTarget(e.target.value as ReminderTarget)} aria-label="Meldingen" className={field}>
          {Object.entries(TARGET_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <RemindChoice value={remind} onChange={setRemind} />
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} rows={2} placeholder="Notities (optioneel)" aria-label="Notities" className={field} />
      {error && (
        <p role="alert" className="text-red-500">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={!title.trim()}>
          {editing ? 'Opslaan' : 'Toevoegen'}
        </button>
        {editing && (
          <button type="button" className={button} onClick={onDone}>
            Annuleren
          </button>
        )}
      </div>
    </form>
  )
}

function Appointments() {
  const items = useLife()
  const [editing, setEditing] = useState<Appointment | null>(null)
  const now = Date.now()
  const all = appointmentsOf(items)
  const coming = all.filter((a) => a.endAt >= now)
  const past = all.filter((a) => a.endAt < now).reverse()
  return (
    <>
      <AppointmentForm key={editing?.id ?? 'new'} editing={editing} onDone={() => setEditing(null)} />
      {coming.length === 0 ? (
        <p className="text-nx-muted">Geen afspraken gepland.</p>
      ) : (
        <ul className="space-y-2" aria-label="Komende afspraken">
          {coming.map((a) => (
            <AppointmentRow key={a.id} appointment={a} onEdit={() => setEditing(a)} />
          ))}
        </ul>
      )}
      {past.length > 0 && (
        <details>
          <summary className="cursor-pointer text-nx-muted">Voorbij ({past.length})</summary>
          <ul className="mt-2 space-y-2">
            {past.map((a) => (
              <AppointmentRow key={a.id} appointment={a} onEdit={() => setEditing(a)} />
            ))}
          </ul>
        </details>
      )}
    </>
  )
}

function AppointmentRow({ appointment: a, onEdit }: { appointment: Appointment; onEdit: () => void }) {
  const sameDay = new Date(a.startAt).toDateString() === new Date(a.endAt).toDateString()
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-nx-border bg-nx-surface-2 p-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{a.title}</p>
        <p className="text-xs text-nx-muted">
          {when(a.startAt)}–{sameDay ? clock(a.endAt) : when(a.endAt)}
          {a.location ? ` · ${a.location}` : ''}
          {a.remind.length > 0 ? ` · ${TARGET_LABELS[a.target]}` : ''}
        </p>
        {a.notes && <p className="mt-1 whitespace-pre-wrap text-nx-muted">{a.notes}</p>}
      </div>
      <button type="button" className={button} onClick={onEdit}>
        Bewerken
      </button>
      <button type="button" className={`${button} text-red-500`} onClick={() => window.confirm(`"${a.title}" verwijderen?`) && void lifeStore.remove(a.id)}>
        Verwijderen
      </button>
    </li>
  )
}

/** Tomorrow at 10:00, one hour long. */
function defaultStart(now = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  return localInput(d.getTime())
}

function AppointmentForm({ editing, onDone }: { editing: Appointment | null; onDone: () => void }) {
  const [title, setTitle] = useState(editing?.title ?? '')
  const [start, setStart] = useState(editing ? localInput(editing.startAt) : defaultStart)
  const [end, setEnd] = useState(editing ? localInput(editing.endAt) : () => localInput(new Date(defaultStart()).getTime() + 60 * 60_000))
  const [location, setLocation] = useState(editing?.location ?? '')
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const [remind, setRemind] = useState<number[]>(editing?.remind ?? DEFAULT_APPOINTMENT_REMIND)
  const [target, setTarget] = useState<ReminderTarget>(editing?.target ?? 'phone')
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="space-y-2 rounded-lg border border-nx-border p-3"
      aria-label={editing ? 'Afspraak bewerken' : 'Nieuwe afspraak'}
      onSubmit={(e) => {
        e.preventDefault()
        const parsed = parseAppointment({ title, startAt: new Date(start).getTime(), endAt: new Date(end).getTime(), location, notes, remind, target })
        if (!parsed.ok) {
          setError(parsed.error)
          return
        }
        setError(null)
        const saved = editing ? lifeStore.updateAppointment(editing.id, parsed.value) : lifeStore.addAppointment(parsed.value)
        void saved.then(() => {
          setTitle('')
          setLocation('')
          setNotes('')
          onDone()
        })
      }}
    >
      <h3 className="font-medium">{editing ? 'Afspraak bewerken' : 'Nieuwe afspraak'}</h3>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="Bv. Tandarts of Groepswerk" aria-label="Titel" className={field} />
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-nx-muted">Van</span>
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => {
              // Moving the start keeps the length of the appointment.
              const length = new Date(end).getTime() - new Date(start).getTime()
              setStart(e.target.value)
              const next = new Date(e.target.value).getTime()
              if (Number.isFinite(next) && Number.isFinite(length)) setEnd(localInput(next + Math.max(length, 0)))
            }}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-nx-muted">Tot</span>
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className={field} />
        </label>
        <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} placeholder="Plaats (optioneel)" aria-label="Plaats" className={field} />
        <select value={target} onChange={(e) => setTarget(e.target.value as ReminderTarget)} aria-label="Meldingen" className={field}>
          {Object.entries(TARGET_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <RemindChoice value={remind} onChange={setRemind} />
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} rows={2} placeholder="Notities (optioneel)" aria-label="Notities" className={field} />
      {error && (
        <p role="alert" className="text-red-500">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={!title.trim()}>
          {editing ? 'Opslaan' : 'Toevoegen'}
        </button>
        {editing && (
          <button type="button" className={button} onClick={onDone}>
            Annuleren
          </button>
        )}
      </div>
    </form>
  )
}

function RemindChoice({ value, onChange }: { value: number[]; onChange: (next: number[]) => void }) {
  return (
    <fieldset className="flex flex-wrap gap-x-3 gap-y-1">
      <legend className="mb-1 text-nx-muted">Herinner me</legend>
      {REMIND_OPTIONS.map((o) => (
        <label key={o.minutes} className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={value.includes(o.minutes)}
            onChange={(e) => onChange(e.target.checked ? [...value, o.minutes] : value.filter((m) => m !== o.minutes))}
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  )
}

function Projects() {
  const items = useLife()
  const projects = projectsOf(items)
  const [name, setName] = useState('')
  const [color, setColor] = useState<AccentId | ''>('blue')
  const active = projects.filter((p) => !p.archived)
  const archived = projects.filter((p) => p.archived)
  return (
    <>
      <form
        className="flex flex-wrap gap-2 rounded-lg border border-nx-border p-3"
        aria-label="Nieuw project"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          void lifeStore.addProject(name, color || null).then(() => setName(''))
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} placeholder="Nieuw project of vak, bv. Elektronica" aria-label="Naam" className={`${field} flex-1`} />
        <select value={color} onChange={(e) => setColor(e.target.value as AccentId | '')} aria-label="Kleur" className={`${field} w-32`}>
          <option value="">Geen kleur</option>
          {ACCENT_IDS.map((id) => (
            <option key={id} value={id}>
              {ACCENTS[id].label}
            </option>
          ))}
        </select>
        <button type="submit" className={primaryButton} disabled={!name.trim()}>
          Toevoegen
        </button>
      </form>
      {active.length === 0 ? (
        <p className="text-nx-muted">Nog geen projecten. Een project groepeert deadlines, bv. per vak of per opdracht.</p>
      ) : (
        <ul className="space-y-2" aria-label="Projecten">
          {active.map((p) => (
            <ProjectRow key={p.id} project={p} items={items} />
          ))}
        </ul>
      )}
      {archived.length > 0 && (
        <details>
          <summary className="cursor-pointer text-nx-muted">Gearchiveerd ({archived.length})</summary>
          <ul className="mt-2 space-y-2">
            {archived.map((p) => (
              <ProjectRow key={p.id} project={p} items={items} />
            ))}
          </ul>
        </details>
      )}
    </>
  )
}

function ProjectRow({ project: p, items }: { project: Project; items: LifeItem[] }) {
  const { done, total, next } = projectProgress(p, items)
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <li className="space-y-2 rounded-lg border border-nx-border bg-nx-surface-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <ProjectDot project={p} />
        <span className="min-w-0 flex-1 font-medium">{p.name}</span>
        <span className="text-xs text-nx-muted tabular-nums">
          {done}/{total} klaar
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-nx-border" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${p.name} voortgang`}>
        <div className="h-full bg-nx-accent" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-nx-muted">{next ? `Volgende: ${next.title} · ${when(next.dueAt)}` : total > 0 ? 'Alles klaar.' : 'Nog geen deadlines.'}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} onClick={() => void lifeStore.updateProject(p.id, { archived: !p.archived })}>
          {p.archived ? 'Terugzetten' : 'Archiveren'}
        </button>
        <button
          type="button"
          className={`${button} text-red-500`}
          onClick={() => window.confirm(`Project "${p.name}" verwijderen? De deadlines blijven, zonder project.`) && void lifeStore.remove(p.id)}
        >
          Verwijderen
        </button>
      </div>
    </li>
  )
}

const WEEKDAY_SHORT = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']

/** Dagstart: every morning one notification with the day ahead. */
function Dagstart() {
  const { state } = useProfiles()
  const { engine } = useConnect()
  const items = useLife()
  const reminders = useSyncExternalStore(remindersStore.subscribe, remindersStore.getSnapshot)
  const [status, setStatus] = useState<string | null>(null)
  const settings = state.dagstart
  const change = (patch: Partial<DagstartSettings>) => profilesStore.update((s) => ({ ...s, dagstart: { ...s.dagstart, ...patch } }))
  const now = Date.now()
  const today = startOfDay(now)
  // The next morning it comes: today when the time is still ahead, else tomorrow.
  const nextDay = new Date(today).setHours(Number(settings.time.slice(0, 2)), Number(settings.time.slice(3, 5))) > now ? today : startOfDay(today + DAY + 3_600_000)
  const preview = dagstartNotice({ calendarEvents: state.calendarEvents, timetable: state.lessons, items, reminders }, nextDay, settings)

  const test = async () => {
    setStatus('Versturen…')
    try {
      await sendDagstartTest(defaultDeadlineEffects(engine))
      setStatus(settings.target === 'phone' ? 'Verstuurd naar dit apparaat en je gsm.' : 'Getoond op dit apparaat.')
    } catch (err) {
      setStatus(`Niet gelukt: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Dagstart</h2>
        <p className="text-nx-muted">Elke ochtend één melding met je lessen, afspraken, deadlines en herinneringen van die dag, en de deadlines die eraan komen. Ook als NEXUS dicht is, zolang het de dagen ervoor ergens open stond.</p>
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={settings.enabled} onChange={(e) => change({ enabled: e.target.checked })} />
        Dagstart aan
      </label>
      <fieldset disabled={!settings.enabled} className="space-y-3 disabled:opacity-60">
        <label className="flex items-center gap-2">
          <span className="w-20 shrink-0">Om</span>
          <input type="time" aria-label="Tijdstip" value={settings.time} onChange={(e) => e.target.value && change({ time: e.target.value })} className={`${field} w-32`} />
        </label>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Dagen">
          <span className="w-20 shrink-0">Op</span>
          {WEEKDAY_SHORT.map((label, i) => {
            const day = i + 1
            const on = settings.days.includes(day)
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                onClick={() => change({ days: on ? settings.days.filter((d) => d !== day) : [...settings.days, day].sort() })}
                className={`size-9 rounded-full border border-nx-border text-xs ${on ? 'bg-nx-accent font-medium text-nx-accent-text' : 'hover:bg-nx-surface-2'}`}
              >
                {label}
              </button>
            )
          })}
        </div>
        <label className="flex items-center gap-2">
          <span className="w-20 shrink-0">Naar</span>
          <select aria-label="Naar" value={settings.target} onChange={(e) => change({ target: e.target.value as DagstartSettings['target'] })} className={`${field} w-auto`}>
            <option value="phone">Gsm en horloge (en dit apparaat)</option>
            <option value="this_device">Alleen het apparaat waar NEXUS openstaat</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={settings.skipEmpty} onChange={(e) => change({ skipEmpty: e.target.checked })} />
          Geen melding op een dag zonder iets gepland
        </label>
      </fieldset>
      <section aria-label="Voorbeeld" className="space-y-1 rounded-lg border border-nx-border p-3">
        <h3 className="text-xs font-semibold text-nx-muted">{nextDay === today ? 'Vandaag' : 'Morgen'} om {settings.time}</h3>
        <p className="font-medium">{preview.title}</p>
        {preview.text ? <p className="whitespace-pre-line text-nx-muted">{preview.text}</p> : <p className="text-nx-muted">{settings.skipEmpty ? 'Niets gepland: die dag komt er geen melding.' : 'Niets gepland.'}</p>}
      </section>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={button} onClick={() => void test()}>
          Stuur nu een proef
        </button>
        {status && <span className="text-nx-muted">{status}</span>}
      </div>
    </div>
  )
}
