/**
 * NEXUS Life: deadlines and projects, next to the lessons and reminders NEXUS already has. Stored
 * locally first and synced like notes (last write wins, deletions as tombstones). Pure logic.
 */
import type { CalendarEvent } from './calendar'
import { ACCENT_IDS, type AccentId, type Lesson } from './profiles'
import type { Reminder, ReminderTarget } from './reminders'
import { SAFETY_HORIZON_MS, type PlannedNotice } from './safetyNet'
import type { SyncRecord } from './sync'

export interface Project extends SyncRecord {
  kind: 'project'
  name: string
  color: AccentId | null
  archived: boolean
}

export interface Deadline extends SyncRecord {
  kind: 'deadline'
  title: string
  /** When it is due, epoch ms. */
  dueAt: number
  projectId: string | null
  notes: string
  doneAt: number | null
  /** Minutes before [dueAt] to send a notification; 0 is at the moment itself. */
  remind: number[]
  /** this_device: notifications where NEXUS runs. phone: also on the phone and watch. */
  target: ReminderTarget
}

export type LifeItem = Project | Deadline

export const REMIND_OPTIONS: Array<{ minutes: number; label: string }> = [
  { minutes: 7 * 24 * 60, label: '1 week ervoor' },
  { minutes: 2 * 24 * 60, label: '2 dagen ervoor' },
  { minutes: 24 * 60, label: '1 dag ervoor' },
  { minutes: 3 * 60, label: '3 uur ervoor' },
  { minutes: 60, label: '1 uur ervoor' },
  { minutes: 0, label: 'Op het moment zelf' },
]
const REMIND_MINUTES = REMIND_OPTIONS.map((o) => o.minutes)
export const DEFAULT_REMIND = [24 * 60, 60]

const MAX_TITLE = 160
const MAX_NOTES = 4000

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

/** Validates one stored or synced item; anything malformed is dropped rather than shown. */
export function toLifeItem(value: unknown): LifeItem | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (typeof v.id !== 'string' || typeof v.updatedAt !== 'number') return null
  const base = { id: v.id, updatedAt: v.updatedAt, deletedAt: typeof v.deletedAt === 'number' ? v.deletedAt : null }
  if (v.kind === 'project') {
    return {
      ...base,
      kind: 'project',
      name: str(v.name, MAX_TITLE),
      color: ACCENT_IDS.includes(v.color as AccentId) ? (v.color as AccentId) : null,
      archived: v.archived === true,
    }
  }
  if (v.kind === 'deadline') {
    if (typeof v.dueAt !== 'number' || !Number.isFinite(v.dueAt)) return null
    const remind = Array.isArray(v.remind) ? [...new Set(v.remind.filter((m): m is number => REMIND_MINUTES.includes(m as number)))] : []
    return {
      ...base,
      kind: 'deadline',
      title: str(v.title, MAX_TITLE),
      dueAt: v.dueAt,
      projectId: typeof v.projectId === 'string' ? v.projectId : null,
      notes: str(v.notes, MAX_NOTES),
      doneAt: typeof v.doneAt === 'number' ? v.doneAt : null,
      remind: remind.sort((a, b) => b - a),
      target: v.target === 'this_device' ? 'this_device' : 'phone',
    }
  }
  return null
}

export type DeadlineDraft = Pick<Deadline, 'title' | 'dueAt' | 'projectId' | 'notes' | 'remind' | 'target'>

/** Validates a deadline from a form or from the AI. */
export function parseDeadline(input: unknown): { ok: true; value: DeadlineDraft } | { ok: false; error: string } {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'Ongeldige deadline.' }
  const { title, dueAt, projectId = null, notes = '', remind = DEFAULT_REMIND, target = 'phone' } = input as Record<string, unknown>
  if (typeof title !== 'string' || !title.trim()) return { ok: false, error: 'Een deadline heeft een titel nodig.' }
  const due = typeof dueAt === 'number' ? dueAt : typeof dueAt === 'string' ? Date.parse(dueAt) : NaN
  if (!Number.isFinite(due)) return { ok: false, error: 'Onbekend tijdstip. Gebruik bv. 2026-11-03T23:59:00+01:00.' }
  if (projectId !== null && typeof projectId !== 'string') return { ok: false, error: 'Onbekend project.' }
  if (typeof notes !== 'string') return { ok: false, error: 'De notities moeten tekst zijn.' }
  if (!Array.isArray(remind) || remind.some((m) => !REMIND_MINUTES.includes(m as number))) {
    return { ok: false, error: `Herinneren kan ${REMIND_MINUTES.join(', ')} minuten ervoor.` }
  }
  if (target !== 'phone' && target !== 'this_device') return { ok: false, error: 'Doel moet phone of this_device zijn.' }
  return {
    ok: true,
    value: {
      title: title.trim().slice(0, MAX_TITLE),
      dueAt: due,
      projectId: projectId as string | null,
      notes: notes.trim().slice(0, MAX_NOTES),
      remind: [...new Set(remind as number[])].sort((a, b) => b - a),
      target,
    },
  }
}

const live = <T extends LifeItem>(items: LifeItem[], kind: T['kind']) =>
  items.filter((i): i is T => i.kind === kind && i.deletedAt === null)

