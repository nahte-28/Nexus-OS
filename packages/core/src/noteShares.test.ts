import { describe, expect, it } from 'vitest'
import { parseShares, planOwnerSync, shareLine, shareOfNote, sharedWithMe, type NoteShare } from './noteShares'
import type { Note } from './notes'

const share: NoteShare = { id: 's1', right: 'owner', noteId: 'n1', ownerName: 'Ethan', title: 'Samenvatting', body: 'H1', revision: 3, updatedAt: 1000, updatedByMe: true, updatedByName: 'Ethan', access: [{ user: 'u2', group: null, name: 'Remo', canEdit: true }] }
const note = (patch: Partial<Note> = {}): Note => ({ id: 'n1', title: 'Samenvatting', body: 'H1', updatedAt: 900, deletedAt: null, ...patch })

describe('Notities delen', () => {
  it('reads the list from the server and drops broken rows', () => {
    const list = parseShares([
      { ...share, updatedAt: '1970-01-01T00:00:01Z' },
      { ...share, id: 'x', right: 'boss' },
      { ...share, id: 'y', right: 'owner', noteId: null },
      { ...share, id: 'z', right: 'read', noteId: 'n9', access: [{ user: 'u2', group: null, name: 'Remo', canEdit: true }] },
    ])
    expect(list.map((s) => s.id)).toEqual(['s1', 'z'])
    expect(list[0]).toEqual(share)
    // Someone who only reads never sees your note's id or who else has it.
    expect(list[1]).toMatchObject({ noteId: null, access: [] })
  })

  it('does nothing when both sides are the same, and remembers that', () => {
    expect(planOwnerSync([share], [note()], {}, 5000)).toEqual({ pull: [], push: [], stop: [], seen: { s1: { revision: 3, syncedAt: 5000 } } })
  })

  it('sends your change and takes over a change of someone else', () => {
    const seen = { s1: { revision: 3, syncedAt: 1000 } }
    // You typed in your note.
    expect(planOwnerSync([share], [note({ body: 'H1 en H2', updatedAt: 2000 })], seen, 3000).push).toEqual([{ share: 's1', revision: 3, title: 'Samenvatting', body: 'H1 en H2' }])
    // Remo saved revision 4.
    const theirs = { ...share, body: 'H1 (Remo)', revision: 4, updatedAt: 2500, updatedByMe: false, updatedByName: 'Remo' }
    expect(planOwnerSync([theirs], [note()], seen, 3000).pull).toEqual([{ share: 's1', note: 'n1', title: 'Samenvatting', body: 'H1 (Remo)' }])
  })

  it('lets the newest edit win when both changed, also on a new device', () => {
    const seen = { s1: { revision: 3, syncedAt: 1000 } }
    const theirs = { ...share, body: 'Remo', revision: 4, updatedAt: 2500 }
    expect(planOwnerSync([theirs], [note({ body: 'Ik', updatedAt: 3000 })], seen, 4000).push).toHaveLength(1)
    expect(planOwnerSync([theirs], [note({ body: 'Ik', updatedAt: 2000 })], seen, 4000).pull).toHaveLength(1)
    expect(planOwnerSync([theirs], [note({ body: 'Ik', updatedAt: 2000 })], {}, 4000).pull).toHaveLength(1)
  })

  it('stops sharing a deleted note and waits for a note that is not here yet', () => {
    expect(planOwnerSync([share], [note({ deletedAt: 5 })], {}, 1).stop).toEqual(['s1'])
    expect(planOwnerSync([share], [], { s1: { revision: 3, syncedAt: 1 } }, 2)).toEqual({ pull: [], push: [], stop: [], seen: { s1: { revision: 3, syncedAt: 1 } } })
    // Not yours: never synced with a note.
    expect(planOwnerSync([{ ...share, right: 'edit', noteId: null }], [note({ body: 'x' })], {}, 1)).toEqual({ pull: [], push: [], stop: [], seen: {} })
  })

  it('lists what others share with you and says who saved', () => {
    const mine = { ...share, id: 's2', right: 'read' as const, noteId: null, ownerName: 'Remo', updatedByMe: false, updatedByName: 'Lotte', updatedAt: 5 }
    expect(sharedWithMe([share, mine]).map((s) => s.id)).toEqual(['s2'])
    expect(shareOfNote([share], 'n1')?.id).toBe('s1')
    expect(shareLine(share)).toBe('Je deelt deze notitie · laatst bewaard door jou')
    expect(shareLine(mine)).toBe('Van Remo, alleen lezen · laatst bewaard door Lotte')
  })
})
