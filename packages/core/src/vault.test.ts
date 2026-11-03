import { describe, expect, it } from 'vitest'
import type { FileMeta } from './files'
import {
  addCollection,
  addLink,
  addShare,
  addVersion,
  activeShares,
  checkShareSeconds,
  daysLeftInTrash,
  emptyVault,
  expiredTrash,
  filesLinkedTo,
  forgetFiles,
  mergeVault,
  parseVault,
  restoreFile,
  setInCollection,
  setTags,
  trashFile,
  vaultTags,
  vaultView,
  versionsOf,
  type VaultState,
} from './vault'

const DAY = 86_400_000
const file = (id: string, addedAt: number, name = `${id}.pdf`): FileMeta => ({ id, name, mediaType: 'application/pdf', size: 10, addedAt })
const ok = (s: VaultState | { error: string }) => {
  if ('error' in s) throw new Error(s.error)
  return s
}

describe('vault', () => {
  const files = [file('a', 1), file('b', 2), file('a2', 3, 'a-v2.pdf')]

  it('shows one entry per chain, the newest version, with the first file’s tags', () => {
    let s = setTags(emptyVault(), 'a', ['#Examen', 'wiskunde', 'examen', ''], 5)
    s = addVersion(s, 'a2', 'a', 6)
    const view = vaultView(s, files)
    expect(view.map((e) => [e.file.id, e.versions])).toEqual([['a2', 1], ['b', 0]])
    expect(view[0].meta.tags).toEqual(['examen', 'wiskunde'])
    // Tagging the newest version changes the chain.
    s = setTags(s, 'a2', ['samenvatting'], 7)
    expect(vaultView(s, files, { tag: 'samenvatting' }).map((e) => e.file.id)).toEqual(['a2'])
    expect(versionsOf(s, files, 'a').map((f) => f.id)).toEqual(['a2', 'a'])
    expect(vaultTags(s, files)).toEqual([{ tag: 'samenvatting', count: 1 }])
  })

  it('searches names, tags and links, and filters on a collection', () => {
    let s = ok(addCollection(emptyVault(), 'c1', 'Examens', 1))
    expect(addCollection(s, 'c2', 'examens', 2)).toEqual({ error: 'Er is al een verzameling "examens".' })
    s = setInCollection(s, 'b', 'c1', true, 2)
    s = addLink(s, 'b', { kind: 'project', id: 'p1', title: 'Labo netwerken' }, 3)
    s = addLink(s, 'b', { kind: 'project', id: 'p1', title: 'Labo netwerken' }, 4)
    expect(vaultView(s, files, { collection: 'c1' }).map((e) => e.file.id)).toEqual(['b'])
    expect(vaultView(s, files, { query: 'labo' }).map((e) => e.file.id)).toEqual(['b'])
    expect(vaultView(s, files).find((e) => e.file.id === 'b')?.meta.links).toHaveLength(1)
    expect(filesLinkedTo(s, files, 'project', 'p1').map((f) => f.id)).toEqual(['b'])
  })

  it('keeps the trash for 30 days, then removes the whole chain', () => {
    let s = addVersion(emptyVault(), 'a2', 'a', 1)
    s = trashFile(s, 'a2', 10 * DAY)
    expect(vaultView(s, files).map((e) => e.file.id)).toEqual(['b'])
    expect(vaultView(s, files, { trash: true }).map((e) => e.file.id)).toEqual(['a2'])
    expect(daysLeftInTrash(10 * DAY, 15 * DAY)).toBe(25)
    expect(expiredTrash(s, files, 39 * DAY)).toEqual([])
    expect(expiredTrash(s, files, 41 * DAY).sort()).toEqual(['a', 'a2'])
    expect(vaultView(restoreFile(s, 'a', 11 * DAY), files).map((e) => e.file.id)).toEqual(['a2', 'b'])
    expect(forgetFiles(s, ['a', 'a2']).files).toEqual([])
  })

  it('merges per file with the newest change winning', () => {
    const a = setTags(emptyVault(), 'x', ['een'], 5)
    const b = setTags({ ...emptyVault(), revision: 3 }, 'x', ['twee'], 9)
    const m = mergeVault(a, b)
    expect(m.files[0].tags).toEqual(['twee'])
    expect(m.revision).toBe(3)
  })

  it('remembers shares without their link and only allows short durations', () => {
    const s = addShare(emptyVault(), { id: 's1', fileId: 'a', fileName: 'a.pdf', createdAt: 1, expiresAt: 100 })
    expect(activeShares(s, 50)).toHaveLength(1)
    expect(activeShares(s, 100)).toHaveLength(0)
    expect(JSON.stringify(s)).not.toContain('http')
    expect(checkShareSeconds(3600)).toBe(true)
    expect(checkShareSeconds(365 * 86_400)).toBe(false)
  })

  it('parses only what fits', () => {
    const s = parseVault({ files: [{ id: 'a', tags: ['x', 'x', 3], links: [{ kind: 'evil', id: 'z' }, { kind: 'note', id: 'n', title: 'T' }] }, { nope: 1 }], collections: [{ id: 'c', name: 'C' }], shares: [{ id: 's', fileId: 'a', createdAt: 1, expiresAt: 2 }], revision: 4 })
    expect(s.files).toEqual([{ id: 'a', tags: ['x'], collections: [], links: [{ kind: 'note', id: 'n', title: 'T' }], versionOf: null, trashedAt: null, updatedAt: 0 }])
    expect(s.collections).toHaveLength(1)
    expect(s.shares).toHaveLength(1)
    expect(parseVault('junk')).toEqual(emptyVault())
  })
})
