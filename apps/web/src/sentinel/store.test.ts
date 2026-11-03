import { beforeEach, describe, expect, it } from 'vitest'
import type { ConnectState, DeviceView } from '../connect/engine'
import { eventBus } from '../events/bus'
import { AuditStore, audited, authChange, checkDevices } from './store'

const device = (id: string, over: Partial<DeviceView> = {}): DeviceView => ({ id, name: `Toestel ${id}`, platform: 'web', publicKey: '', createdAt: '2026-11-01T10:00:00Z', lastSeenAt: '2026-11-03T10:00:00Z', revokedAt: null, fingerprint: '', isThisDevice: false, ...over })
const state = (devices: DeviceView[]): ConnectState => ({ status: 'ready', device: null, devices, inbox: [], unread: 0, error: null })

describe('Sentinel store', () => {
  beforeEach(() => localStorage.clear())

  it('logs a new device and puts it in the event bus, not on the first look', () => {
    const store = new AuditStore(false)
    checkDevices(state([device('me', { isThisDevice: true }), device('a')]), store, 1000)
    expect(store.getSnapshot()).toEqual([])
    checkDevices(state([device('me', { isThisDevice: true }), device('a'), device('b')]), store, 2000)
    expect(store.getSnapshot().map((e) => [e.action, e.target])).toEqual([['device_added', 'Toestel b']])
    expect(eventBus.getSnapshot().some((e) => e.id === 'sentinel:device:b' && e.priority === 'high')).toBe(true)
    // The same list again changes nothing; a revoke is logged once.
    checkDevices(state([device('me', { isThisDevice: true }), device('a', { revokedAt: '2026-11-03T11:00:00Z' }), device('b')]), store, 3000)
    checkDevices(state([device('me', { isThisDevice: true }), device('a', { revokedAt: '2026-11-03T11:00:00Z' }), device('b')]), store, 4000)
    expect(store.getSnapshot().map((e) => e.action)).toEqual(['device_revoked', 'device_added'])
  })

  it('logs signing in and out once', () => {
    const store = new AuditStore(false)
    authChange('u1', 'ethan@example.com', store, 1)
    authChange('u1', 'ethan@example.com', store, 2)
    authChange(null, null, store, 3)
    expect(store.getSnapshot().map((e) => e.action)).toEqual(['signed_out', 'signed_in'])
  })

  it('writes down a failed action and passes the error on', async () => {
    const store = new AuditStore(false)
    await expect(audited('signout_others', '', () => Promise.reject(new Error('net')), store)).rejects.toThrow('net')
    expect(store.getSnapshot()[0]).toMatchObject({ action: 'signout_others', outcome: 'failed' })
  })
})
