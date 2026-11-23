import { describe, expect, it } from 'vitest'
import { addVisit, checkoutChance, dartsStats, isDouble, newMatch, onDouble, parseDarts, type DartsMatch } from './darts'
import { matchSummary, summaryLine } from './dartsSummary'
import { newPractice, watchPractice, watchPracticeId } from './dartsPractice'
import { parseAction } from './connect'

const ok = (m: DartsMatch | { error: string }): DartsMatch => {
  if ('error' in m) throw new Error(m.error)
  return m
}

describe('standing on a double', () => {
  it('knows the doubles and counts at least one dart at the double', () => {
    expect([2, 16, 40, 50].every(isDouble)).toBe(true)
    expect([1, 3, 42, 41, 60, 0].some(isDouble)).toBe(false)
    let m = ok(newMatch('d', ['Ethan', 'Remo'], { mode: 301, legsToWin: 1, doubleOut: true }, 0))
    m = ok(addVisit(m, 180, 1))
    m = ok(addVisit(m, 60, 1))
    m = ok(addVisit(m, 81, 1)) // Ethan 40
    expect(onDouble(m)).toBe(false) // Remo is on 241
    m = ok(addVisit(m, 60, 1))
    expect(onDouble(m)).toBe(true)
    m = ok(addVisit(m, 0, 1, 3, 0)) // missed, but the darts went at D20
    expect(m.legs[0].visits[4].doubles).toBe(1)
    const single = ok(newMatch('s', ['Ethan'], { mode: 301, legsToWin: 1, doubleOut: false }, 0))
    expect(onDouble(ok(addVisit(ok(addVisit(single, 180, 1)), 81, 1)))).toBe(false)
  })
})

describe('match summary', () => {
  it('sums up a finished match per player and per leg, with checkout percentage', () => {
    let m = ok(newMatch('m', ['Ethan', 'Remo'], { mode: 301, legsToWin: 1, doubleOut: true }, 0))
    m = ok(addVisit(m, 140, 1)) // Ethan 161
    m = ok(addVisit(m, 60, 1)) // Remo 241
    m = ok(addVisit(m, 100, 1)) // Ethan 61: a finish is on now
    m = ok(addVisit(m, 45, 1))
    expect(checkoutChance(m)).toBe(true)
    m = ok(addVisit(m, 21, 1, 3, 2)) // Ethan 40, two darts at a double
    m = ok(addVisit(m, 26, 1))
    m = ok(addVisit(m, 40, 60_000 * 12, 1, 1)) // out with one dart
    expect(m.winner).toBe(0)
    const s = matchSummary({ ...m, finishedAt: 12 * 60_000 })
    const ethan = s.sides[0]
    expect(ethan).toMatchObject({ legsWon: 1, checkouts: 1, doubleDarts: 3, checkoutPct: 33.3, highestFinish: 40, highestScore: 140, tonForty: 1, tons: 1, bestLeg: 10, dartsThrown: 10 })
    expect(ethan.average).toBe(90.3)
    expect(s.sides[1]).toMatchObject({ legsWon: 0, sixtyPlus: 1, checkoutPct: null })
    expect(s.legs).toEqual([{ number: 1, set: 1, winner: 0, darts: 10, finish: 40, averages: [90.3, 43.67] }])
    expect(s.minutes).toBe(12)
    expect(s.bestAverage).toBe(0)
    expect(summaryLine(m, s)).toBe('Ethan 1 – 0 Remo · gem. 90,3 – 43,7')
    expect(dartsStats([m], 'Ethan').checkoutPct).toBe(33.3)
  })

  it('keeps doubles through parsing and clamps nonsense', () => {
    let m = ok(newMatch('m', ['A'], { mode: 40, legsToWin: 1, doubleOut: true }, 0))
    m = ok(addVisit(m, 40, 1, 2, 0)) // a finish needs at least one dart at a double
    expect(m.legs[0].visits[0].doubles).toBe(1)
    const back = parseDarts({ matches: [m] }).matches[0]
    expect(back.legs[0].visits[0].doubles).toBe(1)
    expect(parseDarts({ matches: [{ ...m, legs: [{ ...m.legs[0], visits: [{ player: 0, score: 40, darts: 2, doubles: 9 }] }] }] }).matches[0].legs[0].visits[0].doubles).toBeUndefined()
  })
})

describe('practice from the watch', () => {
  it('parses and replays a round with the same rules, once per id', () => {
    const raw = { v: 1, kind: 'action', action: 'darts_practice', id: 'p1', game: 'bobs27', startedAt: 5, throws: [], hits: [1, 0, 9, 3], visits: [], at: 9 }
    const action = parseAction(raw)
    expect(action).toMatchObject({ action: 'darts_practice', hits: [1, 0, 3] })
    if (action?.action !== 'darts_practice') throw new Error('no action')
    const p = watchPractice(action, 9)
    expect(p).toMatchObject({ id: watchPracticeId('p1'), game: 'bobs27', hits: [1, 0, 3], finishedAt: 9 })
    expect(parseAction({ ...raw, game: 'checkout' })).toBeNull()
    expect(parseAction({ ...raw, hits: [] })).toBeNull()
  })

  it('refuses scores three darts cannot make in Scoring', () => {
    const p = watchPractice({ id: 's', game: 'scoring', startedAt: 1, throws: [], hits: [], visits: [60, 179, 100], at: 2 } as never, 2)
    expect(p?.visits).toEqual([60, 100])
    expect(newPractice('x', 'scoring', 1).visits).toEqual([])
  })
})