export function deadlinesOf(items: LifeItem[]): Deadline[] {
  return live<Deadline>(items, 'deadline').sort((a, b) => a.dueAt - b.dueAt || a.title.localeCompare(b.title))
}

export function projectsOf(items: LifeItem[]): Project[] {
  return live<Project>(items, 'project').sort((a, b) => a.name.localeCompare(b.name, 'nl'))
}

/** Open deadlines, soonest first; overdue ones stay until they are marked done. */
export function openDeadlines(items: LifeItem[]): Deadline[] {
  return deadlinesOf(items).filter((d) => d.doneAt === null)
}

export function projectProgress(project: Project, items: LifeItem[]): { done: number; total: number; next: Deadline | null } {
  const mine = deadlinesOf(items).filter((d) => d.projectId === project.id)
  return { done: mine.filter((d) => d.doneAt !== null).length, total: mine.length, next: mine.find((d) => d.doneAt === null) ?? null }
}

export const deadlineRef = (d: Pick<Deadline, 'id' | 'dueAt'>, minutes: number) => `deadline:${d.id}@${d.dueAt}-${minutes}`

/** How the time left reads in a notification, e.g. "over 1 dag" or "nu". */
function leftText(minutes: number): string {
  if (minutes === 0) return 'nu'
  if (minutes % (24 * 60) === 0) {
    const days = minutes / (24 * 60)
    return days === 7 ? 'over 1 week' : `over ${days} ${days === 1 ? 'dag' : 'dagen'}`
  }
  const hours = Math.round(minutes / 60)
  return `over ${hours} uur`
}

/** The notifications of open deadlines between [from] (exclusive) and [to] (inclusive). */
export function deadlineNotices(items: LifeItem[], from: number, to: number, projects = projectsOf(items)): Array<PlannedNotice & { target: ReminderTarget }> {
  const names = new Map(projects.map((p) => [p.id, p.name]))
  const out: Array<PlannedNotice & { target: ReminderTarget }> = []
  for (const d of openDeadlines(items)) {
    for (const minutes of d.remind) {
      const at = d.dueAt - minutes * 60_000
      if (at <= from || at > to) continue
      const when = new Intl.DateTimeFormat('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(d.dueAt))
      const project = d.projectId ? names.get(d.projectId) : undefined
      out.push({
        ref: deadlineRef(d, minutes),
        at,
        title: minutes === 0 ? `Deadline nu: ${d.title}` : `Deadline ${leftText(minutes)}: ${d.title}`,
        text: [project, `Tegen ${when}`].filter(Boolean).join(' · '),
        target: d.target,
      })
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

/** The deadline notifications the phone should know about ahead (safety net and web push). */
export function plannedDeadlineNotices(items: LifeItem[], now: number, horizon = SAFETY_HORIZON_MS): PlannedNotice[] {
  return deadlineNotices(items, now, now + horizon)
    .filter((n) => n.target === 'phone')
    .map(({ target: _target, ...n }) => n)
}

export type AgendaEntry =
  | { kind: 'lesson'; at: number; end: number; title: string; detail?: string }
  | { kind: 'deadline'; at: number; title: string; detail?: string; deadline: Deadline }
  | { kind: 'reminder'; at: number; title: string; detail?: string }

/** UTC ms of HH:MM on the local day of [dayStart]. */
function atTime(dayStart: number, time: string): number {
  const [h, m] = time.split(':').map(Number)
  const d = new Date(dayStart)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

export interface AgendaInput {
  /** Lessons from the school calendar; when there are any, they replace the typed-in timetable. */
  calendarEvents: CalendarEvent[]
  timetable: Lesson[]
  items: LifeItem[]
  reminders: Reminder[]
}

/** Everything on one local day (from [dayStart], a local midnight), in time order. */
export function agendaDay({ calendarEvents, timetable, items, reminders }: AgendaInput, dayStart: number): AgendaEntry[] {
  const end = new Date(dayStart)
  end.setDate(end.getDate() + 1)
  const dayEnd = end.getTime()
  const inDay = (t: number) => t >= dayStart && t < dayEnd
  const entries: AgendaEntry[] = []
  if (calendarEvents.length > 0) {
    for (const e of calendarEvents) if (inDay(e.start)) entries.push({ kind: 'lesson', at: e.start, end: e.end, title: e.subject, ...(e.room ? { detail: e.room } : {}) })
  } else {
    const weekday = ((new Date(dayStart).getDay() + 6) % 7) + 1
    for (const l of timetable) {
      if (l.day === weekday) entries.push({ kind: 'lesson', at: atTime(dayStart, l.start), end: atTime(dayStart, l.end), title: l.subject, ...(l.room ? { detail: l.room } : {}) })
    }
  }
  const names = new Map(projectsOf(items).map((p) => [p.id, p.name]))
  for (const d of deadlinesOf(items)) {
    if (inDay(d.dueAt)) {
      const project = d.projectId ? names.get(d.projectId) : undefined
      entries.push({ kind: 'deadline', at: d.dueAt, title: d.title, ...(project ? { detail: project } : {}), deadline: d })
    }
  }
  for (const r of reminders) if (inDay(r.at)) entries.push({ kind: 'reminder', at: r.at, title: r.title, ...(r.text ? { detail: r.text } : {}) })
  return entries.sort((a, b) => a.at - b.at)
}
