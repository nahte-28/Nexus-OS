import { describe, expect, it } from 'vitest'
import { DEFAULT_SLEEP_GUARD, gameForWatch, gameTimerMinutes, plannedSleepNotices, setSleepGuard, sleepNotice, sleepPlan, startGameTimer, stopGameTimer, emptyGaming, gameTotals, gamingWeek, liveBuilds, liveSessions, logGameSession, mergeGaming, parseGaming, removeGame, saveBuild, saveGame, setWeeklyLimit, weeklyMinutes, weekStart, type GamingState } from './gaming'

const ok = (r: GamingState | { error: string }) => {
  if ('error' in r) throw new Error(r.error)
  return r
}
// Wednesday 4 November 2026.
const wed = new Date(2026, 10, 4, 20).getTime()
const day = (d: number, h = 20) => new Date(2026, 10, d, 0, h * 60).getTime()

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

describe('gaming timer and slaapbewaker', () => {
  let n = 0
  const id = () => `x${++n}`
  it('times a session, logs it on stop and merges the running timer across devices', () => {
    const g = ok(saveGame(emptyGaming(), { id: 'g', name: 'Rocket League', platform: 'pc', status: 'playing', rating: null, notes: '' }, wed))
    expect('error' in startGameTimer(g, 'nope', wed, id)).toBe(true)
    const running = ok(startGameTimer(g, 'g', wed, id))
    expect(gameTimerMinutes(running, wed + 25 * 60_000)).toBe(25)
    // Another device that has not heard of the timer yet does not stop it.
    expect(mergeGaming(g, running).active?.gameId).toBe('g')
    const { state, minutes } = stopGameTimer(running, wed + 95 * 60_000, id)
    expect(minutes).toBe(95)
    expect(state.active).toBeNull()
    expect(liveSessions(state)[0]).toMatchObject({ gameId: 'g', at: wed, minutes: 95, note: 'Met de timer' })
    // Stopping on one device wins over the older running copy.
    expect(mergeGaming(running, state).active).toBeNull()
    expect(parseGaming(JSON.parse(JSON.stringify(running))).active).toEqual(running.active)
    // A timer left running counts for at most 12 hours.
    expect(stopGameTimer(running, wed + 30 * 3_600_000, id).minutes).toBe(12 * 60)
  })

  it('plans the stop time from the first lesson of the next day', () => {
    const lessons = [{ start: day(5, 8.5), subject: 'Wiskunde' }, { start: day(5, 13), subject: 'Netwerken' }]
    const plan = sleepPlan(DEFAULT_SLEEP_GUARD, lessons, day(4, 20))!
    // 08:30 - 1 hour - 8 hours = 23:30.
    expect(plan.stopAt).toBe(day(4, 23.5))
    expect(plan.warnAt).toBe(day(4, 23.25))
    expect(sleepPlan({ ...DEFAULT_SLEEP_GUARD, enabled: false }, lessons, day(4, 20))).toBeNull()
    // During the school day the next lesson is too close: no stop time.
    expect(sleepPlan(DEFAULT_SLEEP_GUARD, lessons, day(5, 11))).toBeNull()
    expect(sleepPlan(DEFAULT_SLEEP_GUARD, [], day(4, 20))).toBeNull()
    const warn = sleepNotice(plan, day(4, 23.2), day(4, 23.3))
    expect(warn).toMatchObject({ kind: 'warn', title: 'Nog 15 minuten gamen' })
    expect(sleepNotice(plan, day(4, 23.45), day(4, 23.55))).toMatchObject({ kind: 'stop', title: 'Tijd om te stoppen' })
    expect(sleepNotice(plan, day(4, 21), day(4, 21.1))).toBeNull()
  })

  it('keeps the guard settings within the choices', () => {
    const s = setSleepGuard(emptyGaming(), { sleepMinutes: 9 * 60, prepMinutes: 7 }, wed)
    expect(s.settings.sleepGuard).toMatchObject({ sleepMinutes: 540, prepMinutes: 60 })
    expect(parseGaming({ settings: { weeklyLimitMinutes: 600 } }).settings.sleepGuard).toEqual(DEFAULT_SLEEP_GUARD)
  })

  it('puts the notices of tonight in the safety net only while you are gaming', () => {
    const plan = sleepPlan(DEFAULT_SLEEP_GUARD, [{ start: day(5, 8.5), subject: 'Wiskunde' }], day(4, 20))!
    expect(plannedSleepNotices(plan, false, day(4, 20))).toEqual([])
    const planned = plannedSleepNotices(plan, true, day(4, 20))
    expect(planned.map((p) => [p.ref, p.at])).toEqual([[sleepNotice(plan, day(4, 23.2), day(4, 23.3))!.ref, day(4, 23.25)], ['sleep:' + new Date(day(5, 8.5)).toISOString().slice(0, 10) + ':stop', day(4, 23.5)]])
    // After the warning only the stop is left; without a warning time only the stop.
    expect(plannedSleepNotices(plan, true, day(4, 23.3)).length).toBe(1)
    expect(plannedSleepNotices({ ...plan, warnAt: plan.stopAt }, true, day(4, 20)).length).toBe(1)
    expect(plannedSleepNotices(null, true, day(4, 20))).toEqual([])
  })

  it('starts the watch timer for the last game played', () => {
    expect(gameForWatch(emptyGaming())).toBeNull()
    let s = ok(saveGame(emptyGaming(), { id: 'a', name: 'A', platform: 'pc', status: 'backlog', rating: null, notes: '' }, wed))
    s = ok(saveGame(s, { id: 'b', name: 'B', platform: 'pc', status: 'playing', rating: null, notes: '' }, wed))
    expect(gameForWatch(s)?.id).toBe('b')
    s = ok(logGameSession(s, { id: 's1', gameId: 'a', at: wed, minutes: 30, note: '' }, wed))
    expect(gameForWatch(s)?.id).toBe('a')
  })
})
