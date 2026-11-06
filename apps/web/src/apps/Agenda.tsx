import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import {
  ACCENT_IDS,
  agendaDay,
  birthdayLabel,
  birthdaysOn,
  dagstartNotice,
  appointmentsOf,
  DEFAULT_APPOINTMENT_REMIND,
  DEFAULT_REMIND,
  deadlinesOf,
  nextOccurrence,
  occurrences,
  overlapsOf,
  REPEAT_FREQ_LABELS,
  REPEAT_FREQS,
  repeatLabel,
  wallDate,
  type AppointmentRepeat,
  type RepeatFreq,
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
  reviewedWeek,
  reviewNoteTitle,
  weekFacts,
  linkedEvents,
  calendarSources,
  CALENDAR_COLORS,
  CALENDAR_COLOR_LABELS,
  CALENDAR_LEADS,
  type CalendarColor,
  type CalendarLook,
  type CalendarSource,
  dayBlocks,
  gridHours,
  weekDays,
  weekStart,
} from '@nexus/core'
import { useConnect } from '../connect/ConnectContext'
import { defaultDeadlineEffects } from '../life/alerts'
import { sendDagstartTest } from '../life/dagstart'
import { dagstartExtra } from '../briefing/store'
import { useContacts } from '../contacts/store'
import { useFeature } from '../features/store'
import { lifeSyncProblem } from '../life/sync'
import { lifeStore } from '../life/store'
import { Related } from '../integration/Related'
import { onReveal, takeReveal } from '../search/reveal'
import { profilesStore, useProfiles } from '../profiles/store'
import { remindersStore } from '../reminders/store'
import { autoReview, makeReview, setAutoReview, weekInput } from '../review/week'
import { ACCENTS } from '../theme/accents'

const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'
const TABS = ['Overzicht', 'Deadlines', 'Afspraken', 'Projecten', 'Dagstart', 'Week'] as const
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
type Tab = (typeof TABS)[number]

/** The item a deep link (a notification, the Inbox, search) asked to show; its row is highlighted. */
const FocusContext = createContext<string | null>(null)
const focusRing = (on: boolean) => (on ? ' ring-2 ring-nx-accent' : '')

/** The tab that shows [id], or null when it is not an Agenda item. */
function tabOf(id: string | null): Tab | null {
  const item = id ? lifeStore.getSnapshot().find((i) => i.id === id && i.deletedAt === null) : undefined
  if (!item) return null
  return item.kind === 'deadline' ? 'Deadlines' : item.kind === 'appointment' ? 'Afspraken' : 'Projecten'
}

