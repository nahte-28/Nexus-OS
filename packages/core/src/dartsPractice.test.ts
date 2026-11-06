import { describe, expect, it } from 'vitest'
import { mergeDarts, parseDarts } from './darts'
import { BOBS_TARGETS, bobsRound, bobsScore, bobsTarget, checkoutResult, clockTarget, clockThrow, finishable, newPractice, parsePractice, pickCheckout, practiceStats, practiceSummary, scoringAverage, scoringVisit, stopPractice, undoPractice, type DartsPractice } from './dartsPractice'

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

describe('more darts practice', () => {
  it('plays Doubles rond from D1 to the bull', () => {
    let p = newPractice('d', 'doubles', 1)
    expect(clockTarget(p)).toBe('D1')
    p = clockThrow(p, false, 2)
    for (let i = 0; i < 20; i++) p = clockThrow(p, true, 3)
    expect(clockTarget(p)).toBe('Bull')
    p = clockThrow(p, true, 4)
    expect(p.finishedAt).toBe(4)
    expect(practiceSummary(p)).toBe('22 pijlen')
  })

  it("scores Bob's 27 and stops below zero", () => {
    let p = newPractice('b', 'bobs27', 1)
    expect(bobsTarget(p)).toBe('D1')
    p = bobsRound(p, 1, 2) // +2 → 29
    p = bobsRound(p, 0, 3) // -4 → 25
    expect(bobsScore(p)).toBe(25)
    expect(bobsTarget(p)).toBe('D3')
    p = bobsRound(p, 0, 4) // -6 → 19
    p = bobsRound(p, 0, 5) // -8 → 11
    p = bobsRound(p, 0, 6) // -10 → 1
    expect(p.finishedAt).toBeNull()
    p = bobsRound(p, 0, 7) // -12 → -11
    expect(p.finishedAt).toBe(7)
    expect(bobsTarget(p)).toBeNull()
    p = undoPractice(p, 8)
    expect(bobsScore(p)).toBe(1)
    expect(p.finishedAt).toBeNull()
  })

  it('reaches the bull in a perfect round of Bob\'s 27', () => {
    let p = newPractice('b', 'bobs27', 1)
    for (let i = 0; i < BOBS_TARGETS; i++) p = bobsRound(p, 3, 2)
    expect(p.finishedAt).toBe(2)
    expect(bobsScore(p)).toBe(27 + 3 * (420 + 50))
  })

  it('counts a scoring round of ten visits', () => {
    let p = newPractice('s', 'scoring', 1)
    expect(scoringVisit(p, 179, 2)).toEqual({ error: '179 kan niet met drie pijlen.' })
    for (const v of [60, 100, 45, 140, 26, 81, 60, 180, 41, 85]) {
      const next = scoringVisit(p, v, 3)
      if ('error' in next) throw new Error(next.error)
      p = next
    }
    expect(p.finishedAt).toBe(3)
    expect(scoringAverage(p)).toBe(81.8)
    expect('error' in scoringVisit(p, 60, 4)).toBe(true)
  })

  it('keeps the new rounds through parse and adds them to the stats', () => {
    const bobs: DartsPractice = { ...newPractice('b', 'bobs27', 2), hits: [1, 2, 0], finishedAt: 3 }
    const scoring: DartsPractice = { ...newPractice('s', 'scoring', 1), visits: Array(10).fill(60), finishedAt: 2 }
    const doubles: DartsPractice = { ...newPractice('d', 'doubles', 3), throws: [false, ...Array(21).fill(true)] }
    const parsed = [bobs, scoring, doubles].map((p) => parsePractice(JSON.parse(JSON.stringify(p))))
    expect(parsed).toEqual([bobs, scoring, doubles])
    expect(parsePractice({ ...scoring, visits: [60, 179, 200, 45] })?.visits).toEqual([60, 45])
    const s = practiceStats([bobs, scoring, doubles])
    expect(s.bobsBest).toBe(27 + 2 + 8 - 6)
    expect(s.scoringBest).toBe(60)
    expect(s.doublesBest).toBe(22)
    expect(s.doublesHitRate).toBe(95)
  })
})
