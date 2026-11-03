import { afterEach, describe, expect, it } from 'vitest'
import { emptyGaming, saveGame, type GamingState } from '@nexus/core'
import { profilesStore } from '../profiles/store'
import { gamingStore } from './store'
import { applyWatchGaming, planGaming, SESSION_BY, startGaming, stopGaming } from './timer'

describe('Gaming-sessie', () => {
  afterEach(() => {
    profilesStore.update((s) => ({ ...s, override: null }))
    gamingStore.update(() => emptyGaming())
  })

  it('switches to Gaming while the timer runs and back when it stops', () => {
    const now = Date.now()
    const game = saveGame(emptyGaming(), { id: 'g', name: 'Minecraft', platform: 'pc', status: 'playing', rating: null, notes: '' }, now) as GamingState
    gamingStore.update(() => game)
    expect(startGaming('g', now)).toBeNull()
    expect(profilesStore.getSnapshot().active.id).toBe('gaming')
    expect(profilesStore.getSnapshot().state.override?.by).toBe(SESSION_BY)
    expect(stopGaming(now + 40 * 60_000)).toBe(40)
    expect(profilesStore.getSnapshot().state.override).toBeNull()
    expect(gamingStore.getSnapshot().sessions[0]).toMatchObject({ gameId: 'g', minutes: 40 })
  })

  it('needs a game', () => {
    expect(startGaming('nope')).toBe('Kies een game.')
  })

  it('follows start and stop from the watch, once even when two NEXUS windows get them', () => {
    const now = Date.now()
    gamingStore.update(() => saveGame(emptyGaming(), { id: 'g', name: 'Minecraft', platform: 'pc', status: 'playing', rating: null, notes: '' }, now) as GamingState)
    applyWatchGaming('start', now)
    applyWatchGaming('start', now + 1000)
    expect(gamingStore.getSnapshot().active?.startedAt).toBe(now)
    expect(planGaming()).toEqual({ game: 'Minecraft', startedAt: now })
    expect(profilesStore.getSnapshot().active.id).toBe('gaming')
    // A stop that happened before this timer started is not for it.
    applyWatchGaming('stop', now - 1000)
    expect(gamingStore.getSnapshot().active).not.toBeNull()
    applyWatchGaming('stop', now + 30 * 60_000)
    applyWatchGaming('stop', now + 31 * 60_000)
    expect(gamingStore.getSnapshot().sessions).toHaveLength(1)
    expect(gamingStore.getSnapshot().sessions[0]).toMatchObject({ id: `timer-${now}`, minutes: 30 })
    expect(planGaming()).toBeNull()
  })

  it('needs a game to start from the watch', () => {
    applyWatchGaming('start', Date.now())
    expect(gamingStore.getSnapshot().active).toBeNull()
  })
})
