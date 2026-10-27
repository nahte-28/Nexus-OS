import { describe, expect, it } from 'vitest'
import { completion, dateKey, habitNotices, mergeHabits, parseHabitsState, plannedHabitNotices, streak, toggleDone, type Habit } from './habits'

const day = (d: number, h = 12) => new Date(2026, 10, d, h).getTime()
const habit = (over: Partial<Habit> = {}): Habit => ({
  id: 'h1',
  name: 'Wiskunde oefenen',
  days: [1, 2, 3, 4, 5],
  remindAt: '20:00',
  target: 'phone',
  done: [],
  createdAt: day(1),
  updatedAt: 1,
  deletedAt: null,
  ...over,
})

describe('Gewoontes', () => {
  it('ticks a day off and back on', () => {
    const h = toggleDone(habit(), day(3), 5)
    expect(h.done).toEqual(['2026-11-03'])
    expect(h.updatedAt).toBe(5)
    expect(toggleDone(h, day(3, 22)).done).toEqual([])
  })

  it('counts a streak over due days only, and today still open does not break it', () => {
    // Mon 2 to Fri 6 November done; the weekend is not due; Monday 9 still open.
    const h = habit({ done: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'] })
    expect(streak(h, day(9))).toBe(5)
    expect(streak(toggleDone(h, day(9)), day(9))).toBe(6)
    // Tuesday 10 without Monday 9: broken.
    expect(streak(h, day(10))).toBe(0)
    expect(completion(h, day(8))).toEqual({ done: 5, due: 5 })
  })

  it('reminds only on due days that are still open', () => {
    const h = habit({ done: ['2026-11-03'] })
    const notices = habitNotices({ habits: [h], revision: 1 }, day(2, 0), day(8, 0))
    expect(notices.map((n) => dateKey(n.at))).toEqual(['2026-11-02', '2026-11-04', '2026-11-05', '2026-11-06'])
    expect(notices[0]).toMatchObject({ ref: 'habit:h1@2026-11-02', title: 'Gewoonte: Wiskunde oefenen', target: 'phone' })
    expect(plannedHabitNotices({ habits: [{ ...h, target: 'this_device' }], revision: 1 }, day(2, 0))).toEqual([])
    expect(habitNotices({ habits: [{ ...h, remindAt: null }], revision: 1 }, day(2, 0), day(8, 0))).toEqual([])
  })

  it('repairs stored copies and merges two devices habit by habit', () => {
    const repaired = parseHabitsState({ habits: [{ ...habit(), days: [9], remindAt: '25:00', done: ['gisteren', '2026-11-03', '2026-11-03'] }, { id: 'x' }] })
    expect(repaired.habits).toEqual([habit({ days: [1, 2, 3, 4, 5, 6, 7], remindAt: null, done: ['2026-11-03'] })])
    const merged = mergeHabits({ habits: [habit({ updatedAt: 9, done: ['2026-11-03'] })], revision: 2 }, { habits: [habit({ updatedAt: 4 }), habit({ id: 'h2' })], revision: 3 })
    expect(merged.habits.map((h) => [h.id, h.done])).toEqual([
      ['h1', ['2026-11-03']],
      ['h2', []],
    ])
    expect(merged.revision).toBe(3)
  })
})
