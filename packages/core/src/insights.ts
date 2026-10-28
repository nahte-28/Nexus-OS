/**
 * Inzichten: how the last weeks went, week by week, from what the other apps already keep: focus
 * time (Studie), habits (Gewoontes), deadlines (Agenda), flashcards (Leerkaarten) and marks (Cijfers).
 */
import { cardsOf, type FlashcardsState } from './flashcards'
import { gradesOverview, type GradesState } from './grades'
import { activeHabits, isDone, isDue, type HabitsState } from './habits'
import { deadlinesOf, type LifeItem } from './life'
import { mondayOf } from './review'

const DAY = 24 * 60 * 60_000

export interface InsightsInput {
  now: number
  focus: Array<{ at: number; minutes: number }>
  habits: HabitsState
  items: LifeItem[]
  flashcards: FlashcardsState
  grades: GradesState
}

export interface WeekInsight {
  /** Local midnight of the Monday. */
  monday: number
  focusMinutes: number
  /** Habit days done and due (up to today for the current week). */
  habitsDone: number
  habitsDue: number
  /** Deadlines due this week (up to now) and how many of those were done on time. */
  deadlinesDue: number
  deadlinesOnTime: number
}

export interface Insights {
  weeks: WeekInsight[]
  cards: { total: number; learned: number; due: number }
  average: number | null
  /** The habit done most often on its due days in the shown weeks (at least 3 due days). */
  bestHabit: { name: string; rate: number } | null
}

function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
const shiftDay = (dayStart: number, n: number) => startOfDay(dayStart + n * DAY + 3_600_000)

/** The last [count] weeks, oldest first; the current week is the last one. */
export function insights(input: InsightsInput, count = 8): Insights {
  const thisMonday = mondayOf(input.now)
  const today = startOfDay(input.now)
  const habits = activeHabits(input.habits)
  const deadlines = deadlinesOf(input.items)
  const weeks: WeekInsight[] = []
  const habitTotals = new Map<string, { done: number; due: number }>()

  for (let w = count - 1; w >= 0; w--) {
    const monday = shiftDay(thisMonday, -7 * w)
    const next = shiftDay(monday, 7)
    const inWeek = (t: number) => t >= monday && t < next
    let habitsDone = 0
    let habitsDue = 0
    for (let day = monday; day < next && day <= today; day = shiftDay(day, 1)) {
      for (const h of habits) {
        if (day < startOfDay(h.createdAt) || !isDue(h, day)) continue
        const done = isDone(h, day)
        habitsDue++
        if (done) habitsDone++
        const total = habitTotals.get(h.id) ?? { done: 0, due: 0 }
        habitTotals.set(h.id, { done: total.done + (done ? 1 : 0), due: total.due + 1 })
      }
    }
    const due = deadlines.filter((d) => inWeek(d.dueAt) && d.dueAt <= input.now)
    weeks.push({
      monday,
      focusMinutes: input.focus.filter((f) => inWeek(f.at)).reduce((n, f) => n + f.minutes, 0),
      habitsDone,
      habitsDue,
      deadlinesDue: due.length,
      deadlinesOnTime: due.filter((d) => d.doneAt !== null && d.doneAt <= d.dueAt).length,
    })
  }

  const cards = cardsOf(input.flashcards)
  let bestHabit: Insights['bestHabit'] = null
  for (const h of habits) {
    const t = habitTotals.get(h.id)
    if (!t || t.due < 3) continue
    const rate = t.done / t.due
    if (!bestHabit || rate > bestHabit.rate) bestHabit = { name: h.name, rate }
  }
  return {
    weeks,
    cards: { total: cards.length, learned: cards.filter((c) => c.interval >= 21).length, due: cards.filter((c) => c.due <= input.now).length },
    average: gradesOverview(input.grades).average,
    bestHabit,
  }
}

/** A share as a whole percentage, or null when there was nothing to count. */
export const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null)

/** "+25 min" / "-1 u 10 min" / "gelijk", for this week against the last one. */
export function focusChange(minutes: number, before: number): string {
  const diff = minutes - before
  if (diff === 0) return 'gelijk'
  const abs = Math.abs(diff)
  const text = abs >= 60 ? `${Math.floor(abs / 60)} u${abs % 60 ? ` ${abs % 60} min` : ''}` : `${abs} min`
  return `${diff > 0 ? '+' : '-'}${text}`
}
