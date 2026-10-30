/**
 * Dagbriefing (Dagstart 2.0): the day ahead in one view, with what comes first, the free blocks
 * between lessons and appointments, and a history of every Dagstart that went out. Everything is
 * worked out from the agenda, habits and exams on the device, without AI, so the same day always
 * gives the same briefing. The history is one document per account (user_settings key 'briefing').
 * Pure logic.
 */
import type { ExamsState } from './exams'
import { activeHabits, isDone, isDue, type HabitsState } from './habits'
import { agendaDay, openDeadlines, type AgendaEntry, type AgendaInput } from './life'
import { wallDate } from './recurrence'

const DAY = 24 * 60 * 60_000

export interface BriefingInput extends AgendaInput {
  habits?: HabitsState
  exams?: ExamsState
  /** How many captures wait in Snel vastleggen › Te sorteren. */
  unsortedCaptures?: number
}

export type PriorityKind = 'overdue' | 'today' | 'exam' | 'soon' | 'habit' | 'capture'
export const PRIORITY_LABELS: Record<PriorityKind, string> = {
  overdue: 'Te laat',
  today: 'Vandaag',
  exam: 'Examen',
  soon: 'Binnenkort',
  habit: 'Gewoonte',
  capture: 'Te sorteren',
}
const RANK: Record<PriorityKind, number> = { overdue: 0, today: 1, exam: 2, soon: 3, habit: 4, capture: 5 }

export interface BriefingPriority {
  /** Stable per thing: deadline:<id>, exam:<id>, habit:<id> or captures. */
  id: string
  kind: PriorityKind
  title: string
  detail: string
  at: number | null
  deadlineId?: string
  habitId?: string
}

export interface FreeBlock {
  start: number
  end: number
  minutes: number
}

export interface Briefing {
  /** Local date, YYYY-MM-DD. */
  date: string
  dayStart: number
  schedule: AgendaEntry[]
  priorities: BriefingPriority[]
  free: FreeBlock[]
  counts: { lessons: number; appointments: number; deadlines: number; reminders: number }
  /** One line: "2 lessen, 1 afspraak · 1 te laat · 3 u vrij". */
  headline: string
}

/** Free time is counted between these hours. */
export const FREE_FROM = '08:00'
export const FREE_TO = '20:00'
/** Shorter gaps are not worth planning in. */
export const MIN_FREE_MINUTES = 60
const MAX_PRIORITIES = 10
/** Deadlines this many days after the day count as "binnenkort". */
const SOON_DAYS = 3
/** Exams this many days ahead are a priority. */
const EXAM_DAYS = 7

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

const clock = (t: number) => new Intl.DateTimeFormat('nl-BE', { hour: '2-digit', minute: '2-digit' }).format(new Date(t))
const shortDay = (t: number) => new Intl.DateTimeFormat('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(t))
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "1 u 30 min", "45 min", "3 u". */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h === 0 ? `${m} min` : m === 0 ? `${h} u` : `${h} u ${m} min`
}

/** Gaps of at least [MIN_FREE_MINUTES] between [from] and [to] that nothing with an end time fills. */
export function freeBlocks(schedule: AgendaEntry[], from: number, to: number): FreeBlock[] {
  const busy = schedule
    .flatMap((e) => ('end' in e && e.end > e.at ? [[Math.max(e.at, from), Math.min(e.end, to)] as const] : []))
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0])
  const out: FreeBlock[] = []
  let cursor = from
  const gap = (end: number) => {
    const minutes = Math.floor((end - cursor) / 60_000)
    if (minutes >= MIN_FREE_MINUTES) out.push({ start: cursor, end, minutes })
  }
  for (const [s, e] of busy) {
    if (s > cursor) gap(s)
    cursor = Math.max(cursor, e)
  }
  if (to > cursor) gap(to)
  return out
}

/**
 * The briefing of the local day [dayStart]. [now] decides what is already late and, for today, from
 * when free time counts; for a later day, late means due before that day.
 */
