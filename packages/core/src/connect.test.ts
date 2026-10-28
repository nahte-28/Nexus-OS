import { describe, expect, it } from 'vitest'
import { actionTarget, defaultDeviceName, filterInbox, inboxApps, parseAction, parsePayload, trimInbox, type InboxItem } from './connect'

function item(id: string, patch: Partial<InboxItem> = {}): InboxItem {
  return {
    id,
    v: 1,
    kind: 'notification',
    app: 'com.whatsapp',
    appName: 'WhatsApp',
    title: `Titel ${id}`,
    postedAt: 1,
    fromDeviceId: 'phone',
    receivedAt: 1,
    read: false,
    ...patch,
  }
}

describe('connect payloads', () => {
  it('accepts valid payloads and drops malformed ones', () => {
    const ok = { v: 1, kind: 'test', app: 'nexus', appName: 'NEXUS', title: 'Hallo', postedAt: 5 }
    expect(parsePayload(ok)).toEqual(ok)
    expect(parsePayload({ ...ok, text: 'inhoud' })?.text).toBe('inhoud')
    expect(parsePayload({ ...ok, v: 2 })).toBeNull()
    expect(parsePayload({ ...ok, kind: 'other' })).toBeNull()
    expect(parsePayload({ ...ok, postedAt: 'gisteren' })).toBeNull()
    expect(parsePayload(null)).toBeNull()
  })

  it('filters by app and search term, newest first', () => {
    const items = [
      item('a', { postedAt: 1, text: 'Etentje vanavond?' }),
      item('b', { postedAt: 3, app: 'com.google.android.gm', appName: 'Gmail', title: 'Factuur' }),
      item('c', { postedAt: 2 }),
    ]
    expect(filterInbox(items).map((i) => i.id)).toEqual(['b', 'c', 'a'])
    expect(filterInbox(items, { app: 'com.whatsapp' }).map((i) => i.id)).toEqual(['c', 'a'])
    expect(filterInbox(items, { query: 'ETENTJE' }).map((i) => i.id)).toEqual(['a'])
    expect(filterInbox(items, { query: 'gmail' }).map((i) => i.id)).toEqual(['b'])
  })

  it('lists apps by frequency and keeps the inbox bounded', () => {
    const items = [item('a', { receivedAt: 1 }), item('b', { receivedAt: 2 }), item('c', { app: 'x', appName: 'X', receivedAt: 3 })]
    expect(inboxApps(items)).toEqual([
      { app: 'com.whatsapp', appName: 'WhatsApp', count: 2 },
      { app: 'x', appName: 'X', count: 1 },
    ])
    expect(trimInbox(items, 2).map((i) => i.id)).toEqual(['c', 'b'])
  })

  it('names browsers readably', () => {
    const win = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'
    const android = 'Mozilla/5.0 (Linux; Android 16; CPH2711) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36'
    expect(defaultDeviceName(win)).toBe('Chrome op Windows')
    expect(defaultDeviceName(android)).toBe('Chrome op Android')
    expect(defaultDeviceName(`${win} Edg/141.0`)).toBe('Edge op Windows')
  })

  it('reads an action from the watch and what it ticks off', () => {
    expect(parseAction({ v: 1, kind: 'action', action: 'done', ref: 'deadline:d1@100-60', at: 7 })).toEqual({ v: 1, kind: 'action', action: 'done', ref: 'deadline:d1@100-60', at: 7 })
    expect(parseAction({ v: 1, kind: 'action', action: 'delete', ref: 'x', at: 7 })).toBeNull()
    expect(parseAction({ v: 1, kind: 'action', action: 'focus', minutes: 25, at: 9 })).toEqual({ v: 1, kind: 'action', action: 'focus', minutes: 25, task: '', at: 9 })
    expect(parseAction({ v: 1, kind: 'action', action: 'focus', minutes: 900, at: 9 })).toBeNull()
    expect(parseAction({ v: 1, kind: 'notification', title: 'x' })).toBeNull()
    expect(actionTarget('deadline:d1@1767225600000-1440')).toEqual({ kind: 'deadline', id: 'd1' })
    expect(actionTarget('habit:h1@2026-11-03')).toEqual({ kind: 'habit', id: 'h1', date: '2026-11-03' })
    expect(actionTarget('reminder:r1@5')).toBeNull()
    expect(actionTarget('dagstart:2026-11-03')).toBeNull()
  })
})
