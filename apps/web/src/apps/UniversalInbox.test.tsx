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
    const snooze = screen.getByRole('combobox', { name: 'Snoozen' }) as HTMLSelectElement
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

  it('lets a source be kept out', () => {
    render(<UniversalInbox />)
    fireEvent.click(screen.getByText('Wat in de Inbox komt'))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Updates' }))
    inboxStore.add([makeEvent({ id: 'ui:update2', source: 'update', type: 'update.available', at: now, title: 'Versie 1.1' })])
    expect(inboxStore.getSnapshot().some((i) => i.id === 'ui:update2')).toBe(false)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Updates' }))
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
})
