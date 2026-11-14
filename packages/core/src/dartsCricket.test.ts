import { describe, expect, it } from 'vitest'
import {
  addCricketVisit,
  cricketBoard,
  cricketLabel,
  cricketLeg,
  cricketSummary,
  cricketToThrow,
  marksPerRound,
  newCricket,
  parseCricket,
  undoCricket,
  type CricketDart,
  type CricketMatch,
} from './dartsCricket'
import { emptyDarts, mergeDarts, parseDarts } from './darts'

const ok = (m: CricketMatch | { error: string }): CricketMatch => {
  if ('error' in m) throw new Error(m.error)
  return m
}
const T = (target: 20 | 19 | 18 | 17 | 16 | 15): CricketDart => ({
  target,
  mult: 3,
})
const BULL: CricketDart = { target: 25, mult: 2 }

describe('cricket', () => {
  it('closes numbers, scores on open numbers and takes turns', () => {
    let m = ok(newCricket('c', ['Ethan', 'Remo'], 1, 0))
    m = ok(addCricketVisit(m, [T(20), T(20), { target: 20, mult: 1 }], 1)) // closed + 4 marks = 80
    expect(cricketToThrow(m)).toBe(1)
    let b = cricketBoard(m, cricketLeg(m))
    expect(b.marks[0][20]).toBe(3)
    expect(b.points).toEqual([80, 0])
    m = ok(addCricketVisit(m, [T(20)], 1)) // Remo closes 20: no points
    b = cricketBoard(m, cricketLeg(m))
    expect(b.points).toEqual([80, 0])
    m = ok(addCricketVisit(m, [T(20)], 1)) // both closed: nothing
    expect(cricketBoard(m, cricketLeg(m)).points).toEqual([80, 0])
    expect(cricketLabel({ target: 25, mult: 2 })).toBe('Bull')
    expect(addCricketVisit(m, [{ target: 25, mult: 3 }], 1)).toEqual({
      error: 'Die pijl bestaat niet.',
    })
  })

  it('wins a leg with everything closed and the most points, and undo goes back', () => {
    let m = ok(newCricket('c', ['Ethan'], 1, 0))
    m = ok(addCricketVisit(m, [T(20), T(19), T(18)], 1))
    m = ok(addCricketVisit(m, [T(17), T(16), T(15)], 1))
    expect(m.winner).toBeNull()
    m = ok(addCricketVisit(m, [BULL, { target: 25, mult: 1 }], 5))
    expect(m.winner).toBe(0)
    expect(m.finishedAt).toBe(5)
    expect(marksPerRound(m, 0)).toBe(7)
    expect(cricketSummary(m)[0]).toMatchObject({
      legsWon: 1,
      rounds: 3,
      nineMarks: 2,
      fivePlus: 2,
      triples: 6,
      bulls: 3,
    })
    const back = undoCricket(m, 6)
    expect(back.winner).toBeNull()
    expect(cricketToThrow(back)).toBe(0)
  })

  it('does not let a closed leader lose to fewer points, and plays best of 3', () => {
    let m = ok(newCricket('c', ['A', 'B'], 2, 0))
    const close: CricketDart[][] = [
      [T(20), T(19), T(18)],
      [T(17), T(16), T(15)],
      [BULL, { target: 25, mult: 1 }],
    ]
    for (const d of close) {
      m = ok(addCricketVisit(m, d, 1))
      m = ok(addCricketVisit(m, [], 1))
    }
    expect(m.legs).toHaveLength(2)
    expect(m.legs[0].winner).toBe(0)
    expect(m.legs[1].starter).toBe(1) // B starts leg 2
    expect(m.legs[1].visits).toEqual([
      {
        player: 1,
        darts: [
          { target: 0, mult: 1 },
          { target: 0, mult: 1 },
          { target: 0, mult: 1 },
        ],
      },
    ])
  })

  it('travels in the darts document and drops nonsense', () => {
    expect(addCricketVisit(ok(newCricket('c', ['A'], 1, 0)), [T(20), { target: 7 as never, mult: 1 }], 1)).toEqual({ error: 'Die pijl bestaat niet.' })
    const good = ok(addCricketVisit(ok(newCricket('c', ['A'], 1, 0)), [T(20)], 1))
    const parsed = parseDarts({
      ...emptyDarts(),
      cricket: [good, { id: 'x' }],
    })
    expect(parsed.cricket).toEqual([good])
    expect(
      parseCricket({
        ...good,
        legs: [{ visits: [{ player: 0, darts: [{ target: 7, mult: 1 }] }] }],
      })?.legs[0].visits[0].darts,
    ).toEqual([{ target: 0, mult: 1 }])
    const newer = { ...good, updatedAt: 9 }
    expect(mergeDarts({ ...emptyDarts(), cricket: [good] }, { ...emptyDarts(), cricket: [newer] }).cricket).toEqual([newer])
  })
})
