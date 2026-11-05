import { describe, expect, it } from 'vitest'
import { mergeDarts, parseDarts } from './darts'
import { checkoutResult, clockTarget, clockThrow, finishable, newPractice, parsePractice, pickCheckout, practiceStats, stopPractice, undoPractice, type DartsPractice } from './dartsPractice'

const seq = (...xs: number[]) => {
  let i = 0
  return () => xs[i++ % xs.length]
}

describe('darts practice', () => {
  it('plays Around the Clock from 1 to the bull', () => {
    let p = newPractice('a', 'clock', 1)
    expect(clockTarget(p)).toBe('1')
    p = clockThrow(p, false, 2)
    p = clockThrow(p, true, 3)
    expect(clockTarget(p)).toBe('2')
    for (let i = 0; i < 19; i++) p = clockThrow(p, true, 4)
    expect(clockTarget(p)).toBe('Bull')
    p = clockThrow(p, true, 5)
    expect(clockTarget(p)).toBeNull()
    expect(p.finishedAt).toBe(5)
    expect(clockThrow(p, true, 6)).toBe(p)
    p = undoPractice(p, 7)
    expect(clockTarget(p)).toBe('Bull')
    expect(p.finishedAt).toBeNull()
  })

  it('picks only finishes that can be thrown out', () => {
    expect(finishable(170)).toBe(true)
    expect(finishable(169)).toBe(false)
    expect(finishable(159)).toBe(false)
    // 0.999 lands on 170, 128/130 → 169 is skipped to the next draw.
    expect(pickCheckout(seq(0.999))).toBe(170)
    expect(pickCheckout(seq(128 / 130, 0))).toBe(41)
  })

  it('records checkout attempts, undoes the last one and stops', () => {
    let p = newPractice('c', 'checkout', 1, seq(0))
    expect(p.next).toBe(41)
    p = checkoutResult(p, 2, 2, seq(0.5))
    p = checkoutResult(p, null, 3, seq(0.999))
    expect(p.attempts).toEqual([{ target: 41, darts: 2 }, { target: 106, darts: null }])
    expect(p.next).toBe(170)
    p = undoPractice(p, 4)
    expect(p.next).toBe(106)
    p = stopPractice(p, 5)
    expect(p.finishedAt).toBe(5)
    expect(checkoutResult(p, 3, 6)).toBe(p)
  })

  it('counts stats over rounds and attempts', () => {
    const round = (id: string, misses: number, at: number): DartsPractice => ({ ...newPractice(id, 'clock', at), throws: [...Array(misses).fill(false), ...Array(21).fill(true)] })
    const checkout: DartsPractice = { ...newPractice('k', 'checkout', 5), attempts: [{ target: 100, darts: 3 }, { target: 121, darts: 6 }, { target: 160, darts: null }] }
    const s = practiceStats([round('r1', 9, 1), round('r2', 3, 2), checkout])
    expect(s.clockRounds).toBe(2)
    expect(s.clockBest).toBe(24)
    expect(s.clockRecent).toBe(27)
    expect(s.clockHitRate).toBe(78)
    expect(s.checkoutRate).toBe(67)
    expect(s.checkoutHighest).toBe(121)
    expect(s.checkoutDarts).toBe(4.5)
  })

  it('parses old documents without practice and merges by update time', () => {
    expect(parseDarts({ matches: [] }).practice).toEqual([])
    expect(parsePractice({ id: 'x', game: 'golf' })).toBeNull()
    const a = { ...parseDarts({}), practice: [{ ...newPractice('p', 'clock', 1), updatedAt: 5 }] }
    const b = { ...parseDarts({}), practice: [{ ...newPractice('p', 'clock', 1), throws: [true], updatedAt: 9 }, newPractice('q', 'checkout', 2, seq(0))] }
    const merged = mergeDarts(a, b)
    expect(merged.practice.map((p) => p.id)).toEqual(['q', 'p'])
    expect(merged.practice[1].throws).toEqual([true])
    expect(parseDarts(JSON.parse(JSON.stringify(merged))).practice).toEqual(merged.practice)
  })
})
