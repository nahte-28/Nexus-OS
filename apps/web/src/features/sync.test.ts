import { describe, expect, it } from 'vitest'

const { profilesStore } = await import('../profiles/store')
const { isFeatureOn, setFeature } = await import('./store')

describe('module switches', () => {
  it('travel with the profiles, so every device with the account has the same', () => {
    setFeature('teams', true)
    expect(profilesStore.getSnapshot().state.features.teams).toBe(true)
    expect(isFeatureOn('teams')).toBe(true)
    // Another device switched it off: the synced profiles bring that here.
    profilesStore.adopt({ ...profilesStore.getSnapshot().state, features: { teams: false }, revision: profilesStore.getSnapshot().state.revision + 5 })
    expect(isFeatureOn('teams')).toBe(false)
    expect(JSON.parse(localStorage.getItem('nexus.features') ?? '{}')).toEqual({ teams: false })
  })
})
