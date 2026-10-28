/**
 * Gewoontes: small things you want to do on set days (study 30 minutes, sport, read), ticked off
 * per day, with a streak and an optional reminder when one is still open.
 */
import { isTime } from './profiles'
import { SAFETY_HORIZON_MS, type PlannedNotice } from './safetyNet'

export interface Habit {
  id: string
  name: string
  /** Days it is due: 1 = Monday ... 7 = Sunday. */
  days: number[]
  /** HH:MM local; a reminder then when it is not done yet. */
  remindAt: string | null
  target: 'phone' | 'this_device'
  /** Local dates (YYYY-MM-DD) it was done. */
  done: string[]
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface HabitsState {
  habits: Habit[]
  revision: number
}

const DAY = 24 * 60 * 60_000
/** Enough for a year of streaks; older ticks are dropped. */
const MAX_DONE = 400
export const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7]

export const emptyHabits = (): HabitsState => ({ habits: [], revision: 0 })

const pad = (n: number) => String(n).padStart(2, '0')
/** The local date of [t] as YYYY-MM-DD. */
export function dateKey(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const weekday = (t: number) => ((new Date(t).getDay() + 6) % 7) + 1
function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
/** The local midnight [n] days from [dayStart]; +1 hour keeps it right across a time change. */
const shiftDay = (dayStart: number, n: number) => startOfDay(dayStart + n * DAY + 3_600_000)

const DATE = /^\d{4}-\d{2}-\d{2}$/

export function parseHabit(raw: unknown): Habit | null {
  if (typeof raw !== 'object' || raw === null) return null
  const h = raw as Partial<Habit>
  if (typeof h.id !== 'string' || typeof h.name !== 'string' || typeof h.updatedAt !== 'number') return null
  const days = Array.isArray(h.days) ? [...new Set(h.days.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort() : ALL_DAYS
  return {
    id: h.id,
    name: h.name.slice(0, 80),
    days: days.length > 0 ? days : ALL_DAYS,
    remindAt: isTime(h.remindAt) ? h.remindAt : null,
    target: h.target === 'this_device' ? 'this_device' : 'phone',
    done: Array.isArray(h.done) ? [...new Set(h.done.filter((d) => typeof d === 'string' && DATE.test(d)))].sort().slice(-MAX_DONE) : [],
    createdAt: typeof h.createdAt === 'number' ? h.createdAt : h.updatedAt,
    updatedAt: h.updatedAt,
    deletedAt: typeof h.deletedAt === 'number' ? h.deletedAt : null,
  }
}

export function parseHabitsState(raw: unknown): HabitsState {
  if (typeof raw !== 'object' || raw === null) return emptyHabits()
  const r = raw as Partial<HabitsState>
  return {
    habits: Array.isArray(r.habits) ? r.habits.map(parseHabit).filter((h): h is Habit => h !== null).slice(0, 50) : [],
    revision: typeof r.revision === 'number' ? r.revision : 0,
  }
}

/** Two copies habit by habit: the newer change of each habit wins, deletions included. */
export function mergeHabits(a: HabitsState, b: HabitsState): HabitsState {
  const byId = new Map(a.habits.map((h) => [h.id, h]))
  for (const h of b.habits) {
    const mine = byId.get(h.id)
    if (!mine || h.updatedAt > mine.updatedAt) byId.set(h.id, h)
  }
  return { habits: [...byId.values()], revision: Math.max(a.revision, b.revision) }
}

export const activeHabits = (s: HabitsState) => s.habits.filter((h) => h.deletedAt === null)

export const isDue = (habit: Habit, t: number) => habit.days.includes(weekday(t))
export const isDone = (habit: Habit, t: number) => habit.done.includes(dateKey(t))

/** Ticks [habit] off for the day of [t], or takes the tick back. */
export function toggleDone(habit: Habit, t: number, now = Date.now()): Habit {
  const key = dateKey(t)
  const done = habit.done.includes(key) ? habit.done.filter((d) => d !== key) : [...habit.done, key].sort().slice(-MAX_DONE)
  return { ...habit, done, updatedAt: now }
}

/** Ticks [habit] off for the day [date] (YYYY-MM-DD); already ticked stays ticked. */
export function markDone(habit: Habit, date: string, now = Date.now()): Habit {
  if (habit.done.includes(date) || !DATE.test(date)) return habit
  return { ...habit, done: [...habit.done, date].sort().slice(-MAX_DONE), updatedAt: now }
}

/**
 * Due days in a row it was done, counting back from today; today still open does not break it.
 * Days it is not due are skipped.
 */
export function streak(habit: Habit, now: number): number {
  const done = new Set(habit.done)
  let day = startOfDay(now)
  if (!done.has(dateKey(day))) day = shiftDay(day, -1)
  let count = 0
  for (let i = 0; i < 400; i++, day = shiftDay(day, -1)) {
    if (!isDue(habit, day)) continue
    if (!done.has(dateKey(day))) break
    count++
  }
  return count
}

/** Of the due days in the last [days] days (today included), how many were done, as a share. */
export function completion(habit: Habit, now: number, days = 7): { done: number; due: number } {
  let due = 0
  let doneCount = 0
  let day = startOfDay(now)
  for (let i = 0; i < days; i++, day = shiftDay(day, -1)) {
    if (day < startOfDay(habit.createdAt) || !isDue(habit, day)) continue
    due++
    if (isDone(habit, day)) doneCount++
  }
  return { done: doneCount, due }
}

export const habitRef = (habit: Pick<Habit, 'id'>, dayStart: number) => `habit:${habit.id}@${dateKey(dayStart)}`

/** Reminders for open habits with a moment in (from, to]: one per due day that is not ticked off. */
export function habitNotices(state: HabitsState, from: number, to: number): Array<PlannedNotice & { target: Habit['target'] }> {
  const out: Array<PlannedNotice & { target: Habit['target'] }> = []
  for (const habit of activeHabits(state)) {
    if (!habit.remindAt) continue
    for (let day = startOfDay(from); day <= to; day = shiftDay(day, 1)) {
      const at = new Date(day).setHours(Number(habit.remindAt.slice(0, 2)), Number(habit.remindAt.slice(3, 5)), 0, 0)
      if (at <= from || at > to || !isDue(habit, day) || isDone(habit, day)) continue
      const days = streak(habit, day)
      out.push({
        ref: habitRef(habit, day),
        at,
        title: `Gewoonte: ${habit.name}`,
        text: days > 0 ? `Nog niet afgevinkt vandaag. Hou je reeks van ${days} ${days === 1 ? 'dag' : 'dagen'} vast.` : 'Nog niet afgevinkt vandaag.',
        target: habit.target,
      })
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

/** The habit reminders the phone should know ahead (safety net and web push). */
export function plannedHabitNotices(state: HabitsState, now: number, horizon = SAFETY_HORIZON_MS): PlannedNotice[] {
  return habitNotices(state, now, now + horizon)
    .filter((n) => n.target === 'phone')
    .map(({ target: _target, ...n }) => n)
}
