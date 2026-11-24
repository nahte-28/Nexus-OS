import { describe, expect, it } from 'vitest'
import { DEFAULT_DISCORD, discordActivity, parseDiscordSettings, sameActivity } from './discord'
import { emptyGaming, type GamingState } from './gaming'

const game = { id: 'g1', name: 'Valorant', platform: 'pc', status: 'playing', rating: null, notes: '' } as unknown as GamingState['games'][number]
const playing: GamingState = { ...emptyGaming(), games: [game], active: { gameId: 'g1', startedAt: 1000, updatedAt: 1000 } }

describe('Discord-status', () => {
  it('shows the game while the Gaming timer runs', () => {
    expect(discordActivity(playing, DEFAULT_DISCORD)).toEqual({ details: 'Speelt Valorant', status: 'op pc', startMs: 1000 })
    expect(discordActivity(playing, { on: true, showGame: false })?.details).toBe('Aan het gamen')
    expect(discordActivity({ ...playing, active: null }, DEFAULT_DISCORD)).toBeNull()
    expect(discordActivity(playing, { on: false, showGame: true })).toBeNull()
  })

  it('reads settings and compares activities', () => {
    expect(parseDiscordSettings({ on: false })).toEqual({ on: false, showGame: true })
    expect(parseDiscordSettings('x')).toEqual(DEFAULT_DISCORD)
    const a = discordActivity(playing, DEFAULT_DISCORD)
    expect(sameActivity(a, { ...a! })).toBe(true)
    expect(sameActivity(a, null)).toBe(false)
  })
})
