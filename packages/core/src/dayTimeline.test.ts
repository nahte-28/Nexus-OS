import { describe, expect, it } from 'vitest'
import { dayTimeline } from './dayTimeline'
import type { AgendaEntry } from './life'

const at = (h: number, m = 0) => new Date(2026, 10, 24, h, m).getTime()
const lesson = (title: string, h1: number, m1: number, h2: number, m2: number): AgendaEntry => ({ kind: 'lesson', at: at(h1, m1), end: at(h2, m2), title, source: 'school' })

describe('Mijn dag', () => {
  const day = [lesson('Wiskunde', 8, 30, 9, 20), lesson('Frans', 10, 25, 11, 15), lesson('Geschiedenis', 11, 15, 12, 5), lesson('Engels', 14, 55, 15, 45)]

  it('lays the day out from the first to the last whole hour', () => {
    const t = dayTimeline(day, at(11, 10))!
    expect(t.from).toBe(at(8))
    expect(t.to).toBe(at(16))
    expect(t.blocks[0]).toMatchObject({ left: 0.0625, lane: 0 })
    expect(t.hours.map((h) => new Date(h.at).getHours())).toEqual([9, 10, 11, 12, 13, 14, 15])
    expect(t.now).toBeCloseTo((3 * 60 + 10) / (8 * 60))
  })

  it('knows what is on now, what is next and when the day is done', () => {
    const t = dayTimeline(day, at(11, 10))!
    expect(t.current?.title).toBe('Frans')
    expect(t.next?.title).toBe('Geschiedenis')
    expect(t.left).toBe(2)
    expect(t.endsAt).toBe(at(15, 45))
    const evening = dayTimeline(day, at(18))!
    expect(evening.current).toBeNull()
    expect(evening.next).toBeNull()
    expect(evening.endsAt).toBeNull()
    expect(evening.now).toBeNull()
  })

  it('puts things that overlap in another lane, and leaves deadlines and reminders out', () => {
    const t = dayTimeline(
      [
        ...day,
        { kind: 'event', at: at(11), end: at(12), title: 'Overleg', source: 'google' },
        { kind: 'reminder', at: at(9), title: 'Boek mee' },
      ],
      at(7),
    )!
    expect(t.lanes).toBe(2)
    expect(t.blocks.find((b) => b.entry.title === 'Overleg')?.lane).toBe(1)
    expect(t.blocks).toHaveLength(5)
    expect(dayTimeline([{ kind: 'reminder', at: at(9), title: 'Boek mee' }], at(7))).toBeNull()
  })
})
