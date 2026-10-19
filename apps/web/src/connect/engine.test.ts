import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptWith, encryptFor, exportPublicKey, generateDeviceKeyPair, type Device, type InboxItem } from '@nexus/core'
import { getAll, resetDbConnection } from '../state/db'
import { ConnectEngine } from './engine'
import { ConnectSetupError, type ConnectMessage, type ConnectRemote, type OutgoingMessage } from './remote'

class FakeRemote implements ConnectRemote {
  devices: Device[] = []
  messages: Array<ConnectMessage & { recipientDeviceId: string }> = []
  missingTables = false
  private listeners = new Map<string, () => void>()

  async listDevices() {
    if (this.missingTables) throw new ConnectSetupError('relation "public.devices" does not exist')
    return this.devices.map((d) => ({ ...d }))
  }
  async registerDevice(d: { id: string; name: string; platform: Device['platform']; publicKey: string }) {
    const now = new Date().toISOString()
    this.devices.push({ ...d, createdAt: now, lastSeenAt: now, revokedAt: null })
  }
  async updateDevice(id: string, patch: { name?: string; revoked?: boolean; seen?: boolean }) {
    const d = this.devices.find((x) => x.id === id)!
    if (patch.name) d.name = patch.name
    if (patch.revoked) d.revokedAt ??= new Date().toISOString()
  }
  async fetchMessages(deviceId: string) {
    return this.messages.filter((m) => m.recipientDeviceId === deviceId)
  }
  async deleteMessages(ids: string[]) {
    this.messages = this.messages.filter((m) => !ids.includes(m.id))
  }
  async sendMessages(messages: OutgoingMessage[]) {
    for (const m of messages) {
      this.messages.push({ ...m, id: crypto.randomUUID() })
      this.listeners.get(m.recipientDeviceId)?.()
    }
  }
  listen(deviceId: string, onMessage: () => void) {
    this.listeners.set(deviceId, onMessage)
    return () => this.listeners.delete(deviceId)
  }
}

function fakeClient(userId = 'user-1') {
  return {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: userId, email: 'ethan@example.com' } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  } as unknown as SupabaseClient
}

async function ready(engine: ConnectEngine) {
  await vi.waitFor(() => expect(['ready', 'revoked', 'setup-needed', 'error']).toContain(engine.getSnapshot().status))
}

