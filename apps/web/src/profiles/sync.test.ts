import { beforeEach, describe, expect, it } from 'vitest'
import { defaultProfilesState, type ProfilesState } from '@nexus/core'
import { ProfilesStore } from './store'
import { ProfilesSync, type ProfilesRemote } from './sync'

/** The account's copy, with the same rule as the database: only a newer revision is stored. */
function fakeRemote(initial: ProfilesState | null = null): ProfilesRemote & { stored: ProfilesState | null } {
  return {
    stored: initial,
    async pull() {
      return this.stored && structuredClone(this.stored)
    },
    async push(state) {
      if (this.stored && state.revision <= this.stored.revision) return false
      this.stored = structuredClone(state)
      return true
    },
  }
}

const device = (patch: Partial<ProfilesState> = {}) => new ProfilesStore(() => 0, { ...defaultProfilesState(), ...patch })

describe('profiles sync', () => {
  beforeEach(() => localStorage.clear())

  it('carries the calendar link from the browser to the phone', async () => {
    const remote = fakeRemote()
    const browser = device()
    browser.update((s) => ({ ...s, calendarUrl: 'https://apih.ap.be/x.ics' }))
    await new ProfilesSync(remote, browser, 'u1').sync()
    expect(remote.stored?.calendarUrl).toBe('https://apih.ap.be/x.ics')

    localStorage.clear() // the phone is another device
    const phone = device({ revision: 7 }) // switched profiles a few times before syncing
    await new ProfilesSync(remote, phone, 'u1').sync()
    expect(phone.getSnapshot().state.calendarUrl).toBe('https://apih.ap.be/x.ics')
    expect(remote.stored?.revision).toBe(phone.getSnapshot().state.revision)
  })

  it('then lets the newest change win, also an unlinked calendar', async () => {
    const remote = fakeRemote({ ...defaultProfilesState(), calendarUrl: 'https://apih.ap.be/x.ics', revision: 5 })
    const pc = device()
    const sync = new ProfilesSync(remote, pc, 'u1')
    await sync.sync()
    pc.update((s) => ({ ...s, calendarUrl: '' }))
    expect(sync.hasLocalChange()).toBe(true)
    await sync.sync()
    expect(remote.stored).toMatchObject({ calendarUrl: '', revision: 6 })

    remote.stored = { ...remote.stored!, defaultProfile: 'gaming', revision: 8 }
    await sync.sync()
    expect(pc.getSnapshot().state).toMatchObject({ defaultProfile: 'gaming', revision: 8 })
  })

  it('takes the account copy when another device pushed the same revision first', async () => {
    const remote = fakeRemote({ ...defaultProfilesState(), revision: 1 })
    const pc = device()
    const sync = new ProfilesSync(remote, pc, 'u1')
    await sync.sync()
    pc.update((s) => ({ ...s, defaultProfile: 'developer' })) // revision 2 here
    remote.stored = { ...remote.stored!, defaultProfile: 'gaming', revision: 2 } // and on the phone
    await sync.sync()
    expect(pc.getSnapshot().state).toMatchObject({ defaultProfile: 'gaming', revision: 2 })
  })
})
