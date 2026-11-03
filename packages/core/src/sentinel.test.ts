import { describe, expect, it } from 'vitest'
import { addAudit, deviceChanges, MAX_AUDIT, parseAudit, securityChecks, staleDevices, type SecurityInput, type SentinelDevice } from './sentinel'

const DAY = 86_400_000
const now = 100 * DAY
const dev = (id: string, over: Partial<SentinelDevice> = {}): SentinelDevice => ({ id, name: id, platform: 'web', lastSeenAt: now, createdAt: 0, revoked: false, isThisDevice: false, ...over })
const base: SecurityInput = { cloud: true, signedIn: true, devices: [dev('pc', { isThisDevice: true })], aiAlwaysAllowed: [], aiModulesOff: 0, aiModulesTotal: 9, extensions: [], sharedTeams: 0, autoClipboard: false, notifications: 'granted', now }

describe('securityChecks', () => {
  it('has no warnings for a fresh signed-in account', () => {
    const c = securityChecks(base)
    expect(c.map((x) => x.id)).toEqual(['ai-modules', 'account', 'devices'])
    expect(c.some((x) => x.level === 'warn')).toBe(false)
  })

  it('warns about devices not seen for 30 days, warnings first', () => {
    const c = securityChecks({ ...base, devices: [...base.devices, dev('gsm', { lastSeenAt: now - 31 * DAY })], aiAlwaysAllowed: ['create_note'] })
    expect(c[0].level).toBe('warn')
    expect(c.find((x) => x.id === 'stale-devices')?.title).toContain('gsm')
    expect(c.find((x) => x.id === 'ai-always')?.action?.tab).toBe('Toestemmingen')
  })

  it('never calls this device or a revoked one stale', () => {
    const devices = [dev('pc', { isThisDevice: true, lastSeenAt: 0 }), dev('old', { revoked: true, lastSeenAt: 0 })]
    expect(staleDevices(devices, now)).toEqual([])
  })

  it('points to signing in without an account', () => {
    const c = securityChecks({ ...base, signedIn: false, devices: [] })
    expect(c[0]).toMatchObject({ id: 'account', level: 'info', action: { app: 'account' } })
  })

  it('mentions blocked notifications, shared teams and the clipboard', () => {
    const ids = securityChecks({ ...base, notifications: 'denied', sharedTeams: 2, autoClipboard: true, aiModulesOff: 3 }).map((x) => x.id)
    expect(ids).toEqual(expect.arrayContaining(['notifications', 'teams', 'clipboard', 'ai-modules']))
  })
})

describe('audit log', () => {
  it('keeps the newest on top, ignores copies and caps the length', () => {
    let log = addAudit([], { id: 'a', at: 1, action: 'signed_in', target: '', outcome: 'ok' })
    log = addAudit(log, { id: 'b', at: 2, action: 'device_added', target: 'gsm', outcome: 'ok' })
    expect(addAudit(log, { id: 'a', at: 5, action: 'signed_out', target: '', outcome: 'ok' })).toBe(log)
    expect(log.map((e) => e.id)).toEqual(['b', 'a'])
    for (let i = 0; i < MAX_AUDIT + 5; i++) log = addAudit(log, { id: `x${i}`, at: 10 + i, action: 'signed_in', target: '', outcome: 'ok' })
    expect(log).toHaveLength(MAX_AUDIT)
  })

  it('drops what does not fit when parsing', () => {
    expect(parseAudit([{ id: 'a', at: 1, action: 'nope' }, { id: 'b', at: 2, action: 'device_revoked', target: 'x'.repeat(500), outcome: 'failed' }, 'junk'])).toEqual([{ id: 'b', at: 2, action: 'device_revoked', target: 'x'.repeat(120), outcome: 'failed' }])
    expect(parseAudit(null)).toEqual([])
  })
})

describe('deviceChanges', () => {
  it('only remembers on the first look', () => {
    const r = deviceChanges(null, [dev('a'), dev('b', { revoked: true })])
    expect(r).toEqual({ added: [], revoked: [], next: { a: 'active', b: 'revoked' } })
  })

  it('finds new and revoked devices, not this one', () => {
    const r = deviceChanges({ a: 'active', b: 'active' }, [dev('a'), dev('b', { revoked: true }), dev('c'), dev('me', { isThisDevice: true })])
    expect(r.added.map((d) => d.id)).toEqual(['c'])
    expect(r.revoked.map((d) => d.id)).toEqual(['b'])
  })
})
