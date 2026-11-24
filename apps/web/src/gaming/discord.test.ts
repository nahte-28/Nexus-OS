import { describe, expect, it } from 'vitest'
import type { DiscordActivity } from '@nexus/core'
import { watchDiscord } from './discord'

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('Discord-status', () => {
  it('sets the status while gaming, clears it after, and tries again when Discord was closed', async () => {
    const calls: string[] = []
    let open = false
    const bridge = {
      set: async (a: DiscordActivity) => {
        if (!open) throw new Error('Discord draait niet op deze computer.')
        calls.push(`set ${a.details}`)
      },
      clear: async () => void calls.push('clear'),
    }
    let now: DiscordActivity | null = null
    const stop = watchDiscord(bridge, () => now)
    await tick()
    expect(calls).toEqual([])
    now = { details: 'Speelt Valorant', status: 'op pc', startMs: 1 }
    // A change in the stores runs it; here the Discord store's own problem update does.
    const { discordStore, setDiscordSettings } = await import('./discord')
    setDiscordSettings({ on: true })
    await tick()
    expect(discordStore.getSnapshot().problem).toMatch(/draait niet/)
    open = true
    setDiscordSettings({ showGame: true })
    await tick()
    await tick()
    expect(calls).toEqual(['set Speelt Valorant'])
    expect(discordStore.getSnapshot().problem).toBeNull()
    now = null
    setDiscordSettings({ on: true })
    await tick()
    expect(calls).toEqual(['set Speelt Valorant', 'clear'])
    stop()
  })
})
