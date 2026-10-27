/**
 * Weekoverzicht: on Sunday evening NEXUS AI looks back on the week and plans the next one. This file
 * gathers the facts it gets: plain text, built on the device, without note contents or files.
 */
import type { CalendarEvent } from './calendar'
import { activeCourses, courseResult, formatMark, type GradesState } from './grades'
import { activeHabits, completion, type HabitsState } from './habits'
import { agendaDay, appointmentsOf, deadlinesOf, type AgendaEntry, type LifeItem } from './life'
import type { Lesson } from './profiles'
import type { Reminder } from './reminders'
import { STUDY_BLOCK_NOTE } from './study'

const DAY = 24 * 60 * 60_000

export interface WeekInput {
  now: number
  items: LifeItem[]
  calendarEvents: CalendarEvent[]
  timetable: Lesson[]
  reminders: Reminder[]
  habits: HabitsState
  grades: GradesState
  /** Focus sessions of the Studie timer on this device. */
  focus: Array<{ at: number; minutes: number }>
}

function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
const shiftDay = (dayStart: number, n: number) => startOfDay(dayStart + n * DAY + 3_600_000)

/** Local midnight of the Monday of the week of [t]. */
export function mondayOf(t: number): number {
  const day = startOfDay(t)
  return shiftDay(day, -((new Date(day).getDay() + 6) % 7))
}

/** ISO week number of [t] (1–53). */
export function isoWeek(t: number): number {
  const d = new Date(t)
  const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const firstThursday = new Date(thursday.getFullYear(), 0, 4)
  return 1 + Math.round(((thursday.getTime() - firstThursday.getTime()) / DAY - 3 + ((firstThursday.getDay() + 6) % 7)) / 7)
}

/**
 * The week a review made at [now] is about: on Sunday that same week, on Monday morning (a
 * catch-up when NEXUS was closed on Sunday) the week before.
 */
export const reviewedWeek = (now: number) => mondayOf(now - 12 * 60 * 60_000)

