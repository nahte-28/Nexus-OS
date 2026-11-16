import { describe, expect, it } from 'vitest'
import { emptyGoals, semesterGoalProgress, goalsSummary, goalTitle, mergeGoals, newGoal, parseGoals, semesterOf, type GoalFacts } from './goals'
import { emptyGrades, type Course } from './grades'
import { emptyHabits, type Habit } from './habits'

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime()
const NOW = at(2026, 11, 18) // a Wednesday, noon

const course = (id: string, name: string, credits: number, scores: Array<[number, number | null]>): Course => ({
  id,
  name,
  credits,
  target: 10,
  parts: scores.map(([weight, score], i) => ({ id: `${id}${i}`, name: `deel ${i}`, weight, score, max: 20 })),
  updatedAt: 1,
  deletedAt: null,
})

const facts = (over: Partial<GoalFacts> = {}): GoalFacts => ({ grades: emptyGrades(), habits: emptyHabits(), focusLog: [], ...over })

describe('doelen', () => {
  it('knows the semester', () => {
    expect(semesterOf(at(2026, 11, 18))).toEqual({ start: '2026-09-01', end: '2027-01-31' })
    expect(semesterOf(at(2027, 1, 10))).toEqual({ start: '2026-09-01', end: '2027-01-31' })
    expect(semesterOf(at(2027, 3, 1))).toEqual({ start: '2027-02-01', end: '2027-06-30' })
    expect(newGoal('g', 'average', NOW)).toMatchObject({ start: '2026-11-18', end: '2027-01-31', target: 14 })
  })

  it('follows the average and one course from Cijfers', () => {
    const grades = { courses: [course('m', 'Wiskunde', 6, [[50, 16], [50, null]]), course('p', 'Programmeren', 4, [[100, 12]])], revision: 1 }
    const average = semesterGoalProgress(newGoal('a', 'average', NOW, { target: 14 }), facts({ grades }), NOW)
    expect(average).toMatchObject({ status: 'reached', value: 14.4 })
    const math = semesterGoalProgress(newGoal('c', 'course', NOW, { target: 14, ref: 'm' }), facts({ grades }), NOW)
    expect(math).toMatchObject({ status: 'on_track', value: 16, hint: 'Nog 12/20 nodig op de rest.' })
    expect(semesterGoalProgress(newGoal('c', 'course', NOW, { target: 14, ref: 'p' }), facts({ grades }), NOW).status).toBe('missed')
    expect(semesterGoalProgress(newGoal('c', 'course', NOW, { ref: 'weg' }), facts({ grades }), NOW).status).toBe('empty')
    expect(semesterGoalProgress(newGoal('a', 'average', NOW), facts(), NOW)).toMatchObject({ status: 'empty', value: null })
    expect(semesterGoalProgress(newGoal('k', 'credits', NOW, { target: 10 }), facts({ grades }), NOW)).toMatchObject({ status: 'on_track', value: 4 })
  })

  it('counts focus time of this week and judges it by the part of the week that passed', () => {
    const goal = newGoal('f', 'focus', at(2026, 11, 1), { target: 10 })
    const log = [
      { at: at(2026, 11, 15), minutes: 600 }, // last Sunday: another week
      { at: at(2026, 11, 16), minutes: 120 },
      { at: at(2026, 11, 17), minutes: 150 },
    ]
    const p = semesterGoalProgress(goal, facts({ focusLog: log }), NOW)
    expect(p).toMatchObject({ value: 4.5, status: 'on_track', line: '4,5 van 10 uur deze week' })
    expect(semesterGoalProgress(goal, facts({ focusLog: log.slice(0, 2) }), NOW).status).toBe('behind')
    expect(semesterGoalProgress(goal, facts({ focusLog: [...log, { at: at(2026, 11, 18, 10), minutes: 360 }] }), NOW).status).toBe('reached')
  })

  it('keeps a habit on schedule until the period is over', () => {
    const habit: Habit = { id: 'h', name: 'Sporten', days: [1, 2, 3, 4, 5, 6, 7], remindAt: null, target: 'phone', done: ['2026-11-16', '2026-11-17', '2026-11-18'], createdAt: at(2026, 11, 1), updatedAt: 1, deletedAt: null }
    const goal = newGoal('h', 'habit', at(2026, 11, 15), { target: 75, ref: 'h', end: '2026-11-20' })
    expect(semesterGoalProgress(goal, facts({ habits: { habits: [habit], revision: 1 } }), NOW)).toMatchObject({ status: 'on_track', value: 75 })
    expect(semesterGoalProgress(goal, facts({ habits: { habits: [habit], revision: 1 } }), at(2026, 11, 22)).status).toBe('missed')
    expect(goalTitle(goal, facts({ habits: { habits: [habit], revision: 1 } }))).toBe('Sporten: 75 %')
  })

  it('syncs: the newest edit of each goal wins, and nonsense is dropped', () => {
    const a = newGoal('x', 'average', NOW)
    const b = { ...a, target: 16, updatedAt: NOW + 1 }
    expect(mergeGoals({ goals: [a], revision: 1 }, { goals: [b], revision: 2 })).toEqual({ goals: [b], revision: 2 })
    const parsed = parseGoals({ goals: [a, { id: 'y', kind: 'nope', updatedAt: 1 }, { ...a, id: 'z', target: 99, end: '2020-01-01' }], revision: 3 })
    expect(parsed.goals).toEqual([a])
    expect(parseGoals({ goals: [{ ...a, target: 99 }] }).goals[0].target).toBe(20)
    expect(parseGoals(null)).toEqual(emptyGoals())
  })

  it('sums up what is on schedule', () => {
    const grades = { courses: [course('m', 'Wiskunde', 6, [[100, 15]])], revision: 1 }
    const state = { goals: [newGoal('a', 'average', NOW, { target: 14 }), newGoal('f', 'focus', NOW, { target: 10 })], revision: 1 }
    expect(goalsSummary(state, facts({ grades }), NOW)).toEqual({ total: 2, good: 1, behind: 1 })
  })
})
