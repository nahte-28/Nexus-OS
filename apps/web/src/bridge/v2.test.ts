import { describe, expect, it } from 'vitest'
import { parseBridge, type BridgeMessage } from '@nexus/core'
import type { ConnectState, DeviceView } from '../connect/engine'
import { decryptFile, encryptFile, storageError, type BridgeStorage } from './files'
import { BridgeStore, cleanFiles, receiveBatch, receiveFile, richTargets, sendFile, sendResume, sendTransfer, type BridgeLink } from './store'

const USER = '0b6f8e2a-1c3d-4e5f-8a9b-0c1d2e3f4a5b'

const device = (id: string, patch: Partial<DeviceView> = {}): DeviceView => ({
  id,
  name: id === 'pc' ? 'Pc' : id === 'laptop' ? 'Laptop' : id,
  platform: 'web',
  publicKey: 'k',
  createdAt: '',
  lastSeenAt: '',
  revokedAt: null,
  fingerprint: 'F',
  isThisDevice: false,
  ...patch,
})

/** Two NEXUS devices and a watch on one fake Connect; messages go through JSON and parseBridge, as on the wire. */
function pair() {
  const queues: Record<string, Array<{ from: string; message: BridgeMessage }>> = { pc: [], laptop: [], watch: [] }
  const link = (self: string, other: string): BridgeLink => ({
    getSnapshot: () =>
      ({ status: 'ready', device: { id: self, name: self === 'pc' ? 'Pc' : 'Laptop', fingerprint: 'F' }, devices: [device(self, { isThisDevice: true }), device(other), device('watch', { platform: 'android' })], inbox: [], unread: 0, error: null }) as ConnectState,
    async sendBridge(to, message) {
      const parsed = parseBridge(JSON.parse(JSON.stringify(message)))
      if (parsed) queues[to].push({ from: self, message: parsed })
    },
    async pushNotice() {},
  })
  return { link, take: (id: string) => queues[id].splice(0) }
}

/** Private storage in memory; it only ever holds what it was given. */
function memoryStorage(user: string | null = USER) {
  const objects = new Map<string, Blob>()
  const storage: BridgeStorage = {
    userId: async () => user,
    upload: async (path, data) => void objects.set(path, data),
    download: async (path) => {
      const blob = objects.get(path)
      if (!blob) throw new Error(storageError({ message: 'Object not found' }))
      return blob
    },
    remove: async (path) => {
      if (!objects.delete(path)) throw new Error(storageError({ message: 'Object not found' }))
    },
  }
  return { storage, objects }
}