export function Agenda() {
  const [focus, setFocus] = useState<string | null>(() => takeReveal('agenda'))
  const [tab, setTab] = useState<Tab>(() => tabOf(focus) ?? 'Overzicht')
  useEffect(
    () =>
      onReveal(() => {
        const id = takeReveal('agenda')
        const next = tabOf(id)
        if (!id || !next) return
        setFocus(id)
        setTab(next)
      }),
    [],
  )
  useEffect(() => {
    if (focus) document.getElementById(`agenda-${focus}`)?.scrollIntoView?.({ block: 'center' })
  }, [focus, tab])
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
        <FocusContext.Provider value={focus}>
          {tab === 'Overzicht' && <Overview onAdd={setTab} />}
          {tab === 'Deadlines' && <Deadlines />}
          {tab === 'Afspraken' && <Appointments />}
          {tab === 'Projecten' && <Projects />}
          {tab === 'Dagstart' && <Dagstart />}
          {tab === 'Week' && <WeekReview />}
        </FocusContext.Provider>
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
  const input = { calendarEvents: state.calendarEvents, googleEvents: linkedEvents(state), timetable: state.lessons, items, reminders }
  const sources = calendarSources(state)
  const look = new Map(sources.map((s) => [s.id, s]))
  const shown = (e: AgendaEntry) => !('source' in e && e.source && look.get(e.source)?.hidden)
  const birthdays = useBirthdays()
  const [view, setView] = useState<AgendaView>(readView)
  const chooseView = (v: AgendaView) => {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      // Private window: the choice lasts until the tab closes.
    }
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 flex-1 text-lg font-semibold">Je week</h2>
        <div role="group" aria-label="Weergave" className="flex rounded-md border border-nx-border text-sm">
          {(['lijst', 'rooster'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} className={`px-2 py-1 ${view === v ? 'bg-nx-surface-2 font-medium' : ''}`} onClick={() => chooseView(v)}>
              {v === 'lijst' ? 'Lijst' : 'Rooster'}
            </button>
          ))}
        </div>
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
      {sources.length > 1 && <CalendarLegend sources={sources} lead={state.calendarLead} />}
      {view === 'rooster' && <WeekGrid input={input} shown={shown} look={look} projects={projects} now={now} birthdays={birthdays} />}
      {view === 'lijst' && days.map((day) => {
        const entries = agendaDay(input, day).filter(shown)
        const clashes = overlapsOf(entries.filter((e): e is Extract<AgendaEntry, { end: number }> => 'end' in e))
        return (
          <section key={day} aria-label={dayTitle(day, today)} className="space-y-1">
            <h3 className="font-medium">{dayTitle(day, today)}</h3>
            {birthdays(day).map((b) => <p key={b} className="text-sm">🎂 {b}</p>)}
            {entries.length === 0 ? (
              birthdays(day).length > 0 ? null :
              <p className="text-nx-muted">Niets gepland.</p>
            ) : (
              <ul className="space-y-1">
                {entries.map((e, i) => (
                  <Entry
                    key={i}
                    entry={e}
                    project={e.kind === 'deadline' ? projects.get(e.deadline.projectId ?? '') : undefined}
                    clashes={'end' in e ? clashes.get(e) : undefined}
                    color={'source' in e && e.source ? look.get(e.source)?.color : undefined}
                  />
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

/** Who is jarig on a day, from Contacten (empty while that module is off). */
function useBirthdays(): (day: number) => string[] {
  const contacts = useContacts()
  const on = useFeature('contacts')
  return (day) => (on ? birthdaysOn(contacts, day).map(birthdayLabel) : [])
}

type AgendaView = 'lijst' | 'rooster'
const VIEW_KEY = 'nexus.agenda.view'
function readView(): AgendaView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'rooster' ? 'rooster' : 'lijst'
  } catch {
    return 'lijst'
  }
}

/** Block colour: the calendar's own colour, else by kind (appointment, deadline, reminder). */
function blockClass(e: AgendaEntry, look: Map<string, CalendarSource>): string {
  const color = 'source' in e && e.source ? look.get(e.source)?.color : undefined
  if (color) return `${EDGE[color]} bg-nx-surface-2`
  if (e.kind === 'deadline') return 'border-l-red-500 bg-red-500/10'
  if (e.kind === 'reminder') return 'border-l-amber-500 bg-amber-500/10'
  return 'border-l-nx-accent bg-nx-surface-2'
}

const HOUR_PX = 48

/** Week as a timetable: a column per day, every agenda in its own colour. */
function WeekGrid({ input, shown, look, projects, now, birthdays }: {
  birthdays: (day: number) => string[]
  input: Parameters<typeof agendaDay>[0]
  shown: (e: AgendaEntry) => boolean
  look: Map<string, CalendarSource>
  projects: Map<string, Project>
  now: number
}) {
  const [monday, setMonday] = useState(() => weekStart(now))
  const [picked, setPicked] = useState<{ day: number; i: number } | null>(null)
  const days = weekDays(monday)
  const entries = days.map((d) => agendaDay(input, d).filter(shown))
  const { from, to } = gridHours(entries, days)
  const hours = Array.from({ length: to - from }, (_, i) => from + i)
  const height = (to - from) * HOUR_PX
  const today = startOfDay(now)
  const move = (weeks: number) => {
    const d = new Date(monday)
    d.setDate(d.getDate() + weeks * 7)
    setMonday(d.getTime())
    setPicked(null)
  }
  const pickedEntry = picked ? entries[days.indexOf(picked.day)]?.[picked.i] : undefined
  const sunday = new Date(days[6]).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })
  const first = new Date(monday).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })
  return (
    <section aria-label="Weekrooster" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={button} aria-label="Vorige week" onClick={() => move(-1)}>‹</button>
        <span className="font-medium">{first} – {sunday}</span>
        <button type="button" className={button} aria-label="Volgende week" onClick={() => move(1)}>›</button>
        {monday !== weekStart(now) && (
          <button type="button" className="text-sm text-nx-muted underline" onClick={() => { setMonday(weekStart(now)); setPicked(null) }}>
            Deze week
          </button>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-nx-border">
        <div className="grid min-w-[40rem]" style={{ gridTemplateColumns: '2.5rem repeat(7, minmax(0, 1fr))' }}>
          <div />
          {days.map((d) => (
            <div key={d} className={`border-b border-l border-nx-border px-1 py-1 text-center text-xs ${d === today ? 'font-semibold text-nx-accent' : 'text-nx-muted'}`}>
              {new Date(d).toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric' })}
              {birthdays(d).map((b) => <span key={b} className="block truncate text-[10px] font-normal text-nx-text" title={b}>🎂 {b}</span>)}
            </div>
          ))}
          <div className="relative" style={{ height }}>
            {hours.map((h, i) => (
              <span key={h} className="absolute right-1 -translate-y-1/2 text-[10px] text-nx-muted tabular-nums" style={{ top: i * HOUR_PX }}>
                {i === 0 ? '' : `${h}:00`}
              </span>
            ))}
          </div>
          {days.map((d, di) => (
            <div key={d} className={`relative border-l border-nx-border ${d === today ? 'bg-nx-accent/5' : ''}`} style={{ height }}>
              {hours.map((h, i) => i > 0 && <div key={h} aria-hidden className="absolute inset-x-0 border-t border-nx-border/60" style={{ top: i * HOUR_PX }} />)}
              {dayBlocks(entries[di], d, from, to).map((b) => {
                const i = entries[di].indexOf(b.entry)
                const on = picked?.day === d && picked.i === i
                const time = 'end' in b.entry ? `${clock(b.entry.at)}–${clock(b.entry.end)}` : clock(b.entry.at)
                return (
                  <button
                    key={i}
                    type="button"
                    title={`${time} ${b.entry.title}`}
                    aria-label={`${time} ${b.entry.title}`}
                    aria-pressed={on}
                    onClick={() => setPicked(on ? null : { day: d, i })}
                    className={`absolute overflow-hidden rounded border-l-4 px-1 text-left text-[11px] leading-tight ${blockClass(b.entry, look)} ${on ? 'ring-2 ring-nx-accent' : ''}`}
                    style={{ top: `${b.top * 100}%`, height: `${b.height * 100}%`, left: `${(b.lane / b.lanes) * 100}%`, width: `${100 / b.lanes}%` }}
                  >
                    <span className="block truncate font-medium">{b.entry.title}</span>
                    {b.height * height > 30 && <span className="block truncate text-nx-muted">{time}</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      {pickedEntry && (
        <ul aria-label="Gekozen afspraak">
          <Entry
            entry={pickedEntry}
            project={pickedEntry.kind === 'deadline' ? projects.get(pickedEntry.deadline.projectId ?? '') : undefined}
            color={'source' in pickedEntry && pickedEntry.source ? look.get(pickedEntry.source)?.color : undefined}
          />
        </ul>
      )}
      <p className="text-xs text-nx-muted">Tik op een blok voor de details.</p>
    </section>
  )
}

const DOT: Record<CalendarColor, string> = {
  blue: 'bg-sky-500',
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  purple: 'bg-violet-500',
  teal: 'bg-teal-500',
  pink: 'bg-pink-500',
  gray: 'bg-slate-400',
}
const EDGE: Record<CalendarColor, string> = {
  blue: 'border-l-sky-500',
  green: 'border-l-emerald-500',
  amber: 'border-l-amber-500',
  red: 'border-l-red-500',
  purple: 'border-l-violet-500',
  teal: 'border-l-teal-500',
  pink: 'border-l-pink-500',
  gray: 'border-l-slate-400',
}

function setLook(id: string, patch: Partial<CalendarLook>, current: CalendarSource): void {
  profilesStore.update((s) => ({ ...s, calendarLook: { ...s.calendarLook, [id]: { color: current.color, hidden: current.hidden, notify: current.notify, ...patch } } }))
}

/** Which calendars show in the overview, each with its colour; the colour can be changed here too. */
function CalendarLegend({ sources, lead }: { sources: CalendarSource[]; lead: number }) {
  return (
    <section aria-label="Agenda's" className="space-y-1">
      <ul className="flex flex-wrap gap-2">
        {sources.map((s) => (
          <li key={s.id}>
            <label className={`flex items-center gap-1.5 rounded-full border border-nx-border px-2 py-0.5 ${s.hidden ? 'opacity-60' : ''}`}>
              <input type="checkbox" checked={!s.hidden} onChange={(e) => setLook(s.id, { hidden: !e.target.checked }, s)} />
              <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full ${DOT[s.color]}`} />
              {s.name}
            </label>
          </li>
        ))}
      </ul>
      <details>
        <summary className="cursor-pointer text-xs text-nx-muted">Kleuren en meldingen</summary>
        <ul className="mt-1 space-y-1">
          {sources.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3">
              <span className="min-w-28">{s.name}</span>
              <select aria-label={`Kleur van ${s.name}`} className="rounded-md border border-nx-border bg-nx-surface px-1 py-0.5" value={s.color} onChange={(e) => setLook(s.id, { color: e.target.value as CalendarColor }, s)}>
                {CALENDAR_COLORS.map((c) => (
                  <option key={c} value={c}>
                    {CALENDAR_COLOR_LABELS[c]}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1">
                <input type="checkbox" aria-label={`Melding vooraf voor ${s.name}`} checked={s.notify} onChange={(e) => setLook(s.id, { notify: e.target.checked }, s)} />
                Melding op gsm en horloge
              </label>
            </li>
          ))}
        </ul>
        <label className="mt-2 flex items-center gap-2">
          Melding
          <select aria-label="Hoe lang vooraf" className="rounded-md border border-nx-border bg-nx-surface px-1 py-0.5" value={lead} onChange={(e) => profilesStore.update((st) => ({ ...st, calendarLead: Number(e.target.value) }))}>
            {CALENDAR_LEADS.map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} min` : `${m / 60} uur`}
              </option>
            ))}
          </select>
          vooraf. De volgende afspraken staan ook op de tegel van je horloge.
        </label>
      </details>
    </section>
  )
}

function Entry({ entry, project, clashes, color }: { entry: AgendaEntry; project?: Project; clashes?: string[]; color?: CalendarColor }) {
  if (entry.kind === 'deadline') return <DeadlineLine deadline={entry.deadline} project={project} showTime />
  const series = entry.kind === 'appointment' && entry.appointment.repeat ? entry.appointment : null
  return (
    <li className={`flex flex-wrap items-baseline gap-x-2 rounded-md bg-nx-surface-2 px-2 py-1.5 ${color ? `border-l-4 ${EDGE[color]}` : ''}`}>
      <span className="w-24 shrink-0 text-nx-muted tabular-nums">
        {clock(entry.at)}
        {entry.kind === 'lesson' || entry.kind === 'appointment' || entry.kind === 'event' ? `–${clock(entry.end)}` : ''}
      </span>
      <span className="min-w-0 flex-1">
        {entry.kind === 'reminder' ? '⏰ ' : entry.kind === 'appointment' ? '📅 ' : entry.kind === 'event' ? '🗓️ ' : ''}
        {entry.title}
        {series && <span className="text-nx-muted" title={repeatLabel(series.repeat!, series.startAt)}> 🔁</span>}
        {entry.detail && <span className="text-nx-muted"> · {entry.detail}</span>}
        {clashes && clashes.length > 0 && <span className="block text-xs text-amber-600 dark:text-amber-400">Overlapt met {clashes.join(', ')}</span>}
      </span>
      {series && entry.kind === 'appointment' && (
        <button type="button" className="text-xs text-nx-muted underline" onClick={() => void skipOnce(series, entry.occurrence.date)}>
          Deze keer overslaan
        </button>
      )}
    </li>
  )
}

/** Leaves one date out of a series; the rest of the series stays. */
function skipOnce(a: Appointment, date: string): Promise<void> {
  if (!a.repeat) return Promise.resolve()
  return lifeStore.updateAppointment(a.id, { repeat: { ...a.repeat, except: [...a.repeat.except, date] } })
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
  const focused = useContext(FocusContext) === d.id
  return (
    <li id={`agenda-${d.id}`} className={`flex flex-wrap items-center gap-2 rounded-lg border border-nx-border bg-nx-surface-2 p-3${focusRing(focused)}`}>
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
        <Related itemId={d.id} />
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
  const next = new Map(all.map((a) => [a.id, nextOccurrence(a, now)]))
  const coming = all.filter((a) => next.get(a.id)).sort((a, b) => next.get(a.id)!.startAt - next.get(b.id)!.startAt)
  const past = all.filter((a) => !next.get(a.id)).reverse()
  return (
    <>
      <AppointmentForm key={editing?.id ?? 'new'} editing={editing} onDone={() => setEditing(null)} />
      {coming.length === 0 ? (
        <p className="text-nx-muted">Geen afspraken gepland.</p>
      ) : (
        <ul className="space-y-2" aria-label="Komende afspraken">
          {coming.map((a) => (
            <AppointmentRow key={a.id} appointment={a} next={next.get(a.id) ?? undefined} onEdit={() => setEditing(a)} />
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

function AppointmentRow({ appointment: a, next, onEdit }: { appointment: Appointment; next?: { startAt: number; endAt: number; date: string }; onEdit: () => void }) {
  const start = next?.startAt ?? a.startAt
  const end = next?.endAt ?? a.endAt
  const sameDay = new Date(start).toDateString() === new Date(end).toDateString()
  const focused = useContext(FocusContext) === a.id
  return (
    <li id={`agenda-${a.id}`} className={`flex flex-wrap items-center gap-2 rounded-lg border border-nx-border bg-nx-surface-2 p-3${focusRing(focused)}`}>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{a.title}</p>
        <p className="text-xs text-nx-muted">
          {a.repeat && next ? 'Volgende: ' : ''}
          {when(start)}–{sameDay ? clock(end) : when(end)}
          {a.location ? ` · ${a.location}` : ''}
          {a.remind.length > 0 ? ` · ${TARGET_LABELS[a.target]}` : ''}
        </p>
        {a.repeat && (
          <p className="text-xs text-nx-muted">
            🔁 {repeatLabel(a.repeat, a.startAt)}
            {a.repeat.except.length > 0 && (
              <>
                {` · ${a.repeat.except.length} keer overgeslagen `}
                <button type="button" className="underline" onClick={() => void lifeStore.updateAppointment(a.id, { repeat: { ...a.repeat!, except: [] } })}>
                  terugzetten
                </button>
              </>
            )}
          </p>
        )}
        {a.notes && <p className="mt-1 whitespace-pre-wrap text-nx-muted">{a.notes}</p>}
        <Related itemId={a.id} />
      </div>
      {a.repeat && next && (
        <button type="button" className={button} onClick={() => void skipOnce(a, next.date)}>
          Volgende overslaan
        </button>
      )}
      <button type="button" className={button} onClick={onEdit}>
        Bewerken
      </button>
      <button
        type="button"
        className={`${button} text-red-500`}
        onClick={() => window.confirm(a.repeat ? `De hele reeks "${a.title}" verwijderen?` : `"${a.title}" verwijderen?`) && void lifeStore.remove(a.id)}
      >
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
  const [repeat, setRepeat] = useState<AppointmentRepeat | null>(editing?.repeat ?? null)
  const [error, setError] = useState<string | null>(null)
  const clashes = useClashes(editing?.id ?? null, new Date(start).getTime(), new Date(end).getTime(), repeat)
  return (
    <form
      className="space-y-2 rounded-lg border border-nx-border p-3"
      aria-label={editing ? 'Afspraak bewerken' : 'Nieuwe afspraak'}
      onSubmit={(e) => {
        e.preventDefault()
        const parsed = parseAppointment({ title, startAt: new Date(start).getTime(), endAt: new Date(end).getTime(), location, notes, remind, target, repeat })
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
          setRepeat(null)
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
      <RepeatChoice value={repeat} onChange={setRepeat} startAt={new Date(start).getTime()} />
      <RemindChoice value={remind} onChange={setRemind} />
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} rows={2} placeholder="Notities (optioneel)" aria-label="Notities" className={field} />
      {clashes.length > 0 && (
        <p role="status" className="text-amber-600 dark:text-amber-400">
          Overlapt met {clashes.slice(0, 3).join('; ')}
          {clashes.length > 3 ? ` en nog ${clashes.length - 3} keer` : ''}. Je kan het toch opslaan.
        </p>
      )}
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

const CLASH_WEEKS = 8

/** What the appointment being edited would overlap in the coming weeks (lessons, appointments, events). */
function useClashes(id: string | null, startAt: number, endAt: number, repeat: AppointmentRepeat | null): string[] {
  const items = useLife()
  const { state } = useProfiles()
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) return []
  const now = Date.now()
  const others = items.filter((i) => i.id !== id)
  const input = { calendarEvents: state.calendarEvents, googleEvents: linkedEvents(state), timetable: state.lessons, items: others, reminders: [] }
  const out: string[] = []
  for (const o of occurrences({ startAt, endAt, repeat }, now, now + CLASH_WEEKS * 7 * DAY, 20)) {
    const day = startOfDay(o.startAt)
    for (const e of agendaDay(input, day)) {
      if ('end' in e && e.at < o.endAt && e.end > o.startAt) out.push(`${e.title} (${when(Math.max(e.at, o.startAt))})`)
    }
  }
  return [...new Set(out)]
}

function RepeatChoice({ value, onChange, startAt }: { value: AppointmentRepeat | null; onChange: (next: AppointmentRepeat | null) => void; startAt: number }) {
  const weekday = Number.isFinite(startAt) ? ((new Date(startAt).getDay() + 6) % 7) + 1 : 1
  const set = (patch: Partial<AppointmentRepeat>) => value && onChange({ ...value, ...patch })
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-nx-muted">Herhalen</legend>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Herhalen"
          className={`${field} w-40`}
          value={value?.freq ?? ''}
          onChange={(e) => {
            const freq = e.target.value as RepeatFreq | ''
            if (!freq) onChange(null)
            else onChange({ freq, interval: value?.interval ?? 1, days: freq === 'weekly' ? (value?.days.length ? value.days : [weekday]) : [], until: value?.until ?? null, except: value?.except ?? [] })
          }}
        >
          <option value="">Niet herhalen</option>
          {REPEAT_FREQS.map((f) => (
            <option key={f} value={f}>
              {REPEAT_FREQ_LABELS[f]}
            </option>
          ))}
        </select>
        {value && (
          <>
            <label className="flex items-center gap-1">
              om de
              <input
                type="number"
                min={1}
                max={52}
                aria-label="Om de hoeveel"
                className={`${field} w-16`}
                value={value.interval}
                onChange={(e) => set({ interval: Math.min(Math.max(Math.round(Number(e.target.value)) || 1, 1), 52) })}
              />
            </label>
            <label className="flex items-center gap-1">
              tot
              <input type="date" aria-label="Herhalen tot" className={`${field} w-40`} value={value.until ?? ''} onChange={(e) => set({ until: e.target.value || null })} />
            </label>
          </>
        )}
      </div>
      {value?.freq === 'weekly' && (
        <div className="flex flex-wrap gap-x-3 gap-y-1" role="group" aria-label="Op deze dagen">
          {WEEKDAY_SHORT.map((name, i) => (
            <label key={name} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={value.days.includes(i + 1)}
                onChange={(e) => {
                  const days = e.target.checked ? [...value.days, i + 1].sort() : value.days.filter((d) => d !== i + 1)
                  set({ days: days.length ? days : [weekday] })
                }}
              />
              {name}
            </label>
          ))}
        </div>
      )}
      {value && Number.isFinite(startAt) && <p className="text-xs text-nx-muted">{repeatLabel(value, startAt)}{value.until && value.until < wallDate(startAt) ? ' (stopt voor het begin)' : ''}</p>}
    </fieldset>
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
  const focused = useContext(FocusContext) === p.id
  return (
    <li id={`agenda-${p.id}`} className={`space-y-2 rounded-lg border border-nx-border bg-nx-surface-2 p-3${focusRing(focused)}`}>
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
      <Related itemId={p.id} />
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
export function Dagstart() {
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
  const preview = dagstartNotice({ calendarEvents: state.calendarEvents, googleEvents: linkedEvents(state), timetable: state.lessons, items, reminders }, nextDay, settings, dagstartExtra())

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

/** Weekoverzicht: NEXUS AI looks back on the week and plans the next one, saved in Notities. */
function WeekReview() {
  const [auto, setAuto] = useState(autoReview)
  const [wish, setWish] = useState('')
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  // Read once when the tab opens: the facts are a preview, not a live view.
  const [facts] = useState(() => weekFacts(weekInput()))
  const title = reviewNoteTitle(reviewedWeek(Date.now()))

  const start = () => {
    setError(null)
    setText('')
    setState('busy')
    makeReview(wish, setText)
      .then(() => setState('done'))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setState('idle')
      })
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Weekoverzicht</h2>
        <p className="text-nx-muted">
          NEXUS AI kijkt terug op je week (lessen, deadlines, focustijd, gewoontes en cijfers) en maakt een plan voor volgende week. Het overzicht komt in Notities. De AI krijgt alleen de feiten hieronder, geen notities of bestanden.
        </p>
      </div>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => {
            setAutoReview(e.target.checked)
            setAuto(e.target.checked)
          }}
        />
        Elke zondag vanaf 19:00 vanzelf maken, met een melding op je gsm
      </label>
      <details className="rounded-lg border border-nx-border p-3">
        <summary className="cursor-pointer font-medium">Wat NEXUS AI krijgt</summary>
        <pre className="mt-2 whitespace-pre-wrap font-sans text-nx-muted">{facts}</pre>
      </details>
      <input value={wish} onChange={(e) => setWish(e.target.value)} maxLength={500} placeholder="Wens (optioneel), bv. woensdag heb ik geen tijd" aria-label="Wens" className={field} disabled={state === 'busy'} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={primaryButton} disabled={state === 'busy'} onClick={start}>
          {state === 'busy' ? 'Bezig…' : state === 'done' ? 'Opnieuw maken' : 'Weekoverzicht maken'}
        </button>
        {state === 'done' && <span className="text-nx-muted">Bewaard in Notities als "{title}".</span>}
      </div>
      {error && (
        <p role="alert" className="text-red-500">
          {error}
        </p>
      )}
      {text && (
        <article aria-label="Weekoverzicht" className="whitespace-pre-wrap rounded-lg border border-nx-border bg-nx-surface-2 p-3">
          {text}
        </article>
      )}
    </div>
  )
}
