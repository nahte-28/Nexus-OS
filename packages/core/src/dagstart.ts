/**
 * Dagstart: every morning one notification with the day ahead: lessons, appointments, deadlines and
 * reminders, plus open deadlines of the next days. Built ahead of time, so it also reaches the phone
 * through the safety net and web push when NEXUS is closed.
 */
import { agendaDay, openDeadlines, type AgendaInput } from './life'
import type { DagstartSettings } from './profiles'
import { SAFETY_HORIZON_MS, type PlannedNotice } from './safetyNet'

const DAY = 24 * 60 * 60_000
/** Lines in the body before "en n meer"; a watch shows only a few anyway. */
const MAX_LINES = 8
/** How many days after today count as "binnenkort". */
const SOON_DAYS = 3

const pad = (n: number) => String(n).padStart(2, '0')

function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** The local midnight [n] days after [dayStart]; +1 hour keeps it right across a time change. */
const addDays = (dayStart: number, n: number) => startOfDay(dayStart + n * DAY + 3_600_000)

function atTime(dayStart: number, time: string): number {
  const d = new Date(dayStart)
  d.setHours(Number(time.slice(0, 2)), Number(time.slice(3, 5)), 0, 0)
  return d.getTime()
}

/** One ref per day, so every device and the phone show the same Dagstart only once. */
export function dagstartRef(dayStart: number): string {
  const d = new Date(dayStart)
  return `dagstart:${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const clock = (t: number) => new Intl.DateTimeFormat('nl-BE', { hour: '2-digit', minute: '2-digit' }).format(new Date(t))
const shortDay = (t: number) => new Intl.DateTimeFormat('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(t))
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The Dagstart of the local day [dayStart], at the time in [settings]; without text when nothing is planned. */
export function dagstartNotice(input: AgendaInput, dayStart: number, settings: Pick<DagstartSettings, 'time'>): PlannedNotice {
  const at = atTime(dayStart, settings.time)
  const entries = agendaDay(input, dayStart)
  const lines = entries.map((e) => {
    const time = clock(e.at)
    const label = e.kind === 'deadline' ? `Deadline: ${e.title}` : e.kind === 'appointment' || e.kind === 'event' ? `Afspraak: ${e.title}` : e.kind === 'reminder' ? `Herinnering: ${e.title}` : e.title
    return `${time} ${label}${e.detail && e.kind !== 'reminder' ? ` · ${e.detail}` : ''}`
  })
  const shown = lines.length > MAX_LINES ? [...lines.slice(0, MAX_LINES - 1), `en nog ${lines.length - MAX_LINES + 1}`] : lines
  const tomorrow = addDays(dayStart, 1)
  const soonEnd = addDays(dayStart, 1 + SOON_DAYS)
  const soon = openDeadlines(input.items)
    .filter((d) => d.dueAt >= tomorrow && d.dueAt < soonEnd)
    .slice(0, 3)
    .map((d) => `${d.title} (${shortDay(d.dueAt)})`)
  if (soon.length > 0) shown.push(`Binnenkort: ${soon.join(', ')}`)

  const lessons = entries.filter((e) => e.kind === 'lesson').length
  const deadlines = entries.filter((e) => e.kind === 'deadline').length
  const appointments = entries.filter((e) => e.kind === 'appointment' || e.kind === 'event').length
  const parts = [lessons && count(lessons, 'les', 'lessen'), appointments && count(appointments, 'afspraak', 'afspraken'), deadlines && count(deadlines, 'deadline', 'deadlines')].filter(Boolean)
  const summary = parts.length > 0 ? parts.join(', ') : entries.length > 0 ? count(entries.length, 'herinnering', 'herinneringen') : 'niets gepland'
  return {
    ref: dagstartRef(dayStart),
    at,
    title: `Dagstart ${shortDay(dayStart)}: ${summary}`,
    ...(shown.length > 0 ? { text: shown.join('\n') } : {}),
  }
}

const isEmpty = (n: PlannedNotice) => n.text === undefined

/** The Dagstarts with a moment in (from, to]: the days and settings decide which ones. */
export function dagstartNotices(input: AgendaInput, settings: DagstartSettings, from: number, to: number): PlannedNotice[] {
  if (!settings.enabled || settings.days.length === 0) return []
  const out: PlannedNotice[] = []
  for (let day = startOfDay(from); day <= to; day = addDays(day, 1)) {
    const weekday = ((new Date(day).getDay() + 6) % 7) + 1
    if (!settings.days.includes(weekday)) continue
    const at = atTime(day, settings.time)
    if (at <= from || at > to) continue
    const notice = dagstartNotice(input, day, settings)
    if (settings.skipEmpty && isEmpty(notice)) continue
    out.push(notice)
  }
  return out
}

/** The Dagstarts the phone should know ahead (safety net and web push). */
export function plannedDagstart(input: AgendaInput, settings: DagstartSettings, now: number, horizon = SAFETY_HORIZON_MS): PlannedNotice[] {
  return settings.target === 'phone' ? dagstartNotices(input, settings, now, now + horizon) : []
}
