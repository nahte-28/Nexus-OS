/**
 * Vandaag on the watch: what is on today's agenda, which habits are still to do and how your goals
 * are going. It travels in the "plan" payload (PlanPayload.today), so the watch shows it without
 * the pc and can tick habits off itself (with the ref habit:<id>@<day>).
 */
import { activeGoals, goalTitle, semesterGoalProgress, type GoalFacts, type GoalsState, type GoalStatus } from './goals'
import { activeHabits, dateKey, isDone, isDue } from './habits'
import { agendaDay, type AgendaInput } from './life'

export interface PlanToday {
  /** The day it is about, YYYY-MM-DD; the watch hides it on another day. */
  day: string
  agenda: Array<{ at: number; end: number; title: string }>
  habits: Array<{ id: string; name: string; done: boolean }>
  goals: Array<{ title: string; status: GoalStatus; line: string }>
}

export const TODAY_MAX_AGENDA = 12
export const TODAY_MAX_HABITS = 12
export const TODAY_MAX_GOALS = 6
const TITLE_MAX = 80

function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Today for the watch; null when there is nothing to show. */
export function buildPlanToday(input: { agenda: AgendaInput; goals: GoalsState; facts: GoalFacts }, now: number): PlanToday | null {
  const agenda = agendaDay(input.agenda, startOfDay(now))
    .flatMap((e) => (e.kind === 'lesson' || e.kind === 'appointment' || e.kind === 'event' ? [{ at: e.at, end: e.end, title: e.title.slice(0, TITLE_MAX) }] : []))
    .slice(0, TODAY_MAX_AGENDA)
  const habits = activeHabits(input.facts.habits)
    .filter((h) => isDue(h, now))
    .slice(0, TODAY_MAX_HABITS)
    .map((h) => ({ id: h.id, name: h.name.slice(0, TITLE_MAX), done: isDone(h, now) }))
  const today = dateKey(now)
  const goals = activeGoals(input.goals)
    .filter((g) => g.start <= today && g.end >= today)
    .slice(0, TODAY_MAX_GOALS)
    .map((g) => {
      const p = semesterGoalProgress(g, input.facts, now)
      return { title: goalTitle(g, input.facts).slice(0, TITLE_MAX), status: p.status, line: p.line.slice(0, TITLE_MAX) }
    })
  if (agenda.length === 0 && habits.length === 0 && goals.length === 0) return null
  return { day: today, agenda, habits, goals }
}
