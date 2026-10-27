import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import type { Deadline } from '@nexus/core'
import { resetDbConnection } from '../state/db'
import { fireDeadlineNotices } from './alerts'
import { LifeStore } from './store'
import { fromRow, toRow } from './sync'

const due = new Date(2026, 10, 3, 23, 59).getTime()

describe('NEXUS Life on this device', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
    resetDbConnection()
    localStorage.clear()
  })

  it('keeps deadlines and projects offline and marks them for the sync', async () => {
    const store = new LifeStore()
    const project = await store.addProject('Elektronica', 'green')
    const id = await store.addDeadline({ title: 'Verslag labo 3', dueAt: due, projectId: project, notes: '', remind: [1440], target: 'phone' })
    await store.updateDeadline(id, { doneAt: due - 1000 })
    expect(store.dirtyIds().sort()).toEqual([id, project].sort())

    const reopened = new LifeStore()
    await reopened.ready
    const saved = reopened.getSnapshot().find((i) => i.id === id) as Deadline
    expect(saved.doneAt).toBe(due - 1000)
    expect(reopened.dirtyIds()).toHaveLength(2)

    // Deleting a project keeps its deadlines, without a project.
    await reopened.remove(project)
    expect(reopened.getSnapshot().map((i) => i.id)).toEqual([id])
    expect((reopened.getSnapshot()[0] as Deadline).projectId).toBeNull()
  })

  it('stores each item as one database row and reads it back', () => {
    const d: Deadline = { kind: 'deadline', id: 'a', title: 'Taak', dueAt: due, projectId: null, notes: 'n', doneAt: null, remind: [60], target: 'this_device', updatedAt: 5, deletedAt: null }
    const row = toRow(d)
    expect(row).toEqual({ id: 'a', kind: 'deadline', updated_at: 5, deleted_at: null, data: { title: 'Taak', dueAt: due, projectId: null, notes: 'n', doneAt: null, remind: [60], target: 'this_device' } })
    // Postgres bigints can come back as strings.
    expect(fromRow({ ...row, updated_at: '5' as never, synced_at: '' })).toEqual(d)
    expect(fromRow({ ...row, kind: 'deadline', data: { title: 'x' }, synced_at: '' })).toBeNull()
  })

  it('notifies once per reminder, on the phone only when asked, and catches up briefly', async () => {
    const base = { kind: 'deadline' as const, projectId: null, notes: '', doneAt: null, updatedAt: 1, deletedAt: null }
    const items: Deadline[] = [
      { ...base, id: 'p', title: 'Gsm', dueAt: due, remind: [60], target: 'phone' },
      { ...base, id: 'l', title: 'Hier', dueAt: due, remind: [60], target: 'this_device' },
      { ...base, id: 'd', title: 'Klaar', dueAt: due, remind: [60], target: 'phone', doneAt: 1 },
    ]
    const effects = { local: vi.fn(async () => {}), phones: vi.fn(async () => {}) }
    const at = due - 60 * 60_000
    expect(await fireDeadlineNotices(items, effects, at - 60_000)).toBe(0)
    expect(await fireDeadlineNotices(items, effects, at + 30_000)).toBe(2)
    expect(effects.local).toHaveBeenCalledTimes(2)
    expect(effects.phones).toHaveBeenCalledTimes(1)
    expect(effects.phones).toHaveBeenCalledWith('Deadline over 1 uur: Gsm', expect.stringContaining('Tegen'), `deadline:p@${due}-60`)
    // Already sent: the next check sends nothing again.
    expect(await fireDeadlineNotices(items, effects, at + 60_000)).toBe(0)

    // A device that was off for a day does not send day-old notices.
    localStorage.clear()
    expect(await fireDeadlineNotices(items, effects, at + 24 * 60 * 60_000)).toBe(0)
  })
})
