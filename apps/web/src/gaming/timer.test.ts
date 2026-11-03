import { afterEach, describe, expect, it } from 'vitest'
import { emptyGaming, saveGame, type GamingState } from '@nexus/core'
import { profilesStore } from '../profiles/store'
import { gamingStore } from './store'
import { SESSION_BY, startGaming, stopGaming } from './timer'

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
})
