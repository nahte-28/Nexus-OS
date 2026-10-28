import { describe, expect, it } from 'vitest'
import { emptyFlashcards, newCard } from './flashcards'
import { focusChange, insights, percent } from './insights'
import type { Deadline } from './life'

// Wednesday 28 October 2026, 12:00; the current week started Monday 26 October.
const now = new Date(2026, 9, 28, 12, 0).getTime()
const at = (d: number, h = 10) => new Date(2026, 9, d, h).getTime()
const deadline = (id: string, dueAt: number, doneAt: number | null): Deadline =>
  ({ id, kind: 'deadline', title: id, dueAt, doneAt, projectId: null, notes: '', remind: [], target: 'phone', createdAt: 0, updatedAt: 1, deletedAt: null }) as Deadline

describe('Inzichten', () => {
  it('sums every week from the other apps', () => {
    const result = insights(
      {
        now,
        focus: [{ at: at(20), minutes: 50 }, { at: at(26), minutes: 25 }, { at: at(27), minutes: 25 }],
        habits: { habits: [{ id: 'h', name: 'Sporten', days: [1, 2, 3, 4, 5, 6, 7], remindAt: null, target: 'phone', done: ['2026-10-26', '2026-10-28'], createdAt: at(26, 0), updatedAt: 1, deletedAt: null }], revision: 1 },
        items: [deadline('a', at(21), at(20)), deadline('b', at(22), at(23)), deadline('c', at(27), null), deadline('later', at(30), null)],
        flashcards: { ...emptyFlashcards(), decks: [{ id: 'd', name: 'E', createdAt: 0, updatedAt: 1, deletedAt: null }], cards: [newCard('x', 'd', 'v', 'a', 0), { ...newCard('y', 'd', 'v', 'a', 0), interval: 30, due: now + 1 }] },
        grades: { courses: [], revision: 0 },
      },
      2,
    )
    expect(result.weeks).toEqual([
      { monday: at(19, 0), focusMinutes: 50, habitsDone: 0, habitsDue: 0, deadlinesDue: 2, deadlinesOnTime: 1 },
      { monday: at(26, 0), focusMinutes: 50, habitsDone: 2, habitsDue: 3, deadlinesDue: 1, deadlinesOnTime: 0 },
    ])
    expect(result.cards).toEqual({ total: 2, learned: 1, due: 1 })
    expect(result.bestHabit).toEqual({ name: 'Sporten', rate: 2 / 3 })
    expect(result.average).toBeNull()
  })

  it('writes percentages and changes in Dutch', () => {
    expect(percent(2, 3)).toBe(67)
    expect(percent(0, 0)).toBeNull()
    expect(focusChange(100, 30)).toBe('+1 u 10 min')
    expect(focusChange(20, 45)).toBe('-25 min')
    expect(focusChange(60, 60)).toBe('gelijk')
  })
})
