import { describe, expect, it } from 'vitest'
import { DEFAULT_FOCUS, freeSlots, newTimer, nextPhase, parseFocusSettings, pauseTimer, phaseEndNotice, planStudy, startTimer, timeLeft } from './study'

const M = 60_000
// Monday 2 November 2026, local time.
const day = (d: number, h = 0, m = 0) => new Date(2026, 10, d, h, m).getTime()

describe('Studieplanner', () => {
  it('runs focus rounds with breaks and a long break after four', () => {
    const s = DEFAULT_FOCUS
    let t = startTimer(newTimer(s, 'Elektronica'), 0)
    expect(timeLeft(t, 10 * M)).toBe(15 * M)
    t = pauseTimer(t, 10 * M)
    expect(timeLeft(t, 99 * M)).toBe(15 * M)
    t = startTimer(t, 100 * M)
    expect(t.endsAt).toBe(115 * M)
    expect(phaseEndNotice(t, s).title).toBe('Tijd voor een pauze')
    const phases: string[] = []
    for (let i = 0; i < 8; i++) {
      t = nextPhase(t, s, 0)
      phases.push(t.phase)
    }
    expect(phases).toEqual(['break', 'focus', 'break', 'focus', 'break', 'focus', 'long_break', 'focus'])
    expect(parseFocusSettings({ focusMinutes: 0, rounds: 'x' })).toMatchObject({ focusMinutes: 1, rounds: 4 })
  })

  it('finds free time around lessons and appointments', () => {
    const windows = [{ days: [1], start: '17:00', end: '21:00' }]
    const busy = [{ start: day(2, 18), end: day(2, 19) }]
    expect(freeSlots(windows, busy, day(2, 8), day(3))).toEqual([
      { start: day(2, 17), end: day(2, 18) },
      { start: day(2, 19), end: day(2, 21) },
    ])
    // Starting in the middle of a window.
    expect(freeSlots(windows, [], day(2, 20), day(3))).toEqual([{ start: day(2, 20), end: day(2, 21) }])
  })

  it('plans the nearest deadline first and says what does not fit', () => {
    const windows = [{ days: [1, 2, 3, 4, 5, 6, 7], start: '17:00', end: '19:00' }]
    const tasks = [
      { id: 'b', title: 'Wiskunde', dueAt: day(5, 23, 59), minutes: 60 },
      { id: 'a', title: 'Verslag', dueAt: day(3, 18), minutes: 150 },
    ]
    const { blocks, short } = planStudy(tasks, [], day(2, 12), { windows, blockMinutes: 60, gapMinutes: 15 })
    expect(blocks.map((b) => [b.taskId, new Date(b.start).getDate(), new Date(b.start).getHours(), (b.end - b.start) / M])).toEqual([
      ['a', 2, 17, 60],
      ['a', 2, 18, 45],
      ['a', 3, 17, 45],
      ['b', 3, 18, 60],
    ])
    expect(short).toEqual([])
    expect(planStudy([{ id: 'x', title: 'Te laat', dueAt: day(2, 18), minutes: 300 }], [], day(2, 12), { windows }).short).toEqual([{ taskId: 'x', title: 'Te laat', minutes: 240 }])
  })
})
