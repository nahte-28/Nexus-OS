import { describe, expect, it } from 'vitest'
import { defaultProfilesState } from './profiles'
import {
  addSnapshot,
  canonical,
  changedParts,
  diffScope,
  emptyTimeMachine,
  keepSnapshot,
  parseTimeMachine,
  profilesPayload,
  pruneSnapshots,
  sameScope,
  setTmSettings,
  stableJson,
  withPart,
  type NewSnapshot,
} from './timeMachine'

const day = 86_400_000
const snap = (id: string, at: number, scopes: NewSnapshot['scopes'], reason: NewSnapshot['reason'] = 'auto'): NewSnapshot => ({ id, at, reason, appVersion: '1.0.0', scopes })

describe('Time Machine', () => {
  it('compares configurations without key order or change times', () => {
    expect(stableJson({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe(stableJson({ a: [1, { c: 3, d: 2 }], b: 1 }))
    const flow = { id: 'f1', name: 'Ochtend', enabled: true, version: 3, updatedAt: 10 }
    expect(sameScope('flows', { flows: [flow], settings: { paused: false, updatedAt: 1 } }, { flows: [{ ...flow, version: 4, updatedAt: 99 }], settings: { paused: false, updatedAt: 50 } })).toBe(true)
    expect(sameScope('flows', { flows: [flow], settings: {} }, { flows: [{ ...flow, enabled: false }], settings: {} })).toBe(false)
  })

  it('keeps lessons fetched from a calendar link out of a profiles restore point', () => {
    const state = { ...defaultProfilesState(), calendarEvents: [{ id: 'x' }] as never, revision: 9 }
    const payload = profilesPayload(state)
    expect(payload.calendarEvents).toBeUndefined()
    expect(payload.revision).toBeUndefined()
    expect(payload.profiles).toBeDefined()
    expect(canonical('profiles', state)).toEqual(payload)
  })

  it('skips an automatic restore point when nothing changed, never a manual one', () => {
    const scopes = { spaces: { spaces: [], suggestOnProfile: true } }
    let { state } = addSnapshot(emptyTimeMachine(), snap('a', 1000, scopes))
    expect(state.snapshots).toHaveLength(1)
    const again = addSnapshot(state, snap('b', 2000, scopes))
    expect(again.added).toBeNull()
    state = addSnapshot(state, snap('c', 3000, scopes, 'manual')).state
    expect(state.snapshots.map((s) => s.id)).toEqual(['c', 'a'])
    expect(state.snapshots[0].label).toBe('Herstelpunt')
  })

  it('drops automatic restore points past the count and age, but keeps manual ones', () => {
    let state = setTmSettings(emptyTimeMachine(), { maxCount: 10 }, 0)
    for (let i = 0; i < 12; i++) state = addSnapshot(state, snap(`s${i}`, i * 1000, { flows: { flows: [{ id: `f${i}` }], settings: {} } })).state
    expect(state.snapshots).toHaveLength(10)
    state = keepSnapshot(state, 's11')
    state = pruneSnapshots(state, 40 * day)
    expect(state.snapshots.map((s) => s.id)).toEqual(['s11'])
  })

  it('reads back what it stored and ignores what it does not know', () => {
    const { state } = addSnapshot(emptyTimeMachine(), snap('a', 5, { spaces: { spaces: [] } }))
    const parsed = parseTimeMachine(JSON.parse(JSON.stringify({ ...state, settings: { auto: false, maxCount: 7, retentionDays: 90 } })))
    expect(parsed.snapshots[0].id).toBe('a')
    expect(parsed.settings).toEqual({ auto: false, maxCount: 30, retentionDays: 90, thin: false, autoScopes: ['profiles', 'flows', 'spaces'], manualDays: null })
    expect(parseTimeMachine({ snapshots: [{ id: 'x', at: 1, scopes: {} }] }).snapshots).toEqual([])
  })

  it('describes what a restore changes in profiles', () => {
    const now = defaultProfilesState()
    const then = structuredClone(now)
    then.profiles.school.apps = [...then.profiles.school.apps.filter((a) => a !== 'notes'), 'finance']
    then.profiles.school.theme = 'pulse'
    then.calendarUrl = 'https://apih.ap.be/x.ics'
    const lines = diffScope('profiles', profilesPayload(now), profilesPayload(then), { app: (id) => id.toUpperCase(), theme: (t) => `thema ${t}` })
    const text = lines.map((l) => `${l.where}: ${l.what}`)
    expect(text).toContain('Profiel School › Apps: + FINANCE, − NOTES')
    expect(text.some((t) => t.startsWith('Profiel School › Thema: thema'))).toBe(true)
    expect(text).toContain('Schoolkalender: niet gekoppeld → gekoppeld')
    expect(diffScope('profiles', profilesPayload(now), profilesPayload(now))).toEqual([])
  })

  it('names flows and Spaces that come back, go or change', () => {
    const flows = (list: unknown[]) => ({ flows: list, settings: { paused: false } })
    const lines = diffScope(
      'flows',
      flows([{ id: '1', name: 'Ochtend', enabled: true }, { id: '2', name: 'Nieuw', enabled: true }]),
      flows([{ id: '1', name: 'Ochtend', enabled: false }, { id: '3', name: 'Oud', enabled: true }]),
    )
    expect(lines.map((l) => `${l.where}: ${l.what}`)).toEqual(['Flow Ochtend: gaat uit', 'Flow Oud: komt terug', 'Flow Nieuw: verdwijnt'])
    const spaces = diffScope('spaces', { spaces: [], suggestOnProfile: true }, { spaces: [{ id: 's', name: 'Studeren', windows: [] }], suggestOnProfile: true })
    expect(spaces).toEqual([{ scope: 'spaces', where: 'Space Studeren', what: 'komt terug' }])
  })

  it('thins out older automatic points to one per day and per week', () => {
    let state = setTmSettings(emptyTimeMachine(), { maxCount: 100, retentionDays: 90, thin: true }, 0)
    const now = 30 * day
    // Every 6 hours for 20 days, each one different.
    for (let i = 0; i < 80; i++) state = addSnapshot(state, snap(`s${i}`, now - i * 6 * 3_600_000, { flows: { flows: [{ id: `f${i}` }], settings: {} } })).state
    state = pruneSnapshots(state, now)
    const ages = state.snapshots.map((s) => (now - s.at) / day)
    // The last day all four, then one per day up to a week, then one per week.
    expect(ages.filter((a) => a <= 1)).toHaveLength(5)
    expect(new Set(ages.filter((a) => a > 1 && a <= 7).map((a) => Math.floor((now - a * day) / day))).size).toBe(ages.filter((a) => a > 1 && a <= 7).length)
    expect(ages.filter((a) => a > 7).length).toBeLessThanOrEqual(3)
    expect(state.snapshots.length).toBeLessThan(20)
  })

  it('clears your own points after the chosen days, and keeps a point before a restore for a day', () => {
    let state = emptyTimeMachine()
    state = addSnapshot(state, snap('mine', 0, { spaces: { spaces: [] } }, 'manual')).state
    state = addSnapshot(state, snap('before', 100 * day, { spaces: { spaces: [{ id: 'x' }] } }, 'before_restore')).state
    state = setTmSettings(state, { maxCount: 10, retentionDays: 7, manualDays: 90 }, 100 * day + 1000)
    expect(state.snapshots.map((s) => s.id)).toEqual(['before'])
    expect(setTmSettings(emptyTimeMachine(), { autoScopes: ['flows'] }, 0).settings.autoScopes).toEqual(['flows'])
    expect(parseTimeMachine({ settings: { autoScopes: ['flows', 'nope'], manualDays: 365, thin: true } }).settings).toMatchObject({ autoScopes: ['flows'], manualDays: 365, thin: true })
  })

  it('puts back one flow or Space, leaving the rest as it is now', () => {
    const then = { flows: [{ id: 'a', name: 'Ochtend', enabled: true }, { id: 'b', name: 'Avond', enabled: true }], settings: { paused: false } }
    const now = { flows: [{ id: 'a', name: 'Ochtend', enabled: false }, { id: 'c', name: 'Nieuw', enabled: true }], settings: { paused: true } }
    const parts = changedParts('flows', now, then)
    expect(parts.map((p) => [p.key, p.label])).toEqual([
      ['flow:a', 'Flow Ochtend'],
      ['flow:b', 'Flow Avond'],
      ['flow:c', 'Flow Nieuw'],
      ['flow-settings', 'Pauze en stille uren'],
    ])
    expect(withPart('flows', now, then, 'flow:a')).toEqual({ flows: [{ id: 'a', name: 'Ochtend', enabled: true }, { id: 'c', name: 'Nieuw', enabled: true }], settings: { paused: true } })
    expect(parts.find((p) => p.key === 'flow:b')?.changes[0]).toMatchObject({ what: 'komt terug' })
    expect(parts.find((p) => p.key === 'flow:c')?.changes[0]).toMatchObject({ what: 'verdwijnt' })
    expect(withPart('spaces', { spaces: [{ id: 's', name: 'Nu' }], suggestOnProfile: true }, { spaces: [], suggestOnProfile: false }, 'space:s')).toEqual({ spaces: [], suggestOnProfile: true })
  })

  it('puts back one profile or one profiles setting', () => {
    const then = profilesPayload(defaultProfilesState())
    const current = structuredClone(then) as Record<string, any>
    current.profiles.gaming.name = 'Spelen'
    current.profiles.school.theme = 'light'
    current.lessons = [{ id: 'l', day: 1, start: '08:30', end: '10:00', title: 'Wiskunde' }]
    const parts = changedParts('profiles', current, then)
    expect(parts.map((p) => p.key)).toEqual(['profile:school', 'profile:gaming', 'lessons'])
    const back = withPart('profiles', current, then, 'profile:gaming') as Record<string, any>
    expect(back.profiles.gaming.name).toBe(then.profiles && (then.profiles as any).gaming.name)
    expect(back.profiles.school.theme).toBe('light')
    expect(back.lessons).toHaveLength(1)
  })
})
