import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createProblem, DocStore, startDocSync, syncDoc } from './docStore'

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

describe('syncDoc', () => {
  interface Map {
    revision: number
    items: Record<string, { text: string; at: number }>
  }
  const keepMine = (a: Map, b: Map): Map => ({ revision: Math.max(a.revision, b.revision), items: { ...b.items, ...a.items } })

  it('does not write a new revision when the account holds the same copy in another key order', async () => {
    // What Postgres hands back: jsonb sorts keys by length, so "at" comes before "text".
    const account = { revision: 5, items: { b: { at: 2, text: 'B' }, a: { at: 1, text: 'A' } } }
    const pushes: number[] = []
    const remote = {
      pull: () => Promise.resolve(structuredClone(account)),
      push: (state: Map) => {
        pushes.push(state.revision)
        return Promise.resolve(true)
      },
    }
    const store = new DocStore<Map>('nexus.test.order', (raw) => (raw as Map) ?? { revision: 0, items: {} })
    store.adopt({ revision: 5, items: { a: { text: 'A', at: 1 }, b: { text: 'B', at: 2 } } })
    expect(await syncDoc(store, remote, keepMine)).toBe(5)
    expect(await syncDoc(store, remote, keepMine)).toBe(5)
    expect(pushes).toEqual([])
  })

  it('still pushes a reordered list', async () => {
    const remote = {
      pull: () => Promise.resolve({ revision: 3, items: ['a', 'b'] }),
      push: vi.fn(() => Promise.resolve(true)),
    }
    const store = new DocStore<Doc>('nexus.test.list', parse)
    store.adopt({ revision: 4, items: ['b', 'a'] })
    expect(await syncDoc(store, remote, (a) => a)).toBe(5)
    expect(remote.push).toHaveBeenCalledTimes(1)
  })
})