export function buildBriefing(input: BriefingInput, dayStart: number, now: number): Briefing {
  const dayEnd = addDays(dayStart, 1)
  const reference = Math.min(Math.max(now, dayStart), dayEnd)
  const schedule = agendaDay(input, dayStart)
  const priorities: BriefingPriority[] = []

  for (const d of openDeadlines(input.items)) {
    const base = { id: `deadline:${d.id}`, title: d.title, at: d.dueAt, deadlineId: d.id }
    if (d.dueAt < reference) priorities.push({ ...base, kind: 'overdue', detail: `was ${shortDay(d.dueAt)} om ${clock(d.dueAt)}` })
    else if (d.dueAt < dayEnd) priorities.push({ ...base, kind: 'today', detail: `om ${clock(d.dueAt)}` })
    else if (d.dueAt < addDays(dayStart, 1 + SOON_DAYS)) priorities.push({ ...base, kind: 'soon', detail: shortDay(d.dueAt) })
  }
  for (const e of input.exams?.exams ?? []) {
    if (e.deletedAt !== null || e.at < dayStart || e.at >= addDays(dayStart, EXAM_DAYS + 1)) continue
    const days = Math.round((startOfDay(e.at) - dayStart) / DAY)
    const when = days === 0 ? `vandaag om ${clock(e.at)}` : days === 1 ? `morgen om ${clock(e.at)}` : `over ${days} dagen (${shortDay(e.at)})`
    priorities.push({ id: `exam:${e.id}`, kind: 'exam', title: e.course, detail: when, at: e.at })
  }
  for (const h of input.habits ? activeHabits(input.habits) : []) {
    // The habit store reads days and ticks at noon, so a time change never shifts the date.
    const noon = dayStart + 12 * 3_600_000
    if (isDue(h, noon) && !isDone(h, noon)) priorities.push({ id: `habit:${h.id}`, kind: 'habit', title: h.name, detail: h.remindAt ? `om ${h.remindAt}` : 'nog niet gedaan', at: h.remindAt ? atTime(dayStart, h.remindAt) : null, habitId: h.id })
  }
  if ((input.unsortedCaptures ?? 0) > 0) {
    const n = input.unsortedCaptures ?? 0
    priorities.push({ id: 'captures', kind: 'capture', title: `${count(n, 'ding', 'dingen')} te sorteren`, detail: 'in Snel vastleggen', at: null })
  }
  priorities.sort((a, b) => RANK[a.kind] - RANK[b.kind] || (a.at ?? Infinity) - (b.at ?? Infinity) || a.title.localeCompare(b.title, 'nl'))

  const freeStart = Math.max(atTime(dayStart, FREE_FROM), Math.min(reference, dayEnd))
  const free = freeBlocks(schedule, freeStart, atTime(dayStart, FREE_TO))
  const counts = {
    lessons: schedule.filter((e) => e.kind === 'lesson').length,
    appointments: schedule.filter((e) => e.kind === 'appointment' || e.kind === 'event').length,
    deadlines: schedule.filter((e) => e.kind === 'deadline').length,
    reminders: schedule.filter((e) => e.kind === 'reminder').length,
  }
  const parts = [counts.lessons && count(counts.lessons, 'les', 'lessen'), counts.appointments && count(counts.appointments, 'afspraak', 'afspraken'), counts.deadlines && count(counts.deadlines, 'deadline', 'deadlines')].filter(Boolean)
  const overdue = priorities.filter((p) => p.kind === 'overdue').length
  const freeMinutes = free.reduce((sum, b) => sum + b.minutes, 0)
  const headline = [parts.length > 0 ? parts.join(', ') : 'niets gepland', overdue > 0 && `${overdue} te laat`, freeMinutes > 0 && `${durationLabel(freeMinutes)} vrij`].filter(Boolean).join(' · ')
  return { date: wallDate(dayStart), dayStart, schedule, priorities: priorities.slice(0, MAX_PRIORITIES), free, counts, headline }
}

/**
 * Lines the Dagstart notification adds from the briefing: what is late, exams close by, open habits
 * and the longest free block. The agenda and "Binnenkort" are already in the notification itself.
 */
