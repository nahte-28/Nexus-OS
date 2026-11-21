import { describe, expect, it } from 'vitest'
import { addVisit, newMatch, parseDarts, remaining, type DartsMatch } from './darts'
import { BOT_LEVELS, botName, botTarget, botVisit, scoreAt, seeded, throwAt } from './dartsBot'

const ok = (m: DartsMatch | { error: string }): DartsMatch => {
  if ('error' in m) throw new Error(m.error)
  return m
}

/** The 3-dart average of [level] over [legs] legs of 501. */
function average(level: (typeof BOT_LEVELS)[number]['id'], legs: number) {
  const rand = seeded(42)
  let points = 0
  let darts = 0
  for (let g = 0; g < legs; g++) {
    let rest = 501
    while (rest > 0) {
      const v = botVisit(rest, true, level, rand)
      darts += v.darts
      if (!v.bust) {
        rest -= v.score
        points += v.score
      }
    }
  }
  return (points / darts) * 3
}

describe('darts bot', () => {
  it('reads the board', () => {
    expect(scoreAt(0, 0)).toEqual({ label: 'Bull', value: 50, double: true })
    expect(scoreAt(0, 10).label).toBe('25')
    expect(scoreAt(0, 103)).toEqual({ label: 'T20', value: 60, double: false })
    expect(scoreAt(0, 166)).toEqual({ label: 'D20', value: 40, double: true })
    expect(scoreAt(0, 140).label).toBe('20')
    expect(scoreAt(0, 180)).toEqual({ label: 'Mis', value: 0, double: false })
    expect(scoreAt(103, 0).label).toBe('T6')
    expect(scoreAt(-166, 0).label).toBe('D11')
    expect(throwAt('T19', 0, () => 0.5).label).toBe('T19')
    expect(throwAt('D16', 0, () => 0.5).label).toBe('D16')
  })

  it('aims to score, to finish and to leave a double', () => {
    expect(botTarget(501, true, 3)).toBe('T20')
    expect(botTarget(170, true, 3)).toBe('T20')
    expect(botTarget(40, true, 3)).toBe('D20')
    expect(botTarget(50, true, 1)).toBe('Bull')
    expect(botTarget(57, true, 1)).toBe('17') // leaves 40
    expect(botTarget(169, true, 3)).toBe('T20') // no finish
    expect(botTarget(62, true, 3)).toBe('T10') // the route, not T20 to leave 2
  })

  it('throws averages that fit the levels', () => {
    for (const l of BOT_LEVELS) expect(Math.abs(average(l.id, 150) - l.average)).toBeLessThan(l.average * 0.15)
    expect(average('pro', 100)).toBeGreaterThan(average('beginner', 100) * 2)
  })

  it('counts darts at a finishing double and a bust on a single', () => {
    const out = botVisit(40, true, 'pro', seeded(1))
    expect(out.doubles).toBeGreaterThanOrEqual(1)
    expect(out.thrown.length).toBe(out.darts)
    // A finish always ends on a double; a total that only fits by a single is a bust.
    let wins = 0
    for (let i = 0; i < 500; i++) {
      const rest = 2 + (i % 60)
      const v = botVisit(rest, true, 'gevorderd', seeded(i))
      expect(v.score).toBe(v.thrown.reduce((n, d) => n + d.value, 0))
      if (!v.bust && v.score === rest) {
        wins++
        expect(v.thrown.at(-1)?.double).toBe(true)
      }
      if (v.score === rest && !v.thrown.at(-1)?.double) expect(v.bust).toBe(true)
    }
    expect(wins).toBeGreaterThan(20)
  })

  it('plays a match as a bot side that survives a sync', () => {
    let m = ok(newMatch('b', ['Ethan', botName('club')], { mode: 301, legsToWin: 1, doubleOut: true, bot: { side: 1, level: 'club' } }, 0))
    expect(m.bot).toEqual({ side: 1, level: 'club' })
    expect(parseDarts({ matches: [m] }).matches[0].bot).toEqual({ side: 1, level: 'club' })
    expect(parseDarts({ matches: [{ ...m, bot: { side: 5, level: 'club' } }] }).matches[0].bot).toBeUndefined()
    m = ok(addVisit(m, 100, 1))
    m = ok(addVisit(m, 261 - 160, 1)) // the bot: 200 left
    m = ok(addVisit(m, 0, 1))
    // A bot that ends on a single with double-out is a bust, though the total fits.
    const before = remaining(m, 1)
    m = ok(addVisit(m, 60, 1, 3, 0, true))
    expect(remaining(m, 1)).toBe(before)
    expect(m.legs[0].visits.at(-1)?.bust).toBe(true)
    expect(newMatch('p', [['Ethan', 'Remo'], botName('pro')], { mode: 501, legsToWin: 1, doubleOut: true, bot: { side: 0, level: 'pro' } }, 0)).toEqual({ error: 'De bot speelt alleen, niet in een koppel.' })
  })
})
