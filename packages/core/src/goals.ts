// Doelen: goals for the semester that follow themselves from what NEXUS already knows: your marks in
// Cijfers, your focus time in Studie and your habits in Gewoontes. You set a target once; the
// progress is always worked out again, so nothing has to be ticked off by hand. Pure logic.

import { activeCourses, courseResult, formatMark, gradesOverview, type GradesState } from './grades'
import { activeHabits, completion, dateKey, type HabitsState } from './habits'

export type GoalKind = 'average' | 'course' | 'credits' | 'focus' | 'habit'

export const GOAL_KINDS: GoalKind[] = ['average', 'course', 'credits', 'focus', 'habit']

export const GOAL_KIND_LABELS: Record<GoalKind, string> = {
  average: 'Gemiddelde van je cijfers',
  course: 'Cijfer voor één vak',
  credits: 'Studiepunten halen',
  focus: 'Focustijd per week',
  habit: 'Een gewoonte volhouden',
}

export interface Goal {
  id: string
  title: string
  kind: GoalKind
  /** Out of 20 (average, course), studiepunten (credits), hours per week (focus) or percent (habit). */
  target: number
  /** The course (course) or habit (habit) it follows. */
  ref: string | null
  /** YYYY-MM-DD, local. */
  start: string
  end: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface GoalsState {
  goals: Goal[]
  revision: number
}

export const MAX_GOALS = 50
export const GOAL_TITLE_MAX = 80

export const emptyGoals = (): GoalsState => ({ goals: [], revision: 0 })

/** What a target may be per kind, and its default. */
export const GOAL_LIMITS: Record<GoalKind, { min: number; max: number; step: number; default: number; unit: string }> = {
  average: { min: 10, max: 20, step: 0.5, default: 14, unit: '/20' },
  course: { min: 10, max: 20, step: 0.5, default: 12, unit: '/20' },
  credits: { min: 1, max: 60, step: 1, default: 30, unit: 'studiepunten' },
  focus: { min: 1, max: 60, step: 1, default: 10, unit: 'uur per week' },
  habit: { min: 10, max: 100, step: 5, default: 80, unit: '%' },
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const round1 = (n: number) => Math.round(n * 10) / 10

/** The semester [now] falls in: until 31 January, or from February until 30 June (AP Hogeschool). */
export function semesterOf(now: number): { start: string; end: string } {
  const d = new Date(now)
  const y = d.getFullYear()
  const m = d.getMonth()
  if (m >= 1 && m <= 6) return { start: `${y}-02-01`, end: `${y}-06-30` }
  if (m === 0) return { start: `${y - 1}-09-01`, end: `${y}-01-31` }
  return { start: `${y}-09-01`, end: `${y + 1}-01-31` }
}

export function parseGoal(raw: unknown): Goal | null {
  if (typeof raw !== 'object' || raw === null) return null
  const g = raw as Partial<Goal>
  if (typeof g.id !== 'string' || !g.id || g.id.length > 64 || !GOAL_KINDS.includes(g.kind as GoalKind) || !isNumber(g.updatedAt)) return null
  const kind = g.kind as GoalKind
  const limits = GOAL_LIMITS[kind]
  if (typeof g.start !== 'string' || !DATE.test(g.start) || typeof g.end !== 'string' || !DATE.test(g.end) || g.end < g.start) return null
  return {
    id: g.id,
    title: typeof g.title === 'string' ? g.title.slice(0, GOAL_TITLE_MAX) : '',
    kind,
    target: isNumber(g.target) ? Math.min(Math.max(g.target, limits.min), limits.max) : limits.default,
    ref: typeof g.ref === 'string' && g.ref ? g.ref.slice(0, 64) : null,
    start: g.start,
    end: g.end,
    createdAt: isNumber(g.createdAt) ? g.createdAt : g.updatedAt,
    updatedAt: g.updatedAt,
    deletedAt: isNumber(g.deletedAt) ? g.deletedAt : null,
  }
}

export function parseGoals(raw: unknown): GoalsState {
  if (typeof raw !== 'object' || raw === null) return emptyGoals()
  const r = raw as Partial<GoalsState>
  const goals = (Array.isArray(r.goals) ? r.goals : []).map(parseGoal).filter((g): g is Goal => g !== null)
  return { goals: goals.slice(0, MAX_GOALS * 2), revision: isNumber(r.revision) ? r.revision : 0 }
}

/** Both copies together: per goal the newest edit wins, a removal included. */
export function mergeGoals(a: GoalsState, b: GoalsState): GoalsState {
  const byId = new Map(a.goals.map((g) => [g.id, g]))
  for (const g of b.goals) {
    const mine = byId.get(g.id)
    if (!mine || g.updatedAt > mine.updatedAt) byId.set(g.id, g)
  }
  return { goals: [...byId.values()].sort((x, y) => x.createdAt - y.createdAt), revision: Math.max(a.revision, b.revision) }
}

export const activeGoals = (s: GoalsState) => s.goals.filter((g) => g.deletedAt === null)

/** A new goal for this semester, with the default target of its kind. */
export function newGoal(id: string, kind: GoalKind, now: number, patch: Partial<Pick<Goal, 'title' | 'target' | 'ref' | 'start' | 'end'>> = {}): Goal {
  const semester = semesterOf(now)
  const start = patch.start && DATE.test(patch.start) ? patch.start : dateKey(now)
  const end = patch.end && DATE.test(patch.end) && patch.end >= start ? patch.end : semester.end < start ? start : semester.end
  const limits = GOAL_LIMITS[kind]
  const target = isNumber(patch.target) ? Math.min(Math.max(patch.target, limits.min), limits.max) : limits.default
  return { id, title: (patch.title ?? '').trim().slice(0, GOAL_TITLE_MAX), kind, target, ref: patch.ref ?? null, start, end, createdAt: now, updatedAt: now, deletedAt: null }
}

// Progress ------------------------------------------------------------------------------------------

/** What the progress is worked out from. The focus log is the one of this device (Studie). */
export interface GoalFacts {
  grades: GradesState
  habits: HabitsState
  focusLog: Array<{ at: number; minutes: number }>
}

export type GoalStatus = 'reached' | 'on_track' | 'behind' | 'missed' | 'empty'

export interface SemesterGoalProgress {
  status: GoalStatus
  /** Where you are now, in the unit of the target; null when there is nothing to go on yet. */
  value: number | null
  /** value / target, between 0 and 1. */
  share: number
  /** One line, e.g. "13,2/20 van 14/20". */
  line: string
  /** A hint for what is next, e.g. "Nog 12/20 nodig op de rest." */
  hint: string | null
}

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  reached: 'Gehaald',
  on_track: 'Op schema',
  behind: 'Achter',
  missed: 'Niet gehaald',
  empty: 'Nog niets',
}

function dayStart(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}
const dayEnd = (date: string) => dayStart(date) + 24 * 60 * 60_000 - 1

/** Monday 00:00 of the week [t] falls in. */
function weekStart(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

const hours = (minutes: number) => round1(minutes / 60)
const nl = (n: number) => n.toLocaleString('nl-BE', { maximumFractionDigits: 1 })
const share = (value: number | null, target: number) => (value === null || target <= 0 ? 0 : Math.min(1, Math.max(0, value / target)))

export function semesterGoalProgress(goal: Goal, facts: GoalFacts, now: number): SemesterGoalProgress {
  const ended = now > dayEnd(goal.end)
  const notYet = now < dayStart(goal.start)
  const result = (value: number | null, running: GoalStatus, line: string, hint: string | null = null): SemesterGoalProgress => {
    const reached = value !== null && value >= goal.target
    const status: GoalStatus = value === null ? (ended ? 'missed' : 'empty') : reached ? 'reached' : ended ? 'missed' : running
    return { status, value, share: share(value, goal.target), line, hint: status === 'reached' || status === 'missed' ? null : hint }
  }

  switch (goal.kind) {
    case 'average': {
      const { average } = gradesOverview(facts.grades)
      return result(average, 'behind', average === null ? 'Nog geen cijfers in Cijfers.' : `${formatMark(average)} van ${formatMark(goal.target)}`)
    }
    case 'course': {
      const course = activeCourses(facts.grades).find((c) => c.id === goal.ref)
      if (!course) return { status: ended ? 'missed' : 'empty', value: null, share: 0, line: 'Dat vak staat niet (meer) in Cijfers.', hint: null }
      const r = courseResult({ ...course, target: goal.target })
      const finished = r.status === 'passed' || r.status === 'failed'
      const hint = r.needed !== null && r.needed > 0 ? `Nog ${formatMark(r.needed)} nodig op de rest.` : r.status === 'impossible' ? 'Met de rest haal je dit niet meer.' : null
      const running: GoalStatus = r.status === 'impossible' ? 'behind' : 'on_track'
      // A mark so far above the target only counts once the course is finished or safe.
      const value = r.score
      const reached = value !== null && value >= goal.target && (finished || r.status === 'safe')
      const status: GoalStatus = value === null ? (ended ? 'missed' : 'empty') : reached ? 'reached' : finished || ended ? 'missed' : running
      return { status, value, share: share(value, goal.target), line: value === null ? `${course.name}: nog geen cijfer` : `${course.name}: ${formatMark(value)} van ${formatMark(goal.target)}`, hint: status === 'reached' || status === 'missed' ? null : hint }
    }
    case 'credits': {
      const { earned, credits } = gradesOverview(facts.grades)
      return result(credits === 0 ? null : earned, 'on_track', credits === 0 ? 'Nog geen vakken met studiepunten in Cijfers.' : `${earned} van ${goal.target} studiepunten`)
    }
    case 'focus': {
      if (notYet) return { status: 'empty', value: null, share: 0, line: `Begint op ${goal.start}.`, hint: null }
      const from = Math.max(weekStart(Math.min(now, dayEnd(goal.end))), dayStart(goal.start))
      const minutes = facts.focusLog.filter((e) => e.at >= from && e.at <= now).reduce((n, e) => n + e.minutes, 0)
      const value = hours(minutes)
      // On schedule when you did at least the part of the week that has passed.
      const passed = Math.min(1, (now - weekStart(now)) / (7 * 24 * 60 * 60_000))
      const running: GoalStatus = value >= goal.target * passed ? 'on_track' : 'behind'
      const left = round1(goal.target - value)
      if (ended) return { status: 'missed', value, share: share(value, goal.target), line: `Afgelopen op ${goal.end}.`, hint: null }
      const reached = value >= goal.target
      return { status: reached ? 'reached' : running, value, share: share(value, goal.target), line: `${nl(value)} van ${nl(goal.target)} uur deze week`, hint: reached ? null : `Nog ${nl(left)} uur tot zondag.` }
    }
    case 'habit': {
      const habit = activeHabits(facts.habits).find((h) => h.id === goal.ref)
      if (!habit) return { status: ended ? 'missed' : 'empty', value: null, share: 0, line: 'Die gewoonte staat niet (meer) in Gewoontes.', hint: null }
      if (notYet) return { status: 'empty', value: null, share: 0, line: `${habit.name}: begint op ${goal.start}.`, hint: null }
      const until = Math.min(now, dayEnd(goal.end))
      const days = Math.max(1, Math.floor((until - dayStart(goal.start)) / (24 * 60 * 60_000)) + 1)
      const c = completion(habit, until, Math.min(days, 400))
      const value = c.due === 0 ? null : Math.round((c.done / c.due) * 100)
      const reachedSoFar = value !== null && value >= goal.target
      // A habit is only "gehaald" when the period is over; until then it is on schedule or behind.
      const status: GoalStatus = value === null ? (ended ? 'missed' : 'empty') : ended ? (reachedSoFar ? 'reached' : 'missed') : reachedSoFar ? 'on_track' : 'behind'
      return { status, value, share: share(value, goal.target), line: value === null ? `${habit.name}: nog geen dagen` : `${habit.name}: ${c.done} van ${c.due} dagen (${value} %)`, hint: ended ? null : `Doel: ${goal.target} % tot ${goal.end}.` }
    }
  }
}

/** The title to show: your own, or one that says what the goal follows. */
export function goalTitle(goal: Goal, facts: Pick<GoalFacts, 'grades' | 'habits'>): string {
  if (goal.title) return goal.title
  const unit = GOAL_LIMITS[goal.kind].unit
  switch (goal.kind) {
    case 'average':
      return `Gemiddeld ${nl(goal.target)}${unit}`
    case 'course': {
      const course = facts.grades.courses.find((c) => c.id === goal.ref)
      return `${course?.name ?? 'Vak'}: ${nl(goal.target)}${unit}`
    }
    case 'credits':
      return `${goal.target} ${unit}`
    case 'focus':
      return `${nl(goal.target)} ${unit} studeren`
    case 'habit': {
      const habit = facts.habits.habits.find((h) => h.id === goal.ref)
      return `${habit?.name ?? 'Gewoonte'}: ${goal.target} %`
    }
  }
}

/** For the dashboard and the Dagstart: how many goals are reached or on schedule. */
export function goalsSummary(state: GoalsState, facts: GoalFacts, now: number): { total: number; good: number; behind: number } {
  let good = 0
  let behind = 0
  const goals = activeGoals(state).filter((g) => now <= dayEnd(g.end))
  for (const g of goals) {
    const s = semesterGoalProgress(g, facts, now).status
    if (s === 'reached' || s === 'on_track') good++
    else if (s === 'behind') behind++
  }
  return { total: goals.length, good, behind }
}