export function briefingLines(b: Briefing): string[] {
  const lines: string[] = []
  const names = (kind: PriorityKind) => b.priorities.filter((p) => p.kind === kind).map((p) => p.title)
  const list = (items: string[]) => (items.length > 2 ? `${items.slice(0, 2).join(', ')} en nog ${items.length - 2}` : items.join(', '))
  if (names('overdue').length > 0) lines.push(`Te laat: ${list(names('overdue'))}`)
  const exams = b.priorities.filter((p) => p.kind === 'exam' && p.at !== null && p.at < addDays(b.dayStart, 3))
  if (exams.length > 0) lines.push(`Examen: ${list(exams.map((p) => `${p.title} ${p.detail}`))}`)
  if (names('habit').length > 0) lines.push(`Gewoontes: ${list(names('habit'))}`)
  const longest = [...b.free].sort((x, y) => y.minutes - x.minutes)[0]
  if (longest) lines.push(`Vrij: ${clock(longest.start)}–${clock(longest.end)} (${durationLabel(longest.minutes)})`)
  return lines
}

// History -------------------------------------------------------------------------------------------

/** 'local' is the device that showed it, 'phone' the phone and watch. */
export type BriefingChannel = 'local' | 'phone'
export const BRIEFING_CHANNEL_LABELS: Record<BriefingChannel, string> = { local: 'Dit apparaat', phone: 'Gsm en horloge' }

export interface BriefingLog {
  /** `<date>:<channel>` for the real one, so each day is logged once per channel on every device. */
  id: string
  date: string
  channel: BriefingChannel
  at: number
  title: string
  /** Sent with "Stuur nu". */
  test: boolean
}

export interface BriefingState {
  log: BriefingLog[]
  revision: number
}

export const MAX_BRIEFING_LOG = 120

export const emptyBriefing = (): BriefingState => ({ log: [], revision: 0 })

const DATE = /^\d{4}-\d{2}-\d{2}$/

export function parseBriefing(raw: unknown): BriefingState {
  if (typeof raw !== 'object' || raw === null) return emptyBriefing()
  const v = raw as Record<string, unknown>
  const log = (Array.isArray(v.log) ? v.log : []).flatMap((l): BriefingLog[] => {
    if (typeof l !== 'object' || l === null) return []
    const e = l as Record<string, unknown>
    if (typeof e.id !== 'string' || typeof e.date !== 'string' || !DATE.test(e.date) || typeof e.at !== 'number' || !Number.isFinite(e.at)) return []
    if (e.channel !== 'local' && e.channel !== 'phone') return []
    return [{ id: e.id, date: e.date, channel: e.channel, at: e.at, title: typeof e.title === 'string' ? e.title.slice(0, 200) : '', test: e.test === true }]
  })
  return { log: log.sort((a, b) => b.at - a.at).slice(0, MAX_BRIEFING_LOG), revision: typeof v.revision === 'number' && Number.isFinite(v.revision) ? v.revision : 0 }
}

/** Union by id; the earliest send of a day and channel stays. */
export function mergeBriefing(a: BriefingState, b: BriefingState): BriefingState {
  const byId = new Map(a.log.map((l) => [l.id, l]))
  for (const l of b.log) {
    const mine = byId.get(l.id)
    if (!mine || l.at < mine.at) byId.set(l.id, l)
  }
  return { log: [...byId.values()].sort((x, y) => y.at - x.at).slice(0, MAX_BRIEFING_LOG), revision: Math.max(a.revision, b.revision) }
}

export const briefingLogId = (date: string, channel: BriefingChannel, test = false, at = 0) => (test ? `proef-${at}:${channel}` : `${date}:${channel}`)

/** Remembers a send; a second real one for the same day and channel changes nothing. */
export function logBriefing(state: BriefingState, entry: Omit<BriefingLog, 'id'>): BriefingState {
  const id = briefingLogId(entry.date, entry.channel, entry.test, entry.at)
  if (state.log.some((l) => l.id === id)) return state
  return { ...state, log: [{ id, ...entry }, ...state.log].slice(0, MAX_BRIEFING_LOG) }
}

/** Whether the real Dagstart of [date] already went to [channel], from any device. */
export const briefingSent = (state: BriefingState, date: string, channel: BriefingChannel) => state.log.some((l) => l.id === briefingLogId(date, channel))
