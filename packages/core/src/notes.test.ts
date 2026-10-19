import { describe, expect, it } from 'vitest'
import { createNote, noteTitle, parseNotes, sortNotes } from './notes'

describe('notes', () => {
  it('derives a title from the body when none is set', () => {
    const note = { ...createNote(1, 'a'), body: 'Boodschappen\nmelk' }
    expect(noteTitle(note)).toBe('Boodschappen')
    expect(noteTitle(createNote(1, 'b'))).toBe('Naamloze notitie')
  })

  it('sorts newest first', () => {
    const notes = [createNote(1, 'old'), createNote(5, 'new')]
    expect(sortNotes(notes).map((n) => n.id)).toEqual(['new', 'old'])
  })

  it('ignores corrupt or malformed storage', () => {
    expect(parseNotes('not json')).toEqual([])
    expect(parseNotes('{"a":1}')).toEqual([])
    expect(parseNotes(JSON.stringify([createNote(1, 'ok'), { id: 3 }]))).toHaveLength(1)
  })

  it('upgrades v0.2 notes without deletedAt and hides tombstones', () => {
    const [old] = parseNotes(JSON.stringify([{ id: 'a', title: 't', body: '', updatedAt: 1 }]))
    expect(old.deletedAt).toBeNull()
    expect(sortNotes([old, { ...createNote(2, 'b'), deletedAt: 3 }]).map((n) => n.id)).toEqual(['a'])
  })
})
