import { describe, expect, it } from 'vitest'
import { appOn, canSwitchApp, parseAppSwitches, widgetsOn } from './appSwitches'
import { defaultProfilesState, mergeFirstSync, parseProfilesState } from './profiles'

describe('appSwitches', () => {
  it('keeps every app on until you switch it off, and never the way back', () => {
    expect(appOn({}, 'finance')).toBe(true)
    expect(appOn({ finance: false }, 'finance')).toBe(false)
    expect(appOn({ settings: false }, 'settings')).toBe(true)
    expect(canSwitchApp('profiles')).toBe(false)
    expect(canSwitchApp('journal')).toBe(true)
  })

  it('reads only known switchable apps with true or false', () => {
    expect(parseAppSwitches({ finance: false, journal: true, settings: false, nope: false, notes: 'x' })).toEqual({ finance: false, journal: true })
    expect(parseAppSwitches(null)).toEqual({})
  })

  it('drops the widgets of apps that are off', () => {
    expect(widgetsOn(['notes', 'finance', 'next_class'], { finance: false })).toEqual(['notes', 'next_class'])
  })

  it('travels with the profiles and keeps a switch set on only one device', () => {
    const base = defaultProfilesState()
    const local = { ...base, appSwitches: { finance: false }, revision: 2 }
    const remote = { ...base, appSwitches: { journal: false }, revision: 5 }
    expect(mergeFirstSync(local, remote).appSwitches).toEqual({ finance: false, journal: false })
    expect(parseProfilesState(JSON.parse(JSON.stringify(local))).appSwitches).toEqual({ finance: false })
  })
})