export const reviewKey = (monday: number) => {
  const d = new Date(monday)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const reviewNoteTitle = (monday: number) => `Weekoverzicht week ${isoWeek(monday)}`

/** Sunday from 19:00 until Monday noon is the moment for an automatic review. */
export function reviewMoment(now: number): boolean {
  const d = new Date(now)
  return (d.getDay() === 0 && d.getHours() >= 19) || (d.getDay() === 1 && d.getHours() < 12)
}

const dayName = (t: number) => new Intl.DateTimeFormat('nl-BE', { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(t))
const clock = (t: number) => new Intl.DateTimeFormat('nl-BE', { hour: '2-digit', minute: '2-digit' }).format(new Date(t))
const short = (t: number) => new Intl.DateTimeFormat('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(t))
const list = (items: string[], empty: string, max = 12) => (items.length === 0 ? [`- ${empty}`] : [...items.slice(0, max).map((i) => `- ${i}`), ...(items.length > max ? [`- en nog ${items.length - max}`] : [])])
const hours = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)} u ${minutes % 60} min` : `${minutes} min`)

/** The facts of the reviewed week and the next one, as text for NEXUS AI (and to show the student). */
export function weekFacts(input: WeekInput): string {
  const monday = reviewedWeek(input.now)
  const nextMonday = shiftDay(monday, 7)
  const afterNext = shiftDay(monday, 14)
  const inWeek = (t: number) => t >= monday && t < nextMonday
  const inNext = (t: number) => t >= nextMonday && t < afterNext
  const agenda = { calendarEvents: input.calendarEvents, timetable: input.timetable, items: input.items, reminders: input.reminders }
  const deadlines = deadlinesOf(input.items)
  const appointments = appointmentsOf(input.items)
  const isStudyBlock = (notes: string) => notes.includes(STUDY_BLOCK_NOTE)

  const lessonsPast = Array.from({ length: 7 }, (_, i) => agendaDay(agenda, shiftDay(monday, i)).filter((e) => e.kind === 'lesson').length).reduce((a, b) => a + b, 0)
  const done = deadlines.filter((d) => d.doneAt !== null && inWeek(d.doneAt)).map((d) => `${d.title}${d.doneAt! > d.dueAt ? ' (te laat)' : ''}`)
  const missed = deadlines.filter((d) => d.doneAt === null && inWeek(d.dueAt) && d.dueAt < input.now).map((d) => `${d.title} (was tegen ${short(d.dueAt)})`)
  const pastAppointments = appointments.filter((a) => inWeek(a.startAt) && !isStudyBlock(a.notes)).map((a) => a.title)
  const blocksPast = appointments.filter((a) => inWeek(a.startAt) && isStudyBlock(a.notes)).length
  const focus = input.focus.filter((f) => inWeek(f.at)).reduce((n, f) => n + f.minutes, 0)
  const habits = activeHabits(input.habits).map((h) => {
    const c = completion(h, shiftDay(monday, 6), 7)
    return `${h.name}: ${c.done} van ${c.due} keer`
  })
  const marks = activeCourses(input.grades).flatMap((c) => {
    const r = courseResult(c)
    if (r.score === null) return []
    const rest = r.needed !== null ? `, nog ${formatMark(r.needed)} nodig op de rest voor ${formatMark(c.target)}` : r.status === 'passed' ? ', geslaagd' : r.status === 'failed' ? ', niet geslaagd' : ''
    return [`${c.name}: ${formatMark(r.score)} (${r.graded}% binnen${rest})`]
  })

  const nextDays = Array.from({ length: 7 }, (_, i) => {
    const day = shiftDay(nextMonday, i)
    const entries = agendaDay(agenda, day)
    const lessons = entries.filter((e): e is Extract<AgendaEntry, { kind: 'lesson' }> => e.kind === 'lesson')
    const busy = lessons.length > 0 ? `${lessons.length} ${lessons.length === 1 ? 'les' : 'lessen'} (${clock(lessons[0].at)}–${clock(Math.max(...lessons.map((l) => l.end)))})` : 'geen lessen'
    return `${dayName(day)}: ${busy}`
  })
  const nextDeadlines = deadlines.filter((d) => d.doneAt === null && (inNext(d.dueAt) || (d.dueAt >= input.now && d.dueAt < nextMonday))).sort((a, b) => a.dueAt - b.dueAt).map((d) => `${d.title}, tegen ${short(d.dueAt)}`)
  const later = deadlines.filter((d) => d.doneAt === null && d.dueAt >= afterNext && d.dueAt < shiftDay(afterNext, 14)).map((d) => `${d.title}, tegen ${short(d.dueAt)}`)
  const nextAppointments = appointments.filter((a) => inNext(a.startAt) && !isStudyBlock(a.notes)).sort((a, b) => a.startAt - b.startAt).map((a) => `${a.title}, ${short(a.startAt)}${a.location ? ` in ${a.location}` : ''}`)
  const blocksNext = appointments.filter((a) => inNext(a.startAt) && isStudyBlock(a.notes)).length

  return [
    `Afgelopen week (${dayName(monday)} tot ${dayName(shiftDay(monday, 6))}):`,
    `- Lessen: ${lessonsPast}`,
    `- Focustijd met de Studie-timer: ${hours(focus)}`,
    `- Geplande studieblokken: ${blocksPast}`,
    'Deadlines afgewerkt:',
    ...list(done, 'geen'),
    'Deadlines voorbij en nog open:',
    ...list(missed, 'geen'),
    'Afspraken:',
    ...list(pastAppointments, 'geen'),
    'Gewoontes:',
    ...list(habits, 'geen gewoontes ingesteld'),
    'Cijfers tot nu toe:',
    ...list(marks, 'nog geen cijfers ingevuld'),
    '',
    `Volgende week (${dayName(nextMonday)} tot ${dayName(shiftDay(nextMonday, 6))}):`,
    ...nextDays.map((d) => `- ${d}`),
    'Open deadlines tot het einde van volgende week:',
    ...list(nextDeadlines, 'geen'),
    'Deadlines in de twee weken daarna:',
    ...list(later, 'geen'),
    'Afspraken:',
    ...list(nextAppointments, 'geen'),
    `- Al geplande studieblokken: ${blocksNext}`,
  ].join('\n')
}
