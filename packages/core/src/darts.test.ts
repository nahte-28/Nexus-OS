import { describe, expect, it } from 'vitest'
import { addVisit, checkoutRoute, dartsEvents, dartsStats, emptyDarts, legsWon, mergeDarts, newMatch, parseDarts, remaining, toThrow, undoVisit, type DartsMatch } from './darts'

const ok = (m: DartsMatch | { error: string }): DartsMatch => {
  if ('error' in m) throw new Error(m.error)
  return m
}
const play = (m: DartsMatch, ...scores: Array<number | [number, number]>) => scores.reduce((x, s) => ok(Array.isArray(s) ? addVisit(x, s[0], 1, s[1]) : addVisit(x, s, 1)), m)

describe('darts scorer', () => {
  const start = () => ok(newMatch('m1', ['Ethan', 'Remo'], { mode: 501, legsToWin: 2, doubleOut: true }, 0))

  it('takes turns and counts down', () => {
    const m = play(start(), 100, 60, 140)
    expect(remaining(m, 0)).toBe(261)
    expect(remaining(m, 1)).toBe(441)
    expect(toThrow(m)).toBe(1)
  })

  it('busts below zero, on 1, and on a score no double can finish', () => {
    let m = ok(newMatch('m', ['A'], { mode: 301, legsToWin: 1, doubleOut: true }, 0))
    m = play(m, 180, 81) // 40 left
    expect(play(m, 41).legs[0].visits.at(-1)?.bust).toBe(true)
    expect(play(m, 39).legs[0].visits.at(-1)?.bust).toBe(true)
    expect(remaining(play(m, 41), 0)).toBe(40)
    expect(addVisit(m, 179, 1)).toEqual({ error: '179 kan niet met drie pijlen.' })
  })

  it('wins legs, rotates the starter and ends the match; undo goes back', () => {
    let m = play(start(), 180, 0, 180, 0, [141, 3]) // Ethan wins leg 1 in 9 darts
    expect(legsWon(m, 0)).toBe(1)
    expect(toThrow(m)).toBe(1)
    m = play(m, 0, 180, 0, 180, 0, [141, 2])
    expect(m.winner).toBe(0)
    expect(toThrow(m)).toBeNull()
    const back = undoVisit(m, 2)
    expect(back.winner).toBeNull()
    expect(remaining(back, 0)).toBe(141)
    expect(toThrow(back)).toBe(0)
  })

  it('suggests checkouts', () => {
    expect(checkoutRoute(170)).toEqual(['T20', 'T20', 'Bull'])
    expect(checkoutRoute(100)).toEqual(['T20', 'D20'])
    expect(checkoutRoute(40)).toEqual(['D20'])
    expect(checkoutRoute(41)).toEqual(['9', 'D16'])
    expect(checkoutRoute(169)).toBeNull()
    expect(checkoutRoute(1)).toBeNull()
    expect(checkoutRoute(7, false)).toEqual(['7'])
  })

  it('works out stats for you', () => {
    const m = play(start(), 180, 0, 180, 0, [141, 3])
    const s = dartsStats([m], 'ethan')
    expect(s).toMatchObject({ matches: 1, legsWon: 1, oneEighties: 2, tonForty: 1, highestCheckout: 141, bestLeg: 9, average: 167, first9: 167 })
  })

  it('parses, drops nonsense and merges by match', () => {
    const m = start()
    const raw = { matches: [m, { id: 'x' }, { ...m, id: 'm2', legs: [{ visits: [{ player: 9, score: 50 }, { player: 1, score: 200 }] }] }], settings: { me: 'Ethan', mode: 999 } }
    const s = parseDarts(raw)
    expect(s.matches.map((x) => x.id)).toEqual(['m1', 'm2'])
    expect(s.matches[1].legs[0].visits).toEqual([])
    expect(s.settings).toMatchObject({ me: 'Ethan', mode: 501 })
    const newer = { ...emptyDarts(), matches: [{ ...m, updatedAt: 9, players: ['Ethan', 'Jens'] }] }
    expect(mergeDarts(s, newer).matches.find((x) => x.id === 'm1')?.players).toEqual(['Ethan', 'Jens'])
  })

  it('finds darts in the calendar', () => {
    const events = [
      { start: 5, subject: 'Competitie', room: 'Fairplay darts' },
      { start: 3, subject: 'Dartsavond' },
      { start: 1, subject: 'Darts oud' },
      { start: 4, subject: 'Tandarts' },
      { start: 6, subject: 'Les' },
    ]
    expect(dartsEvents(events, 2).map((e) => e.start)).toEqual([3, 5])
  })
})
