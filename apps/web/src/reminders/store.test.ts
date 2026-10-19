import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { getAll, resetDbConnection } from '../state/db'
import { RemindersStore } from './store'

describe('RemindersStore', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
    resetDbConnection()
  })

  it('fires due reminders once, repeats the repeating ones and keeps them offline', async () => {
    const store = new RemindersStore()
    const nine = new Date(2026, 9, 20, 9, 0).getTime()
    await store.add({ title: 'Eenmalig', at: nine, repeat: 'none', target: 'this_device' })
    await store.add({ title: 'Dagelijks', at: nine, repeat: 'daily', target: 'phone' })
    await store.add({ title: 'Later', at: nine + 3600_000, repeat: 'none', target: 'phone' })

    const fired: string[] = []
    expect(await store.fireDue(async (r) => void fired.push(r.title), nine)).toBe(2)
    expect(fired.sort()).toEqual(['Dagelijks', 'Eenmalig'])
    expect(store.getSnapshot().map((r) => r.title)).toEqual(['Later', 'Dagelijks'])
    expect(await store.fireDue(async (r) => void fired.push(r.title), nine)).toBe(0)

    const reopened = new RemindersStore()
    await reopened.ready
    expect((await getAll('reminders')).length).toBe(2)
    expect(reopened.getSnapshot()[1].at).toBe(new Date(2026, 9, 21, 9, 0).getTime())
  })

  it('moves on even when sending fails, so a broken reminder does not repeat every tick', async () => {
    const store = new RemindersStore()
    const at = Date.now() - 1000
    await store.add({ title: 'Kapot', at, repeat: 'none', target: 'phone' })
    await store.fireDue(async () => {
      throw new Error('Geen gsm gekoppeld.')
    })
    expect(store.getSnapshot()).toHaveLength(0)
  })
})