describe('ConnectEngine', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
    resetDbConnection()
  })

  it('registers this browser once and keeps its identity', async () => {
    const remote = new FakeRemote()
    const first = new ConnectEngine(fakeClient(), remote, () => {})
    const stop = first.start()
    await ready(first)
    expect(first.getSnapshot().status).toBe('ready')
    expect(remote.devices).toHaveLength(1)
    expect(remote.devices[0]).toMatchObject({ platform: 'web' })
    expect(first.getSnapshot().device?.fingerprint).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/)
    stop()

    const again = new ConnectEngine(fakeClient(), remote, () => {})
    const stopAgain = again.start()
    await ready(again)
    expect(remote.devices).toHaveLength(1)
    expect(again.getSnapshot().device?.id).toBe(remote.devices[0].id)
    stopAgain()
  })

  it('receives an encrypted notification from the phone and keeps it only locally', async () => {
    const remote = new FakeRemote()
    const notified: InboxItem[] = []
    const engine = new ConnectEngine(fakeClient(), remote, (item) => notified.push(item))
    const stop = engine.start()
    await ready(engine)
    const pc = remote.devices[0]

    // What the Android companion does: encrypt for the pc's public key and upload.
    const payload = { v: 1, kind: 'notification', app: 'com.whatsapp', appName: 'WhatsApp', title: 'Sam', text: 'Etentje?', postedAt: 5 }
    const envelope = await encryptFor(pc.publicKey, pc.id, JSON.stringify(payload))
    expect(JSON.stringify(envelope)).not.toContain('Etentje')
    await remote.sendMessages([{ ...envelope, senderDeviceId: 'phone', recipientDeviceId: pc.id }])

    await vi.waitFor(() => expect(engine.getSnapshot().inbox).toHaveLength(1))
    expect(engine.getSnapshot().inbox[0]).toMatchObject({ appName: 'WhatsApp', title: 'Sam', text: 'Etentje?', read: false })
    expect(engine.getSnapshot().unread).toBe(1)
    expect(notified).toHaveLength(1)
    await vi.waitFor(() => expect(remote.messages).toHaveLength(0))
    expect(await getAll<InboxItem>('inbox')).toHaveLength(1)

    await engine.markAllRead()
    expect(engine.getSnapshot().unread).toBe(0)
    await engine.removeFromInbox([engine.getSnapshot().inbox[0].id])
    expect(await getAll('inbox')).toHaveLength(0)
    stop()
  })

  it('sends a test notification to itself and drops messages it cannot read', async () => {
    const remote = new FakeRemote()
    const engine = new ConnectEngine(fakeClient(), remote, () => {})
    const stop = engine.start()
    await ready(engine)
    const pc = remote.devices[0]
    await remote.sendMessages([{ ephemeralKey: pc.publicKey, iv: 'AAAAAAAAAAAAAAAA', ciphertext: 'AAAA', senderDeviceId: 'x', recipientDeviceId: pc.id }])
    await engine.sendTest(pc.id)
    await vi.waitFor(() => expect(remote.messages).toHaveLength(0))
    expect(engine.getSnapshot().inbox.map((i) => i.kind)).toEqual(['test'])
    stop()
  })

  it('sends an encrypted NEXUS notification that only the phone can read', async () => {
    const remote = new FakeRemote()
    const engine = new ConnectEngine(fakeClient(), remote, () => {})
    const stop = engine.start()
    await ready(engine)
    const phoneKeys = await generateDeviceKeyPair()
    const phoneKey = await exportPublicKey(phoneKeys.publicKey)
    await remote.registerDevice({ id: 'phone', name: 'OnePlus 15R', platform: 'android', publicKey: phoneKey })
    await engine.refreshDevices()

    await expect(engine.sendNotification('phone', '   ')).rejects.toThrow('titel')
    await engine.sendNotification('phone', ' Deadline ', 'Verslag inleveren')
    const [message] = await remote.fetchMessages('phone')
    expect(message.ciphertext).not.toContain('Verslag')
    const payload = JSON.parse(await decryptWith(phoneKeys.privateKey, phoneKey, 'phone', message))
    expect(payload).toMatchObject({ v: 1, kind: 'notification', app: 'nexus', appName: 'NEXUS', title: 'Deadline', text: 'Verslag inleveren' })
    stop()
  })

  it('stops receiving once revoked and can be coupled again', async () => {
    const remote = new FakeRemote()
    const engine = new ConnectEngine(fakeClient(), remote, () => {})
    const stop = engine.start()
    await ready(engine)
    const oldId = remote.devices[0].id
    await engine.revoke(oldId)
    expect(engine.getSnapshot().status).toBe('revoked')
    await engine.reconnect()
    expect(engine.getSnapshot().status).toBe('ready')
    expect(engine.getSnapshot().device?.id).not.toBe(oldId)
    expect(remote.devices.filter((d) => !d.revokedAt)).toHaveLength(1)
    stop()
  })

  it('asks for the database migration when the tables are missing', async () => {
    const remote = new FakeRemote()
    remote.missingTables = true
    const engine = new ConnectEngine(fakeClient(), remote, () => {})
    const stop = engine.start()
    await ready(engine)
    expect(engine.getSnapshot().status).toBe('setup-needed')
    stop()
  })

  it('revokes this browser when leaving the account', async () => {
    const remote = new FakeRemote()
    const engine = new ConnectEngine(fakeClient(), remote, () => {})
    const stop = engine.start()
    await ready(engine)
    await engine.leave()
    expect(remote.devices[0].revokedAt).not.toBeNull()
    stop()
  })
})
