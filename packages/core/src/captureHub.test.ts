import { describe, expect, it } from 'vitest'
import {
  addToInbox,
  emptyCaptures,
  firstLink,
  guessInboxKind,
  liveTemplates,
  mergeCaptures,
  parseCaptures,
  removeCapture,
  saveTemplate,
  sortCapture,
  tidyCaptures,
  unsorted,
} from './captureHub'

const DAY = 24 * 60 * 60_000

describe('Snel vastleggen 2.0', () => {
  it('keeps captures to sort later, guesses what they are and logs them', () => {
    let s = addToInbox(emptyCaptures(), 'https://example.com/les', 'a', 1)
    s = addToInbox(s, 'Idee: samenvatting per hoofdstuk', 'b', 2)
    expect(unsorted(s).map((i) => [i.id, i.kind])).toEqual([
      ['b', 'idea'],
      ['a', 'link'],
    ])
    expect(s.history.map((h) => h.to)).toEqual(['later', 'later'])
    s = sortCapture(s, 'b', 'note', 3)
    expect(unsorted(s).map((i) => i.id)).toEqual(['a'])
    expect(s.history[0]).toMatchObject({ to: 'note', title: 'Idee: samenvatting per hoofdstuk' })
    s = removeCapture(s, 'a', 4)
    expect(unsorted(s)).toEqual([])
  })

  it('reads links and kinds', () => {
    expect(guessInboxKind('Taak: boeken kaften')).toBe('task')
    expect(guessInboxKind('Lees dit\nhttps://x.be')).toBe('link')
    expect(guessInboxKind('gewoon tekst')).toBe('text')
    expect(firstLink('zie https://ap.be/les3, en meer')).toBe('https://ap.be/les3')
    expect(firstLink('javascript:alert(1)')).toBeNull()
  })

  it('merges two devices entry by entry and drops old sorted ones after 30 days', () => {
    const base = addToInbox(emptyCaptures(), 'Eén', 'a', 1)
    const pc = sortCapture(base, 'a', 'deadline', 5)
    const phone = addToInbox(base, 'Twee', 'b', 3)
    const merged = mergeCaptures(pc, phone)
    expect(unsorted(merged).map((i) => i.id)).toEqual(['b'])
    expect(merged.history.length).toBe(3)
    const later = tidyCaptures(merged, 5 + 31 * DAY)
    expect(later.inbox.map((i) => i.id)).toEqual(['b'])
  })

  it('has starter templates and validates new ones', () => {
    const s = emptyCaptures()
    expect(liveTemplates(s).length).toBe(3)
    expect(saveTemplate(s, { id: 'x', name: ' ', text: 'a', target: 'note' }, 1)).toEqual({ error: 'Geef het sjabloon een naam.' })
    const next = saveTemplate(s, { id: 'x', name: 'Boodschappen', text: 'Melk', target: 'reminder' }, 1)
    expect('error' in next ? null : liveTemplates(next).map((t) => t.name)).toContain('Boodschappen')
  })

  it('parses stored data defensively', () => {
    expect(parseCaptures(null)).toEqual(emptyCaptures())
    const parsed = parseCaptures({ inbox: [{ id: 'a', createdAt: 1, kind: 'weird', text: 5 }, { id: 'b' }], templates: [], history: [{ id: 'h', at: 1, to: 'nope' }], revision: 4 })
    expect(parsed.inbox).toEqual([{ id: 'a', kind: 'text', text: '', createdAt: 1, sortedTo: null, updatedAt: 1, deletedAt: null }])
    expect(parsed.templates).toEqual([])
    expect(parsed.history).toEqual([])
    expect(parsed.revision).toBe(4)
  })
})
