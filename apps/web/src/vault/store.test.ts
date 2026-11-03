import { describe, expect, it, vi } from 'vitest'
import { addVersion, emptyVault, parseVault, trashFile, type FileMeta } from '@nexus/core'
import type { FilesStore } from '../files/store'
import { DocStore } from '../state/docStore'
import { deleteForGood, emptyExpiredTrash } from './store'

const DAY = 86_400_000
const file = (id: string, addedAt: number): FileMeta => ({ id, name: `${id}.pdf`, mediaType: 'application/pdf', size: 1, addedAt })

function fakeFiles(list: FileMeta[]) {
  const remove = vi.fn(async () => {})
  const files = { ready: Promise.resolve(), getSnapshot: () => list, remove } as unknown as FilesStore
  return { files, remove }
}

describe('Vault store', () => {
  it('empties chains that are 30 days in the trash, with all versions', async () => {
    const store = new DocStore('test.vault', parseVault)
    store.update(() => trashFile(addVersion(emptyVault(), 'a2', 'a', 1), 'a', 1 * DAY))
    const { files, remove } = fakeFiles([file('a', 1), file('a2', 2), file('b', 3)])
    expect(await emptyExpiredTrash(20 * DAY, files, store)).toBe(0)
    expect(await emptyExpiredTrash(32 * DAY, files, store)).toBe(2)
    expect(remove.mock.calls.map((c) => (c as unknown[])[0]).sort()).toEqual(['a', 'a2'])
    expect(store.getSnapshot().files).toEqual([])
  })

  it('deletes for good on request', async () => {
    const store = new DocStore('test.vault2', parseVault)
    store.update(() => trashFile(emptyVault(), 'b', 5))
    const { files, remove } = fakeFiles([file('b', 1)])
    await deleteForGood(['b'], 6, files, store)
    expect(remove).toHaveBeenCalledWith('b', 6)
    expect(store.getSnapshot().files).toEqual([])
  })
})
