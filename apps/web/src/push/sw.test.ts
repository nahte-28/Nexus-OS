import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { decryptWith, encryptFor, exportPublicKey, generateDeviceKeyPair, PUSH_ACTION_LABELS, QUICK_REPLIES, type Envelope } from '@nexus/core'
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
    expect(notice.options).toMatchObject({ actions: [{ action: 'done', title: PUSH_ACTION_LABELS.done }, { action: 'later', title: PUSH_ACTION_LABELS.later }], data: { ref, token: 'abcdefghijklmnopqrstuvwxyz012345' } })
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

describe('berichten in the service worker', () => {
  afterEach(() => vi.unstubAllGlobals())
  const TOKEN = 'a'.repeat(64)

  it('opens a privébericht sealed for this phone and offers the quick replies', async () => {
    const pair = await generateDeviceKeyPair()
    const identity = { userId: 'u', deviceId: 'gsm', name: 'Chrome op Android', publicKey: await exportPublicKey(pair.publicKey), privateKey: pair.privateKey }
    await update('connect', { put: [identity], key: 'identity' })
    const envelope = await encryptFor(identity.publicKey, 'gsm', JSON.stringify({ v: 1, text: 'Kom je naar de les?' }))
    const extra = { kind: 'dm', title: 'Bericht van Remo', tag: 'dm:remo', reply: TOKEN }
    const notice = await loadWorker().self.nexusPush.noticeFor({ ...envelope, ref: 'dm:m1', to: 'gsm', extra })
    expect(notice.title).toBe('Bericht van Remo')
    expect(notice.options).toMatchObject({
      body: 'Kom je naar de les?',
      tag: 'dm:remo',
      actions: [
        { action: 'reply-ok', title: QUICK_REPLIES['reply-ok'] },
        { action: 'reply-later', title: QUICK_REPLIES['reply-later'] },
      ],
      data: { ref: 'dm:remo', reply: TOKEN, kind: 'dm' },
    })
    // Not for this phone, or too long to come along: only the short text, never someone else's.
    const other = await loadWorker().self.nexusPush.noticeFor({ ref: 'dm:m2', extra })
    expect(other.options.body).toBe('Open NEXUS om het bericht te lezen.')
  })

  it('shows a teamchat message as it came, without buttons when there is no token', async () => {
    const notice = await loadWorker().self.nexusPush.noticeFor({ ref: 'team-chat:m1', extra: { kind: 'team', title: 'Labogroep', text: 'Ethan: Om 14 u?', tag: 'team-chat:g1', reply: 'kort' } })
    expect(notice).toMatchObject({ title: 'Labogroep', options: { body: 'Ethan: Om 14 u?', tag: 'team-chat:g1', actions: [] } })
  })

  it('seals a quick reply for every device of both people and sends it with the token', async () => {
    const friend = await generateDeviceKeyPair()
    const friendKey = await exportPublicKey(friend.publicKey)
    const id = '0b6e3f2a-1c2d-4e5f-8a9b-0c1d2e3f4a5b'
    const sent: Array<Record<string, unknown>> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>
        sent.push(body)
        return new Response(JSON.stringify(body.step === 'keys' ? { kind: 'dm', devices: [{ deviceId: id, publicKey: friendKey }] } : { result: 'verstuurd' }), { status: 200 })
      }),
    )
    const { listeners, shown, opened } = loadWorker()
    let waited: Promise<unknown> | undefined
    const data = { ref: 'dm:remo', reply: TOKEN, kind: 'dm', title: 'Bericht van Remo' }
    listeners.notificationclick({ action: 'reply-ok', notification: { tag: 'dm:remo', data, close: () => {} }, waitUntil: (p: Promise<unknown>) => (waited = p) })
    await waited
    expect(sent.map((b) => b.step)).toEqual(['keys', 'send'])
    expect(sent[1]).toMatchObject({ token: TOKEN, text: QUICK_REPLIES['reply-ok'] })
    const envelope = (sent[1].envelopes as Record<string, Envelope>)[id]
    expect(JSON.parse(await decryptWith(friend.privateKey, friendKey, id, envelope))).toEqual({ v: 1, text: QUICK_REPLIES['reply-ok'] })
    expect(shown[0]).toMatchObject({ title: 'Bericht van Remo', options: { body: `Je antwoordde: ${QUICK_REPLIES['reply-ok']}`, tag: 'dm:remo' } })
    expect(opened).toEqual([])
  })

  it('answers in the teamchat without sealing, and opens NEXUS when it fails', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ result: 'verstuurd' }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const { listeners, opened } = loadWorker()
    let waited: Promise<unknown> | undefined
    const data = { ref: 'team-chat:g1', reply: TOKEN, kind: 'team', title: 'Labogroep' }
    const click = () => listeners.notificationclick({ action: 'reply-later', notification: { tag: data.ref, data, close: () => {} }, waitUntil: (p: Promise<unknown>) => (waited = p) })
    click()
    await waited
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('/api/push-reply', expect.objectContaining({ body: JSON.stringify({ step: 'send', token: TOKEN, text: QUICK_REPLIES['reply-later'], envelopes: null }) }))
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ result: 'onbekend' }), { status: 409 }))
    click()
    await waited
    expect(opened).toEqual(['/?melding=team-chat%3Ag1'])
  })
})
