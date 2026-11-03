import { useSyncExternalStore } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { addAudit, deviceChanges, parseAudit, type AuditAction, type AuditEvent, type SentinelDevice } from '@nexus/core'
import type { ConnectState, DeviceView } from '../connect/engine'
import { eventBus } from '../events/bus'
import { readStorage, writeStorage } from '../state/storage'

const AUDIT_KEY = 'nexus.sentinel.audit'
const DEVICES_KEY = 'nexus.sentinel.devices'
const USER_KEY = 'nexus.sentinel.user'

function read<T>(key: string, parse: (raw: unknown) => T, fallback: T): T {
  try {
    const raw = readStorage(key)
    return raw === null ? fallback : parse(JSON.parse(raw))
  } catch {
    return fallback
  }
}

/** Sentinel's activity log: append-only, on this device, at most 300 events. */
export class AuditStore {
  private log: AuditEvent[]
  private listeners = new Set<() => void>()

  constructor(private persist = true) {
    this.log = persist ? read(AUDIT_KEY, parseAudit, []) : []
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): AuditEvent[] => this.log

  add(action: AuditAction, target: string, outcome: 'ok' | 'failed' = 'ok', at = Date.now(), id = `${action}:${at}:${Math.random().toString(36).slice(2, 8)}`): void {
    const next = addAudit(this.log, { id, at, action, target, outcome })
    if (next === this.log) return
    this.log = next
    if (this.persist) writeStorage(AUDIT_KEY, JSON.stringify(next))
    this.listeners.forEach((l) => l())
  }
}

export const auditStore = new AuditStore(typeof window !== 'undefined')
export const useAudit = () => useSyncExternalStore(auditStore.subscribe, auditStore.getSnapshot)

/** Runs [work] and writes down whether it worked; the error is passed on. */
export async function audited(action: AuditAction, target: string, work: () => Promise<void> | void, store = auditStore): Promise<void> {
  try {
    await work()
    store.add(action, target)
  } catch (err) {
    store.add(action, target, 'failed')
    throw err
  }
}

export const toSentinelDevice = (d: DeviceView): SentinelDevice => ({
  id: d.id,
  name: d.name,
  platform: d.platform,
  lastSeenAt: Date.parse(d.lastSeenAt) || 0,
  createdAt: Date.parse(d.createdAt) || 0,
  revoked: d.revokedAt !== null,
  isThisDevice: d.isThisDevice,
})

/**
 * Compares the device list with the last look: a new device (a login somewhere else) or a revoked
 * one goes in the log and, as a device event, in the Inbox. The first look only remembers.
 */
export function checkDevices(state: ConnectState, store = auditStore, now = Date.now()): void {
  if (state.status !== 'ready' || state.devices.length === 0) return
  const known = read<Record<string, 'active' | 'revoked'> | null>(DEVICES_KEY, (x) => (typeof x === 'object' && x !== null ? (x as Record<string, 'active' | 'revoked'>) : null), null)
  const { added, revoked, next } = deviceChanges(known, state.devices.map(toSentinelDevice))
  writeStorage(DEVICES_KEY, JSON.stringify(next))
  for (const d of added) {
    store.add('device_added', d.name, 'ok', now, `device_added:${d.id}`)
    eventBus.publish({ id: `sentinel:device:${d.id}`, source: 'device', type: 'device.added', at: now, title: `Nieuw apparaat gekoppeld: ${d.name}`, body: 'Was jij dit niet? Trek het in via Sentinel › Apparaten en wijzig je wachtwoord.', priority: 'high', link: { app: 'sentinel' } })
  }
  for (const d of revoked) store.add('device_revoked', d.name, 'ok', now, `device_revoked:${d.id}`)
}

/** Logs sign-ins and sign-outs of the account on this device, once each. */
export function authChange(userId: string | null, email: string | null, store = auditStore, now = Date.now()): void {
  const before = readStorage(USER_KEY) || null
  if (before === userId) return
  writeStorage(USER_KEY, userId ?? '')
  if (userId) store.add('signed_in', email ?? '', 'ok', now)
  else if (before) store.add('signed_out', '', 'ok', now)
}

/** Watches devices and sign-ins for the activity log; runs whether or not the Sentinel app is on. */
export function startSentinel(client: SupabaseClient | null, connect: { subscribe(l: () => void): () => void; getSnapshot(): ConnectState }): () => void {
  const onConnect = () => checkDevices(connect.getSnapshot())
  const stop = connect.subscribe(onConnect)
  onConnect()
  const sub = client?.auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION' && !session) return
    authChange(session?.user.id ?? null, session?.user.email ?? null)
  })
  return () => {
    stop()
    sub?.data.subscription.unsubscribe()
  }
}
