import { describe, expect, it } from 'vitest'
import { busyBlocks, commonFreeSlots, mergeBlocks, parseFriendBusy } from './freeBusy'
import type { Appointment } from './life'

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime()

describe('freeBusy', () => {
  it('shares only busy blocks, rounded to quarters and merged', () => {
    const a: Appointment = { kind: 'appointment', id: 'a1', title: 'Tandarts', startAt: at(17, 10, 5), endAt: at(17, 10, 50), location: '', notes: '', remind: [], target: 'phone', repeat: null, updatedAt: 1, deletedAt: null }
    const plan: Appointment = { ...a, id: 'a2', startAt: at(17, 14), endAt: at(17, 15) }
    const input = {
      calendarEvents: [{ subject: 'Elektronica', start: at(17, 8, 30), end: at(17, 10, 10) }],
      timetable: [],
      items: [a, plan],
      reminders: [{ id: 'r', title: 'Bellen', at: at(17, 12) }],
    } as never
    expect(busyBlocks(input, at(17, 0), 2, 'a2')).toEqual([[at(17, 8, 30), at(17, 11)]])
    expect(busyBlocks(input, at(17, 0), 2)).toHaveLength(2)
    expect(mergeBlocks([[5, 9], [1, 3], [3, 4], [8, 7]])).toEqual([[1, 4], [5, 9]])
  })

  it('finds moments when everyone is free, within the hours and what was shared', () => {
    const me: [number, number][] = [[at(17, 9), at(17, 12)]]
    const friend: [number, number][] = [[at(17, 13), at(17, 18)]]
    const slots = commonFreeSlots([me, friend], { minutes: 60, from: at(17, 8), days: 2, perDay: 2 })
    expect(slots).toEqual([
      { start: at(17, 12), end: at(17, 13) },
      { start: at(17, 18), end: at(17, 19) },
      { start: at(18, 9), end: at(18, 10) },
    ])
    // Nothing after the moment the friend's agenda stops.
    expect(commonFreeSlots([me, friend], { minutes: 60, from: at(17, 8), days: 2 }, at(17, 18, 30))).toEqual([{ start: at(17, 12), end: at(17, 13) }])
    // A 90-minute plan does not fit between 12 and 13.
    expect(commonFreeSlots([me, friend], { minutes: 90, from: at(17, 8), days: 1 })[0]).toEqual({ start: at(17, 18), end: at(17, 19, 30) })
  })

  it('reads what friends share safely', () => {
    expect(parseFriendBusy([{ user: 'u1', name: 'Remo', shares: true, blocks: [[1, 2], [5, 'x']], until: '2026-11-30T00:00:00Z', updatedAt: 3 }, { user: 'u2' }, null])).toEqual([
      { user: 'u1', name: 'Remo', shares: true, blocks: [[1, 2]], until: Date.parse('2026-11-30T00:00:00Z'), updatedAt: 3 },
    ])
  })
})
