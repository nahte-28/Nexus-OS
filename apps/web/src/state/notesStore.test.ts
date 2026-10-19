import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { resetDbConnection } from './db'
import { NotesStore } from './notesStore'

describe('NotesStore', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
    resetDbConnection()
    localStorage.clear()
  })

  it('keeps notes and pending changes across reloads', async () => {
    const first = new NotesStore()
    await first.ready
    const id = first.add()
    first.update(id, { body: 'offline geschreven' })
    first.remove(first.add())
    await first.commit({ upserts: [], cleanIds: [], cursor: 'c1' })

    const reloaded = new NotesStore()
    await reloaded.ready
    expect(reloaded.getSnapshot().map((n) => n.body)).toEqual(['offline geschreven'])
    expect(reloaded.dirtyIds()).toHaveLength(2) // the deletion is queued too
    expect(reloaded.cursor()).toBe('c1')
  })

  it('imports v0.2 notes from localStorage once and queues them for upload', async () => {
    localStorage.setItem('nexus.notes', JSON.stringify([{ id: 'old', title: 'Oud', body: '', updatedAt: 1 }]))
    const store = new NotesStore()
    await store.ready
    expect(store.getSnapshot().map((n) => n.id)).toEqual(['old'])
    expect(store.dirtyIds()).toEqual(['old'])
    expect(localStorage.getItem('nexus.notes')).toBeNull()
  })

  it('applies synced changes and clears the queue', async () => {
    const store = new NotesStore()
    await store.ready
    const id = store.add()
    const remote = { id: 'r', title: 'Van gsm', body: '', updatedAt: 5, deletedAt: null }
    await store.commit({ upserts: [remote], cleanIds: [id], cursor: 'c2' })
    expect(store.dirtyIds()).toEqual([])
    expect(store.getSnapshot().map((n) => n.title)).toContain('Van gsm')
  })

  it('wipes local data on reset', async () => {
    const store = new NotesStore()
    await store.ready
    store.add()
    await store.reset()
    const reloaded = new NotesStore()
    await reloaded.ready
    expect(reloaded.getSnapshot()).toEqual([])
  })
})
