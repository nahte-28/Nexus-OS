import { describe, expect, it } from 'vitest'
import { togetherClock, finishedRounds, parseTogether, togetherPhase } from './studyTogether'

const s = { focus: 25, break: 5, startedAt: 0 }
const min = 60_000

describe('Samen studeren', () => {
  it('counts focus and break blocks from the start for everyone', () => {
    expect(togetherPhase(s, 10 * min)).toEqual({ phase: 'focus', round: 1, left: 15 * min, endsAt: 25 * min })
    expect(togetherPhase(s, 27 * min)).toEqual({ phase: 'break', round: 1, left: 3 * min, endsAt: 30 * min })
    expect(togetherPhase(s, 31 * min)).toMatchObject({ phase: 'focus', round: 2, endsAt: 55 * min })
    expect(togetherPhase(s, -5)).toMatchObject({ phase: 'focus', round: 1 })
  })

  it('lists the focus blocks you finished since you joined', () => {
    expect(finishedRounds(s, 0, 24 * min)).toEqual([])
    expect(finishedRounds(s, 0, 56 * min)).toEqual([1, 2])
    expect(finishedRounds(s, 26 * min, 56 * min)).toEqual([2])
  })

  it('parses the list and shows a clock', () => {
    const raw = [{ id: 'a', title: 'Wiskunde', focus: 50, break: 10, startedAt: '2026-11-14T10:00:00Z', host: 'Hanne', mine: false, joined: true, members: [{ name: 'Hanne' }, { name: 'Ik', me: true }, { name: '' }] }, { id: 'b' }, null]
    expect(parseTogether(raw)).toEqual([{ id: 'a', title: 'Wiskunde', focus: 50, break: 10, startedAt: Date.parse('2026-11-14T10:00:00Z'), host: 'Hanne', mine: false, joined: true, members: [{ name: 'Hanne', me: false }, { name: 'Ik', me: true }] }])
    expect(parseTogether({})).toEqual([])
    expect(togetherClock(65_000)).toBe('1:05')
    expect(togetherClock(-1)).toBe('0:00')
  })
})
