import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Habit } from '@nexus/core'
import { fireHabitNotices } from './alerts'

const evening = new Date(2026, 10, 3, 20, 0).getTime()
const habit = (over: Partial<Habit> = {}): Habit => ({
  id: 'h', name: 'Sporten', days: [1, 2, 3, 4, 5, 6, 7], remindAt: '20:00', target: 'phone', done: [], createdAt: 0, updatedAt: 1, deletedAt: null, ...over,
})

describe('Gewoontes reminders', () => {
  beforeEach(() => localStorage.clear())

  it('reminds once when still open, and not when ticked off', async () => {
    const effects = { local: vi.fn(async () => {}), phones: vi.fn(async () => {}) }
    expect(await fireHabitNotices({ habits: [habit()], revision: 1 }, effects, evening - 60_000)).toBe(0)
    expect(await fireHabitNotices({ habits: [habit()], revision: 1 }, effects, evening + 10_000)).toBe(1)
    expect(effects.phones).toHaveBeenCalledWith('Gewoonte: Sporten', 'Nog niet afgevinkt vandaag.', 'habit:h@2026-11-03')
    expect(await fireHabitNotices({ habits: [habit()], revision: 1 }, effects, evening + 40_000)).toBe(0)

    localStorage.clear()
    expect(await fireHabitNotices({ habits: [habit({ done: ['2026-11-03'] })], revision: 1 }, effects, evening + 10_000)).toBe(0)
  })
})
