import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { encryptFor, exportPublicKey, generateDeviceKeyPair } from '@nexus/core'
import { update } from '../state/db'

interface Notice {
  title: string
  options: NotificationOptions
}

/** Loads public/push-sw.js the way the service worker does, with a stand-in for `self`. */
function loadWorker() {
  const listeners: Record<string, (event: unknown) => void> = {}
  const shown: Notice[] = []
  const self = {
    addEventListener: (type: string, fn: (event: unknown) => void) => (listeners[type] = fn),
    registration: { showNotification: async (title: string, options: NotificationOptions) => void shown.push({ title, options }) },
    clients: { matchAll: async () => [], openWindow: async () => null },
  } as unknown as { nexusPush: { noticeFor: (data: unknown) => Promise<Notice> } }
  new Function('self', readFileSync(resolve(__dirname, '../../public/push-sw.js'), 'utf8'))(self)
  return { self, listeners, shown }
}

describe('push service worker', () => {
  it('opens a push encrypted for this browser and shows it', async () => {
    const pair = await generateDeviceKeyPair()
    const identity = { userId: 'u', deviceId: 'gsm', name: 'Chrome op Android', publicKey: await exportPublicKey(pair.publicKey), privateKey: pair.privateKey }
    await update('connect', { put: [identity], key: 'identity' })
    const payload = { v: 1, app: 'nexus', appName: 'NEXUS', kind: 'notification', title: 'Labo', text: 'Verslag om 14:00', postedAt: 5, ref: 'reminder:a@5' }
    const envelope = await encryptFor(identity.publicKey, 'gsm', JSON.stringify(payload))

    const { self, listeners, shown } = loadWorker()
    const notice = await self.nexusPush.noticeFor({ ...envelope, ref: 'reminder:a@5', to: 'gsm' })
    expect(notice.title).toBe('Labo')
    expect(notice.options).toMatchObject({ body: 'Verslag om 14:00', tag: 'reminder:a@5' })

    let waited: Promise<unknown> | undefined
    listeners.push({ data: { json: () => ({ ...envelope, ref: 'reminder:a@5' }) }, waitUntil: (p: Promise<unknown>) => (waited = p) })
    await waited
    expect(shown).toEqual([notice])
  })

  it('still shows a short notice when the push cannot be read here', async () => {
    const other = await generateDeviceKeyPair()
    const envelope = await encryptFor(await exportPublicKey(other.publicKey), 'other', '{"title":"Geheim"}')
    const notice = await loadWorker().self.nexusPush.noticeFor({ ...envelope, ref: 'x' })
    expect(notice.title).toBe('NEXUS')
    expect(notice.options.body).not.toContain('Geheim')
  })
})
