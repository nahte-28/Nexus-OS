import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { makeEvent } from '@nexus/core'
import { UniversalInbox } from './UniversalInbox'
import { inboxStore, InboxStore, syncInbox } from '../inbox/store'
import { setAppOpener } from '../shell/openApp'

const now = Date.now()

describe('Universal Inbox', () => {
  beforeAll(() => {
    inboxStore.add([
      makeEvent({ id: 'ui:flow', source: 'flow', type: 'flow.failed', at: now - 1000, title: 'Flow Ochtend is deels mislukt', priority: 'high', link: { app: 'flows', id: 'f1' } }),
      makeEvent({ id: 'ui:update', source: 'update', type: 'update.available', at: now - 2000, title: 'Versie 1.0.9 van NEXUS is beschikbaar', link: { app: 'settings' } }),
    ])
  })
  afterEach(cleanup)

  it('shows new items, and only urgent ones under Prioriteit', () => {
    render(<UniversalInbox />)
    expect(screen.getByText('Flow Ochtend is deels mislukt')).toBeTruthy()
    expect(screen.getByText('Versie 1.0.9 van NEXUS is beschikbaar')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /Prioriteit/ }))
    expect(screen.queryByText('Versie 1.0.9 van NEXUS is beschikbaar')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /^Inbox/ }))
  })

  it('opens the app an item is about and marks it read', () => {
    const opened = vi.fn()
    setAppOpener(opened)
    render(<UniversalInbox />)
    fireEvent.click(screen.getByText('Versie 1.0.9 van NEXUS is beschikbaar'))
    expect(opened).toHaveBeenCalledWith('settings')
    expect(inboxStore.getSnapshot().find((i) => i.id === 'ui:update')?.readAt).not.toBeNull()
    setAppOpener(null)
  })

  it('snoozes and archives several items at once', () => {
    render(<UniversalInbox />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Flow Ochtend is deels mislukt selecteren' }))
    const snooze = screen.getByRole('combobox', { name: 'Sluimeren' }) as HTMLSelectElement
    fireEvent.change(snooze, { target: { value: snooze.options[1].value } })
    expect(screen.queryByText('Flow Ochtend is deels mislukt')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /Gepland/ }))
    expect(screen.getByText('Flow Ochtend is deels mislukt')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Alles selecteren' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nu tonen' }))
    fireEvent.click(screen.getByRole('tab', { name: /^Inbox/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Alles selecteren' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archiveren' }))
    expect(screen.getByText(/Niets nieuws/)).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /Archief/ }))
    expect(screen.getAllByRole('checkbox', { name: /^(Flow|Versie).* selecteren$/ })).toHaveLength(2)
  })

  it('lets a source be kept out, come in quietly or with its own priority', () => {
    render(<UniversalInbox />)
    fireEvent.click(screen.getByText('Regels per bron'))
    fireEvent.change(screen.getByRole('combobox', { name: 'Updates: in de Inbox' }), { target: { value: 'off' } })
    inboxStore.add([makeEvent({ id: 'ui:update2', source: 'update', type: 'update.available', at: now, title: 'Versie 1.1' })])
    expect(inboxStore.getSnapshot().some((i) => i.id === 'ui:update2')).toBe(false)
    fireEvent.change(screen.getByRole('combobox', { name: 'Updates: in de Inbox' }), { target: { value: 'quiet' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Updates: prioriteit' }), { target: { value: 'high' } })
    inboxStore.add([makeEvent({ id: 'ui:update3', source: 'update', type: 'update.available', at: now, title: 'Versie 1.2' })])
    const item = inboxStore.getSnapshot().find((i) => i.id === 'ui:update3')
    expect(item).toMatchObject({ priority: 'high', readAt: now })
    expect(Object.values(item?.delivery ?? {})).toEqual([{ seenAt: now, readAt: now }])
    expect(inboxStore.rules.getSnapshot().rules.update).toEqual({ mode: 'quiet', priority: 'high', archiveAfterDays: null })
    inboxStore.setPolicy({})
  })

  it('archives a source by itself after the chosen days', () => {
    render(<UniversalInbox />)
    inboxStore.add([makeEvent({ id: 'ui:old', source: 'device', type: 'device.linked', at: now - 2 * 86_400_000, title: 'Gsm gekoppeld' })])
    fireEvent.click(screen.getByText('Regels per bron'))
    fireEvent.change(screen.getByRole('combobox', { name: 'Apparaten: vanzelf archiveren' }), { target: { value: '1' } })
    expect(inboxStore.getSnapshot().find((i) => i.id === 'ui:old')?.archivedAt).not.toBeNull()
    inboxStore.setPolicy({})
  })

  it('snoozes to a chosen moment and shows where an item arrived', () => {
    inboxStore.add([makeEvent({ id: 'ui:later', source: 'flow', type: 'flow.ran', at: now, title: 'Flow later' })])
    render(<UniversalInbox />)
    fireEvent.click(screen.getByRole('tab', { name: /^Inbox/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Flow later selecteren' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Sluimeren' }), { target: { value: 'custom' } })
    const until = new Date(now + 5 * 86_400_000)
    until.setSeconds(0, 0)
    const pad = (n: number) => String(n).padStart(2, '0')
    const value = `${until.getFullYear()}-${pad(until.getMonth() + 1)}-${pad(until.getDate())}T${pad(until.getHours())}:${pad(until.getMinutes())}`
    fireEvent.change(screen.getByLabelText('Sluimeren tot'), { target: { value } })
    fireEvent.click(screen.getByRole('button', { name: 'Sluimeren' }))
    expect(inboxStore.getSnapshot().find((i) => i.id === 'ui:later')?.snoozedUntil).toBe(until.getTime())
    fireEvent.click(screen.getByRole('tab', { name: /Gepland/ }))
    fireEvent.click(screen.getByLabelText('Bezorging van Flow later'))
    expect(screen.getByRole('list', { name: 'Bezorging' }).textContent).toMatch(/\(dit apparaat\): binnen .*nog niet gelezen/)
    fireEvent.click(screen.getByRole('tab', { name: /^Inbox/ }))
  })
})

describe('syncInbox', () => {
  it('sends local changes and takes in what other devices changed', async () => {
    const store = new InboxStore(false)
    store.add([makeEvent({ id: 'a', source: 'flow', type: 'flow.ran', at: 5, title: 'A' })])
    const upserts: unknown[] = []
    const rows = [{ id: 'b', source: 'update', type: 'update.available', title: 'B', body: null, priority: 'normal', link: null, device_id: 'gsm', at: 7, read_at: 8, archived_at: null, snoozed_until: null, updated_at: 8, synced_at: '2026-10-29T10:00:00Z' }]
    const query = { gt: () => query, order: () => query, limit: async () => ({ data: rows, error: null }) }
    const client = {
      from: () => ({
        upsert: async (r: unknown) => (upserts.push(r), { error: null }),
        select: () => query,
      }),
    } as unknown as SupabaseClient
    await syncInbox(client, store, 'test.inbox.cursor')
    expect((upserts[0] as Array<{ id: string }>).map((r) => r.id)).toEqual(['a'])
    expect(store.pending()).toEqual([])
    expect(store.getSnapshot().map((i) => [i.id, i.readAt, i.deviceId])).toEqual([
      ['b', 8, 'gsm'],
      ['a', null, undefined],
    ])
  })

  it('sends the delivery status, and still syncs on an account without the Inbox 2.0 step', async () => {
    const store = new InboxStore(false, undefined, () => 'Pc')
    store.add([makeEvent({ id: 'a', source: 'flow', type: 'flow.ran', at: 5, title: 'A' })], 5)
    const sent: Array<Array<Record<string, unknown>>> = []
    let column = false
    const rows = () => [{ id: 'b', source: 'update', type: 'update.available', title: 'B', body: null, priority: 'normal', link: null, device_id: null, at: 7, read_at: null, archived_at: null, snoozed_until: null, updated_at: 7, synced_at: '2026-11-02T10:00:00Z', ...(column ? { delivery: { Gsm: { seenAt: 8 } } } : {}) }]
    const query = { gt: () => query, order: () => query, limit: async () => ({ data: rows(), error: null }) }
    const client = {
      from: () => ({
        upsert: async (r: Array<Record<string, unknown>>) => {
          sent.push(r)
          return !column && 'delivery' in r[0] ? { error: { code: 'PGRST204', message: "Could not find the 'delivery' column of 'inbox_items'" } } : { error: null }
        },
        select: () => query,
      }),
    } as unknown as SupabaseClient
    let old = 0
    await syncInbox(client, store, 'test.inbox.cursor2', () => old++)
    expect(old).toBeGreaterThan(0)
    expect(sent.map((r) => 'delivery' in r[0])).toEqual([true, false])
    expect(store.pending()).toEqual([])

    column = true
    await syncInbox(client, store, 'test.inbox.cursor3', () => old++)
    // b now also arrived on this pc; that goes up in the next round.
    expect(store.getSnapshot().find((i) => i.id === 'b')?.delivery).toEqual({ Gsm: { seenAt: 8 }, Pc: { seenAt: expect.any(Number) } })
    sent.length = 0
    await syncInbox(client, store, 'test.inbox.cursor3')
    expect(sent[0].map((r) => [r.id, Object.keys(r.delivery as object)])).toEqual([['b', ['Gsm', 'Pc']]])
  })
})
