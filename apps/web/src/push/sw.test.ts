import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
  const opened: string[] = []
  const self = {
    addEventListener: (type: string, fn: (event: unknown) => void) => (listeners[type] = fn),
    registration: { showNotification: async (title: string, options: NotificationOptions) => void shown.push({ title, options }) },
    clients: { matchAll: async () => [], openWindow: async (url: string) => void opened.push(url) },
  } as unknown as { nexusPush: { noticeFor: (data: unknown) => Promise<Notice> } }
  new Function('self', readFileSync(resolve(__dirname, '../../public/push-sw.js'), 'utf8'))(self)
  return { self, listeners, shown, opened }
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

describe('meldingsknoppen in the service worker', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows Klaar and Later with the token from the encrypted notice', async () => {
    const pair = await generateDeviceKeyPair()
    const identity = { userId: 'u', deviceId: 'gsm', name: 'Chrome op Android', publicKey: await exportPublicKey(pair.publicKey), privateKey: pair.privateKey }
    await update('connect', { put: [identity], key: 'identity' })
    const ref = 'deadline:0b6e3f2a-1c2d-4e5f-8a9b-0c1d2e3f4a5b@100-60'
    const payload = { v: 1, app: 'nexus', appName: 'NEXUS', kind: 'notification', title: 'Verslag', postedAt: 5, ref, actions: ['done', 'later', 'wis'], actionToken: 'abcdefghijklmnopqrstuvwxyz012345' }
    const envelope = await encryptFor(identity.publicKey, 'gsm', JSON.stringify(payload))
    const notice = await loadWorker().self.nexusPush.noticeFor({ ...envelope, ref, to: 'gsm' })
    expect(notice.options).toMatchObject({ actions: [{ action: 'done', title: 'Klaar' }, { action: 'later', title: 'Later' }], data: { ref, token: 'abcdefghijklmnopqrstuvwxyz012345' } })
  })

  it('sends a tapped button to the server, and opens NEXUS when that fails', async () => {
    const { listeners, opened } = loadWorker()
    const fetch = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const data = { ref: 'reminder:a@5', token: 'abcdefghijklmnopqrstuvwxyz012345' }
    let waited: Promise<unknown> | undefined
    const click = (action: string) => listeners.notificationclick({ action, notification: { tag: data.ref, data, close: () => {} }, waitUntil: (p: Promise<unknown>) => (waited = p) })
    click('later')
    await waited
    expect(fetch).toHaveBeenCalledWith('/api/push-action', expect.objectContaining({ body: JSON.stringify({ ...data, action: 'later' }) }))
    expect(opened).toEqual([])
    fetch.mockResolvedValueOnce(new Response('{}', { status: 409 }))
    click('later')
    await waited
    expect(opened).toEqual(['/?melding=reminder%3Aa%405'])
  })
})
