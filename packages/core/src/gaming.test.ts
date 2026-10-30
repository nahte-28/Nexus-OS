import { describe, expect, it } from 'vitest'
import { emptyGaming, gameTotals, gamingWeek, liveBuilds, liveSessions, logGameSession, mergeGaming, parseGaming, removeGame, saveBuild, saveGame, setWeeklyLimit, weeklyMinutes, weekStart, type GamingState } from './gaming'

const ok = (r: GamingState | { error: string }) => {
  if ('error' in r) throw new Error(r.error)
  return r
}
// Wednesday 4 November 2026.
const wed = new Date(2026, 10, 4, 20).getTime()
const day = (d: number, h = 20) => new Date(2026, 10, d, h).getTime()

function library() {
  let s = ok(saveGame(emptyGaming(), { id: 'g1', name: 'Rocket League', platform: 'pc', status: 'playing', rating: 4, notes: '' }, 1))
  s = ok(saveGame(s, { id: 'g2', name: 'Celeste', platform: 'Switch', status: 'backlog', rating: 9, notes: '' }, 2))
  s = ok(logGameSession(s, { id: 's1', gameId: 'g1', at: day(2), minutes: 60, note: '' }, 3))
  s = ok(logGameSession(s, { id: 's2', gameId: 'g1', at: day(4, 18), minutes: 45, note: 'ranked' }, 4))
  s = ok(logGameSession(s, { id: 's3', gameId: 'g2', at: day(1), minutes: 30, note: '' }, 5))
  return s
}

describe('Gaming Companion', () => {
  it('keeps a library and a session log', () => {
    const s = library()
    expect(s.games.find((g) => g.id === 'g2')!.rating).toBeNull()
    expect(saveGame(s, { id: 'g3', name: ' ', platform: '', status: 'playing', rating: null, notes: '' }, 6)).toEqual({ error: 'Geef de game een naam.' })
    expect(logGameSession(s, { id: 'x', gameId: 'nope', at: wed, minutes: 10, note: '' }, 6)).toEqual({ error: 'Kies een game.' })
    expect(gameTotals(s).map((t) => [t.game.name, t.minutes, t.sessions])).toEqual([
      ['Rocket League', 105, 2],
      ['Celeste', 30, 1],
    ])
  })

  it('counts the week from Monday and warns near and over the limit', () => {
    let s = library()
    expect(weekStart(wed)).toBe(new Date(2026, 10, 2).getTime())
    // Sunday 1 November belongs to the week before.
    expect(gamingWeek(s, wed)).toMatchObject({ minutes: 105, limit: null, over: false, near: false })
    s = setWeeklyLimit(s, 120, 7)
    expect(gamingWeek(s, wed)).toMatchObject({ near: true, over: false })
    s = setWeeklyLimit(s, 100, 8)
    expect(gamingWeek(s, wed).over).toBe(true)
    expect(weeklyMinutes(s, wed, 2).map((w) => w.minutes)).toEqual([30, 105])
  })

  it('saves builds and removes a game with everything of it', () => {
    let s = ok(saveBuild(library(), { id: 'b1', gameId: 'g1', name: 'Octane', text: 'Boost 100', tags: ['Ranked', 'ranked', ''] }, 9))
    expect(s.builds[0].tags).toEqual(['ranked'])
    s = removeGame(s, 'g1', 10)
    expect([liveSessions(s).length, liveBuilds(s).length]).toEqual([1, 0])
    const other = setWeeklyLimit(library(), 300, 11)
    const merged = mergeGaming(s, other)
    expect(merged.settings.weeklyLimitMinutes).toBe(300)
    expect(merged.games.find((g) => g.id === 'g1')!.deletedAt).toBe(10)
    expect(parseGaming(JSON.parse(JSON.stringify(merged)))).toEqual(merged)
  })
})
