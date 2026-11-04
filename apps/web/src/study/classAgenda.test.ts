import { classCopyId } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { lifeStore } = await import('../life/store')
const { classAgendaStore, startClassAgenda, syncClassAgenda } = await import('./classAgenda')

const ME = 'me-1'
const DAY = 86_400_000

/** Just enough of Supabase for the klasagenda: rows per table, filters on eq. */
function fakeClient(tables: Record<string, Array<Record<string, unknown>>>) {
  const query = (table: string) => {
    const filters: Array<[string, unknown]> = []
    let action: 'select' | 'delete' = 'select'
    const builder = {
      select: () => builder,
      order: () => builder,
      eq: (k: string, v: unknown) => (filters.push([k, v]), builder),
      delete: () => ((action = 'delete'), builder),
      upsert: async (row: Record<string, unknown>) => {
        tables[table].push(row)
        return { error: null }
      },
      then: (resolve: (r: unknown) => void) => {
        const match = (r: Record<string, unknown>) => filters.every(([k, v]) => r[k] === v)
        if (action === 'delete') {
          tables[table] = tables[table].filter((r) => !match(r))
          return resolve({ error: null })
        }
        resolve({ data: tables[table].filter(match), error: null })
      },
    }
    return builder
  }
  return { auth: { getSession: async () => ({ data: { session: { user: { id: ME } } } }) }, from: query } as unknown as SupabaseClient
}

describe('klasagenda op Supabase', () => {
  beforeEach(async () => {
    classAgendaStore.reset()
    await lifeStore.reset()
  })

  it('copies the group deadlines of a class team once, and ticks them off both ways', async () => {
    const now = Date.now()
    const tables = {
      study_groups: [
        { id: 'g1', name: 'Klas 1IT3', invite_code: 'A', created_by: 'x', klas: '1IT3', class_open: true },
        { id: 'g2', name: 'Vrienden', invite_code: 'B', created_by: 'x', klas: null, class_open: false },
      ],
      study_group_tasks: [
        { id: 't1', group_id: 'g1', created_by: 'x', title: 'Labo 3 indienen', due_at: now + DAY },
        { id: 't2', group_id: 'g2', created_by: 'x', title: 'Film kiezen', due_at: now + DAY },
      ],
      study_group_task_done: [] as Array<Record<string, unknown>>,
    }
    const client = fakeClient(tables)
    await syncClassAgenda(client, lifeStore, now)
    await syncClassAgenda(client, lifeStore, now)
    const copies = lifeStore.getSnapshot().filter((i) => i.kind === 'deadline')
    expect(copies.map((c) => c.title)).toEqual(['Labo 3 indienen'])
    const copyId = await classCopyId(ME, 't1')
    expect(copies[0].id).toBe(copyId)

    await lifeStore.updateDeadline(copyId, { doneAt: now })
    await syncClassAgenda(client, lifeStore, now)
    expect(tables.study_group_task_done).toEqual([{ task_id: 't1', group_id: 'g1', user_id: ME }])

    tables.study_group_tasks.push({ id: 't3', group_id: 'g1', created_by: 'x', title: 'Toets', due_at: now + 2 * DAY })
    await syncClassAgenda(client, lifeStore, now)
    tables.study_group_tasks = tables.study_group_tasks.filter((t) => t.id !== 't3')
    await syncClassAgenda(client, lifeStore, now)
    expect(lifeStore.getSnapshot().map((i) => i.kind === 'deadline' && i.title)).toEqual(['Labo 3 indienen'])
  })

  it('does not bring back a copy you deleted', async () => {
    const now = Date.now()
    const client = fakeClient({
      study_groups: [{ id: 'g1', name: 'Klas', invite_code: 'A', created_by: 'x', klas: '1IT3', class_open: false }],
      study_group_tasks: [{ id: 't1', group_id: 'g1', created_by: 'x', title: 'Labo', due_at: now + DAY }],
      study_group_task_done: [],
    })
    await syncClassAgenda(client, lifeStore, now)
    await lifeStore.remove(await classCopyId(ME, 't1'))
    await syncClassAgenda(client, lifeStore, now)
    expect(lifeStore.getSnapshot()).toEqual([])
  })

  it('listens live while Teams is on and syncs right after a change', async () => {
    const now = Date.now()
    const tables = {
      study_groups: [{ id: 'g1', name: 'Klas', invite_code: 'A', created_by: 'x', klas: '1IT3', class_open: false }],
      study_group_tasks: [] as Array<Record<string, unknown>>,
      study_group_task_done: [],
    }
    const handlers: Array<() => void> = []
    const channel = { on: (_e: string, _f: unknown, cb: () => void) => (handlers.push(cb), channel), subscribe: () => channel }
    const removeChannel = vi.fn(async () => 'ok')
    const client = Object.assign(fakeClient(tables), {
      channel: vi.fn(() => channel),
      removeChannel,
      auth: { getSession: async () => ({ data: { session: { user: { id: ME } } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    }) as unknown as SupabaseClient
    let on = true
    const listeners = new Set<() => void>()
    const stop = startClassAgenda(client, () => on, (l) => (listeners.add(l), () => listeners.delete(l)), lifeStore)
    expect(handlers).toHaveLength(3)
    tables.study_group_tasks.push({ id: 't1', group_id: 'g1', created_by: 'x', title: 'Live', due_at: now + DAY })
    handlers[0]()
    await vi.waitFor(() => expect(lifeStore.getSnapshot().map((i) => i.kind === 'deadline' && i.title)).toEqual(['Live']), { timeout: 3000 })
    on = false
    for (const l of listeners) l()
    expect(removeChannel).toHaveBeenCalled()
    stop()
  })
})
