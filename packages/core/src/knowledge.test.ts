import { describe, expect, it } from 'vitest'
import {
  allTags,
  backlinks,
  cleanTag,
  emptyKnowledge,
  extractLinks,
  mergeKnowledge,
  missingLinks,
  noteRevisions,
  noteTags,
  outgoingLinks,
  parseInline,
  parseKnowledge,
  parseMarkdown,
  recordRevision,
  removeCollection,
  revisionChange,
  saveCollection,
  searchKnowledge,
  setNoteMeta,
  REVISION_GAP_MS,
  type KnowledgeState,
} from './knowledge'
import type { Note } from './notes'

const note = (id: string, title: string, body: string, updatedAt = 1): Note => ({ id, title, body, updatedAt, deletedAt: null })
const ok = (r: KnowledgeState | { error: string }) => {
  if ('error' in r) throw new Error(r.error)
  return r
}
const notes = [
  note('a', 'Wet van Ohm', 'U = R · I. Zie ook [[Kirchhoff]] en [[Weerstanden]]. #elektronica', 3),
  note('b', 'Kirchhoff', 'Stroomwet en spanningswet, net als [[wet van ohm]].', 2),
  note('c', '', 'Losse gedachte over condensatoren', 1),
]

describe('Kennis', () => {
  it('finds links, backlinks and links to notes that do not exist yet', () => {
    expect(extractLinks('[[A]] en [[ B ]] en [[A]]')).toEqual(['A', 'B'])
    expect(outgoingLinks(notes, notes[0]).map((l) => [l.title, l.note?.id ?? null])).toEqual([
      ['Kirchhoff', 'b'],
      ['Weerstanden', null],
    ])
    expect(backlinks(notes, notes[0]).map((n) => n.id)).toEqual(['b'])
    expect(missingLinks(notes)).toEqual([{ title: 'Weerstanden', from: [notes[0]] }])
  })

  it('keeps collections and tags per note and searches the full text', () => {
    let s = ok(saveCollection(emptyKnowledge(), 'k1', 'Elektronica', 1))
    expect(saveCollection(s, 'k2', 'elektronica', 2)).toEqual({ error: 'Die collectie bestaat al.' })
    s = setNoteMeta(s, 'b', { collections: ['k1'], tags: ['#Labo 3', 'wetten'] }, 2)
    expect(noteTags(s, notes[1])).toEqual(['labo-3', 'wetten'])
    expect(noteTags(s, notes[0])).toEqual(['elektronica'])
    expect(allTags(s, notes).map((t) => t.tag)).toEqual(['elektronica', 'labo-3', 'wetten'])
    expect(searchKnowledge(s, notes, 'wet').map((h) => h.note.id)).toEqual(['a', 'b'])
    expect(searchKnowledge(s, notes, 'wet', { collection: 'k1' }).map((h) => h.note.id)).toEqual(['b'])
    expect(searchKnowledge(s, notes, 'condensatoren')[0].snippet).toBe('Losse gedachte over condensatoren')
    expect(searchKnowledge(s, notes, '', { tag: 'elektronica' }).map((h) => h.note.id)).toEqual(['a'])
    s = removeCollection(s, 'k1', 3)
    expect(searchKnowledge(s, notes, '', { collection: 'k1' })).toEqual([])
    expect(cleanTag('  ##Spé cial! ')).toBe('spé-cial')
  })

  it('keeps versions, without a new one for every keystroke', () => {
    const n = note('a', 'Ohm', 'eerste')
    let s = recordRevision(emptyKnowledge(), n, 'r1', 1000)
    s = recordRevision(s, { ...n, body: 'eerste versie' }, 'r2', 2000)
    expect(noteRevisions(s, 'a').map((r) => [r.id, r.body])).toEqual([['r1', 'eerste versie']])
    s = recordRevision(s, { ...n, body: 'tweede' }, 'r3', 2000 + REVISION_GAP_MS)
    s = recordRevision(s, { ...n, body: 'tweede' }, 'r4', 9e9)
    expect(noteRevisions(s, 'a').map((r) => r.id)).toEqual(['r3', 'r1'])
    s = recordRevision(s, { ...n, body: 'derde' }, 'r5', 2001 + REVISION_GAP_MS, true)
    expect(noteRevisions(s, 'a')).toHaveLength(3)
    for (let i = 0; i < 30; i++) s = recordRevision(s, { ...n, body: `v${i}` }, `x${i}`, 1e6 + i * REVISION_GAP_MS)
    expect(noteRevisions(s, 'a')).toHaveLength(20)
    expect(revisionChange('a b c', 'a c d e')).toBe('+2 / −1 woorden')
    const merged = mergeKnowledge(s, recordRevision(emptyKnowledge(), { ...n, body: 'elders' }, 'o1', 5e9))
    expect(noteRevisions(merged, 'a')[0].id).toBe('o1')
    expect(parseKnowledge(JSON.parse(JSON.stringify(merged)))).toEqual(merged)
  })

  it('reads Markdown without ever producing HTML', () => {
    expect(parseMarkdown('# Titel\n\nTekst met **vet** en *schuin*\nnog een regel\n\n- een\n- [[Ohm]]\n1. eerst\n> citaat\n```\n<script>x</script>\n```\n---')).toEqual([
      { type: 'heading', level: 1, inline: [{ t: 'text', text: 'Titel' }] },
      { type: 'paragraph', inline: [{ t: 'text', text: 'Tekst met ' }, { t: 'bold', text: 'vet' }, { t: 'text', text: ' en ' }, { t: 'italic', text: 'schuin' }, { t: 'text', text: ' nog een regel' }] },
      { type: 'list', ordered: false, items: [[{ t: 'text', text: 'een' }], [{ t: 'wiki', text: 'Ohm' }]] },
      { type: 'list', ordered: true, items: [[{ t: 'text', text: 'eerst' }]] },
      { type: 'quote', inline: [{ t: 'text', text: 'citaat' }] },
      { type: 'code', text: '<script>x</script>' },
      { type: 'rule' },
    ])
    expect(parseInline('[site](https://ap.be) [slecht](javascript:alert(1)) `code` #tag')).toEqual([
      { t: 'link', text: 'site', href: 'https://ap.be' },
      { t: 'text', text: ' [slecht](javascript:alert(1)) ' },
      { t: 'code', text: 'code' },
      { t: 'text', text: ' ' },
      { t: 'tag', text: 'tag' },
    ])
  })
})