describe('Bridge 2.0', () => {
  it('encrypts a file so storage only sees ciphertext', async () => {
    const text = new TextEncoder().encode('Geheim verslag')
    const sealed = await encryptFile(text.buffer)
    const cipher = new Uint8Array(await sealed.cipher.arrayBuffer())
    expect(new TextDecoder().decode(cipher)).not.toContain('Geheim')
    expect(new TextDecoder().decode(await decryptFile(cipher.buffer, sealed.key, sealed.iv))).toBe('Geheim verslag')
    const other = await encryptFile(text.buffer)
    await expect(decryptFile(cipher.buffer, other.key, sealed.iv)).rejects.toThrow(/ontsleuteld/)
  })

  it('sends a file to another NEXUS, which saves it once; storage is emptied afterwards', async () => {
    const { link, take } = pair()
    const { storage, objects } = memoryStorage()
    const pc = new BridgeStore(false)
    const laptop = new BridgeStore(false)
    const pcLink = link('pc', 'laptop')
    const laptopLink = link('laptop', 'pc')
    const file = Object.assign(new Blob(['hallo wereld'], { type: 'text/plain' }), { name: 'notities.txt' })

    const [t] = await sendFile(pcLink, ['laptop'], file, { store: pc, now: 1000, storage })
    expect(t).toMatchObject({ status: 'sent', type: 'file', file: { name: 'notities.txt', size: 12, mediaType: 'text/plain' } })
    expect([...objects.keys()]).toEqual([`${USER}/bridge/${t.id}.bin`])

    await receiveBatch(laptopLink, take('laptop'), { store: laptop, now: 2000 })
    const received = laptop.getSnapshot().transfers[0]
    expect(received).toMatchObject({ direction: 'in', type: 'file', content: 'notities.txt' })
    const blob = await receiveFile(laptopLink, received, { store: laptop, now: 3000, storage })
    expect(await blob.text()).toBe('hallo wereld')
    expect(objects.size).toBe(0)
    expect(laptop.getSnapshot().transfers[0]).toMatchObject({ status: 'opened', file: { key: '' } })
    await expect(receiveFile(laptopLink, laptop.getSnapshot().transfers[0], { store: laptop, storage })).rejects.toThrow(/niet meer/)

    // The sender hears "geopend" and forgets its key too; the object was already gone.
    await receiveBatch(pcLink, take('pc'), { store: pc, now: 4000 })
    expect(await cleanFiles({ store: pc, now: 5000, storage })).toBe(1)
    expect(pc.getSnapshot().transfers[0]).toMatchObject({ status: 'opened', file: { key: '' } })
  })

  it('refuses files that are too big, without an account, or to the watch', async () => {
    const { link } = pair()
    const pcLink = link('pc', 'laptop')
    const big = Object.assign(new Blob([new Uint8Array(11 * 1024 * 1024)]), { name: 'groot.zip' })
    await expect(sendFile(pcLink, ['laptop'], big, { store: new BridgeStore(false), storage: memoryStorage().storage })).rejects.toThrow(/10 MB/)
    const small = Object.assign(new Blob(['x']), { name: 'a.txt' })
    await expect(sendFile(pcLink, ['laptop'], small, { store: new BridgeStore(false), storage: memoryStorage(null).storage })).rejects.toThrow(/account/)
    await expect(sendFile(pcLink, ['watch'], small, { store: new BridgeStore(false), storage: memoryStorage().storage })).rejects.toThrow(/toestel/)
    expect(richTargets(pcLink.getSnapshot()).map((d) => d.id)).toEqual(['laptop'])
  })

  it('cleans up a file nobody fetched once it expired', async () => {
    const { link } = pair()
    const { storage, objects } = memoryStorage()
    const pc = new BridgeStore(false)
    await sendFile(link('pc', 'laptop'), ['laptop'], Object.assign(new Blob(['x']), { name: 'a.txt' }), { store: pc, now: 0, storage })
    expect(objects.size).toBe(1)
    expect(await cleanFiles({ store: pc, now: 1000, storage })).toBe(0)
    expect(await cleanFiles({ store: pc, now: 25 * 3_600_000, storage })).toBe(1)
    expect(objects.size).toBe(0)
  })

  it('marks clipboard text and puts it straight on the clipboard when allowed', async () => {
    const { link, take } = pair()
    const pc = new BridgeStore(false)
    const laptop = new BridgeStore(false)
    laptop.setSettings({ autoClipboard: true })
    await sendTransfer(link('pc', 'laptop'), ['laptop'], 'Wachtwoord van de wifi: niet hier', { store: pc, now: 1, extra: { clip: true } })
    const copied: string[] = []
    await receiveBatch(link('laptop', 'pc'), take('laptop'), { store: laptop, now: 2, clipboard: async (text) => (copied.push(text), true) })
    expect(copied).toEqual(['Wachtwoord van de wifi: niet hier'])
    expect(laptop.getSnapshot().transfers[0]).toMatchObject({ clip: true, status: 'opened' })

    // Switched off: it waits for Kopiëren.
    const other = new BridgeStore(false)
    await sendTransfer(link('pc', 'laptop'), ['laptop'], 'tekst', { store: pc, now: 3, extra: { clip: true } })
    await receiveBatch(link('laptop', 'pc'), take('laptop'), { store: other, now: 4, clipboard: async (text) => (copied.push(text), true) })
    expect(copied).toHaveLength(1)
    expect(other.getSnapshot().transfers[0].status).toBe('delivered')
  })

  it('sends "verdergaan" with the app and the item', async () => {
    const { link, take } = pair()
    const laptop = new BridgeStore(false)
    await sendResume(link('pc', 'laptop'), ['laptop'], { app: 'notes', id: 'n1', title: 'Notitie Wiskunde' }, { store: new BridgeStore(false), now: 1 })
    await receiveBatch(link('laptop', 'pc'), take('laptop'), { store: laptop, now: 2 })
    expect(laptop.getSnapshot().transfers[0]).toMatchObject({ type: 'resume', content: 'Notitie Wiskunde', resume: { app: 'notes', id: 'n1' } })
  })
})
