import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createProblem, DocStore, startDocSync } from './docStore'

interface Doc {
  revision: number
  items: string[]
}

const parse = (raw: unknown): Doc => {
  const r = (raw ?? {}) as Partial<Doc>
  return { revision: typeof r.revision === 'number' ? r.revision : 0, items: Array.isArray(r.items) ? r.items : [] }
}

/** A Supabase client with one signed-in user, one user_settings row and a realtime channel. */
function fakeClient(row: { key: string; value: Doc; revision: number }) {
  let listener: ((payload: unknown) => void) | null = null
  const pulls = vi.fn()
  const channel = {
    on: (_t: string, _f: unknown, cb: (payload: unknown) => void) => {
      listener = cb
      return channel
    },
    subscribe: () => channel,
  }
  const client = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: () => ({
      select: () => ({
        in: (_col: string, keys: string[]) => {
          pulls(keys)
          return Promise.resolve({ data: keys.includes(row.key) ? [row] : [], error: null })
        },
      }),
      upsert: (value: { revision: number }) => ({ select: () => Promise.resolve({ data: [{ revision: value.revision }], error: null }) }),
    }),
    channel: () => channel,
    removeChannel: () => Promise.resolve('ok'),
  }
  return { client: client as unknown as SupabaseClient, pulls, emit: (payload: unknown) => listener?.(payload), row }
}

const settle = () => new Promise((r) => setTimeout(r, 60))

afterEach(() => localStorage.clear())

describe('startDocSync', () => {
  it('syncs right away when another device changes this document, and not for other documents', async () => {
    const remote = fakeClient({ key: 'goals', value: { revision: 1, items: ['a'] }, revision: 1 })
    const store = new DocStore<Doc>('nexus.test.goals', parse)
    const stop = startDocSync(remote.client, store, { key: 'goals', parse, merge: (_a, b) => b, migration: 'x.sql', problem: createProblem(), label: 'Doelen' })
    await settle()
    expect(store.getSnapshot().items).toEqual(['a'])
    const before = remote.pulls.mock.calls.length

    // Someone else's document changed: nothing to do here.
    remote.emit({ eventType: 'UPDATE', new: { key: 'habits' } })
    await settle()
    expect(remote.pulls.mock.calls.length).toBe(before)

    // This document changed on the phone: pulled and shown at once.
    remote.row.value = { revision: 2, items: ['a', 'b'] }
    remote.row.revision = 2
    remote.emit({ eventType: 'UPDATE', new: { key: 'goals' } })
    await settle()
    expect(remote.pulls.mock.calls.length).toBe(before + 1)
    expect(store.getSnapshot().items).toEqual(['a', 'b'])
    stop()
  })
})
