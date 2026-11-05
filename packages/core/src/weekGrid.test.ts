import { describe, expect, it } from 'vitest'
import type { AgendaEntry } from './life'
import { weekStart } from './gaming'
import { dayBlocks, gridHours, weekDays } from './weekGrid'

const day = new Date(2026, 10, 5).getTime() // Thursday 5 November 2026, local midnight
const at = (h: number, m = 0) => new Date(2026, 10, 5, h, m).getTime()
const lesson = (title: string, from: number, to: number): AgendaEntry => ({ kind: 'lesson', at: from, end: to, title, source: 'school' })

describe('week grid', () => {
  it('starts the week on Monday and gives seven days', () => {
    const monday = weekStart(at(15))
    expect(new Date(monday).getDay()).toBe(1)
    expect(new Date(monday).getDate()).toBe(2)
    const days = weekDays(monday)
    expect(days).toHaveLength(7)
    expect(new Date(days[6]).getDate()).toBe(8)
    expect(days.every((d) => new Date(d).getHours() === 0)).toBe(true)
  })

  it('places blocks as fractions of the visible hours', () => {
    const [b] = dayBlocks([lesson('Wiskunde', at(9), at(11))], day, 8, 18)
    expect(b.top).toBeCloseTo(0.1)
    expect(b.height).toBeCloseTo(0.2)
    expect(b.lanes).toBe(1)
  })

  it('puts overlapping entries side by side and keeps separate ones full width', () => {
    const blocks = dayBlocks([lesson('A', at(9), at(11)), lesson('B', at(10), at(12)), lesson('C', at(13), at(14))], day, 8, 18)
    const by = Object.fromEntries(blocks.map((b) => [b.entry.title, b]))
    expect([by.A.lane, by.B.lane]).toEqual([0, 1])
    expect(by.A.lanes).toBe(2)
    expect(by.B.lanes).toBe(2)
    expect(by.C).toMatchObject({ lane: 0, lanes: 1 })
  })

  it('gives a deadline a minimum height', () => {
    const deadline = { kind: 'reminder', at: at(12), title: 'Inleveren' } as AgendaEntry
    const [b] = dayBlocks([deadline], day, 8, 18)
    expect(b.height).toBeCloseTo(0.05)
  })

  it('widens the hours for early or late entries', () => {
    expect(gridHours([[]], [day])).toEqual({ from: 8, to: 18 })
    expect(gridHours([[lesson('Darts', at(19, 30), at(22, 15))]], [day])).toEqual({ from: 8, to: 23 })
    expect(gridHours([[lesson('Vroeg', at(6, 45), at(7, 30))]], [day])).toEqual({ from: 6, to: 18 })
  })
})
