import { describe, expect, it } from 'vitest'
import { emptyGoals, newGoal } from './goals'
import { emptyGrades } from './grades'
import { buildPlanToday } from './watchToday'

// Tuesday 17 November 2026, 10:00.
const now = new Date(2026, 10, 17, 10).getTime()
const at = (h: number) => new Date(2026, 10, 17, h).getTime()
const habit = (id: string, name: string, days: number[], done: string[] = []) => ({ id, name, days, remindAt: null, target: 'phone' as const, done, createdAt: 1, updatedAt: 1, deletedAt: null })

describe('watchToday', () => {
  it('sends today’s agenda, the habits due today and the goals of this semester', () => {
    const habits = { habits: [habit('h1', 'Lezen', [2], ['2026-11-17']), habit('h2', 'Sporten', [1, 2, 3]), habit('h3', 'Zondag wandelen', [7])], revision: 0 }
    const goal = { ...newGoal('g1', 'habit', now, { ref: 'h2', target: 80 }), title: '' }
    const today = buildPlanToday(
      {
        agenda: { calendarEvents: [{ start: at(13), end: at(15), subject: 'Elektronica' }], timetable: [], items: [], reminders: [] },
        goals: { ...emptyGoals(), goals: [goal] },
        facts: { grades: emptyGrades(), habits, focusLog: [] },
      },
      now,
    )
    expect(today?.day).toBe('2026-11-17')
    expect(today?.agenda).toEqual([{ at: at(13), end: at(15), title: 'Elektronica' }])
    expect(today?.habits).toEqual([
      { id: 'h1', name: 'Lezen', done: true },
      { id: 'h2', name: 'Sporten', done: false },
    ])
    expect(today?.goals).toHaveLength(1)
    expect(today?.goals[0].title).toContain('Sporten')
  })

  it('sends nothing on an empty day', () => {
    expect(buildPlanToday({ agenda: { calendarEvents: [], timetable: [], items: [], reminders: [] }, goals: emptyGoals(), facts: { grades: emptyGrades(), habits: { habits: [], revision: 0 }, focusLog: [] } }, now)).toBeNull()
  })
})
