/**
 * Kennis (Knowledge): a searchable knowledge base on top of Notities. The notes stay the notes you
 * already have (offline, synced); Kennis adds collections, tags, links between notes ([[Titel]]),
 * a version history and Markdown. One document per account (user_settings key 'knowledge').
 * Pure logic.
 */
import { noteTitle, type Note } from './notes'

export interface KnowledgeCollection {
  id: string
  name: string
  updatedAt: number
  deletedAt: number | null
}

export interface NoteMeta {
  /** The id of the note. */
  id: string
  collections: string[]
  tags: string[]
  updatedAt: number
}

export interface NoteRevision {
  id: string
  noteId: string
  at: number
  title: string
  body: string
}

export interface KnowledgeState {
  collections: KnowledgeCollection[]
  meta: NoteMeta[]
  revisions: NoteRevision[]
  revision: number
}

export const MAX_COLLECTIONS = 50
export const MAX_REVISIONS_PER_NOTE = 20
const MAX_REVISIONS = 400
const MAX_BODY = 20_000
const MAX_TAGS = 20
/** A new version only when the last one is at least this old, so typing does not fill the history. */
export const REVISION_GAP_MS = 2 * 60_000

export const emptyKnowledge = (): KnowledgeState => ({ collections: [], meta: [], revisions: [], revision: 0 })

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const list = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null && typeof i.id === 'string') : [])
const strings = (x: unknown, max: number) => (Array.isArray(x) ? [...new Set(x.filter((s): s is string => typeof s === 'string' && s.length > 0))].slice(0, max) : [])

/** "#Labo 3" → "labo-3": lower case, no spaces, at most 40 characters. */
export function cleanTag(tag: string): string {
  return tag.trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 40)
}

export function parseKnowledge(raw: unknown): KnowledgeState {
  if (typeof raw !== 'object' || raw === null) return emptyKnowledge()
  const v = raw as Record<string, unknown>
  const collections = list(v.collections).map((c) => ({ id: c.id as string, name: str(c.name, 60), updatedAt: num(c.updatedAt) ?? 0, deletedAt: num(c.deletedAt) }))
  const meta = list(v.meta).map((m) => ({ id: m.id as string, collections: strings(m.collections, MAX_COLLECTIONS), tags: strings(m.tags, MAX_TAGS).map(cleanTag).filter(Boolean), updatedAt: num(m.updatedAt) ?? 0 }))
  const revisions = list(v.revisions).flatMap((r): NoteRevision[] => {
    const at = num(r.at)
    return at === null || typeof r.noteId !== 'string' ? [] : [{ id: r.id as string, noteId: r.noteId, at, title: str(r.title, 200), body: str(r.body, MAX_BODY) }]
  })
  return { collections, meta, revisions: trimRevisions(revisions), revision: num(v.revision) ?? 0 }
}

/** Newest first, at most [MAX_REVISIONS_PER_NOTE] per note and [MAX_REVISIONS] in all. */
function trimRevisions(revisions: NoteRevision[]): NoteRevision[] {
  const perNote = new Map<string, number>()
  return [...revisions]
    .sort((a, b) => b.at - a.at)
    .filter((r) => {
      const n = (perNote.get(r.noteId) ?? 0) + 1
      perNote.set(r.noteId, n)
      return n <= MAX_REVISIONS_PER_NOTE
    })
    .slice(0, MAX_REVISIONS)
}

function mergeById<T extends { id: string; updatedAt: number }>(a: T[], b: T[]): T[] {
  const byId = new Map(a.map((x) => [x.id, x]))
  for (const x of b) {
    const mine = byId.get(x.id)
    if (!mine || x.updatedAt > mine.updatedAt) byId.set(x.id, x)
  }
  return [...byId.values()]
}

export function mergeKnowledge(a: KnowledgeState, b: KnowledgeState): KnowledgeState {
  const revisions = new Map([...a.revisions, ...b.revisions].map((r) => [r.id, r]))
  return {
    collections: mergeById(a.collections, b.collections),
    meta: mergeById(a.meta, b.meta),
    revisions: trimRevisions([...revisions.values()]),
    revision: Math.max(a.revision, b.revision),
  }
}

// Collections and tags ------------------------------------------------------------------------------

export const liveCollections = (s: KnowledgeState) => s.collections.filter((c) => c.deletedAt === null).sort((a, b) => a.name.localeCompare(b.name, 'nl'))

export function noteMeta(s: KnowledgeState, noteId: string): NoteMeta {
  return s.meta.find((m) => m.id === noteId) ?? { id: noteId, collections: [], tags: [], updatedAt: 0 }
}

export function saveCollection(s: KnowledgeState, id: string, name: string, now: number): KnowledgeState | { error: string } {
  const clean = name.trim().slice(0, 60)
  if (!clean) return { error: 'Geef de collectie een naam.' }
  const exists = s.collections.some((c) => c.id === id)
  if (!exists && liveCollections(s).length >= MAX_COLLECTIONS) return { error: `Hoogstens ${MAX_COLLECTIONS} collecties.` }
  if (liveCollections(s).some((c) => c.id !== id && c.name.toLowerCase() === clean.toLowerCase())) return { error: 'Die collectie bestaat al.' }
  const entry = { id, name: clean, updatedAt: now, deletedAt: null }
  return { ...s, collections: exists ? s.collections.map((c) => (c.id === id ? entry : c)) : [...s.collections, entry] }
}

/** Removes a collection; its notes stay. */
export function removeCollection(s: KnowledgeState, id: string, now: number): KnowledgeState {
  return {
    ...s,
    collections: s.collections.map((c) => (c.id === id ? { ...c, deletedAt: now, updatedAt: now } : c)),
    meta: s.meta.map((m) => (m.collections.includes(id) ? { ...m, collections: m.collections.filter((c) => c !== id), updatedAt: now } : m)),
  }
}

export function setNoteMeta(s: KnowledgeState, noteId: string, patch: Partial<Pick<NoteMeta, 'collections' | 'tags'>>, now: number): KnowledgeState {
  const old = noteMeta(s, noteId)
  const next: NoteMeta = {
    id: noteId,
    collections: [...new Set(patch.collections ?? old.collections)].slice(0, MAX_COLLECTIONS),
    tags: [...new Set((patch.tags ?? old.tags).map(cleanTag).filter(Boolean))].slice(0, MAX_TAGS),
    updatedAt: now,
  }
  return { ...s, meta: s.meta.some((m) => m.id === noteId) ? s.meta.map((m) => (m.id === noteId ? next : m)) : [...s.meta, next] }
}

/** Tags of a note: the ones given in Kennis plus every #tag in its text. */
export function noteTags(s: KnowledgeState, note: Note): string[] {
  const inline = [...note.body.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]{2,40})/gu)].map((m) => cleanTag(m[1]))
  return [...new Set([...noteMeta(s, note.id).tags, ...inline])].sort()
}

export function allTags(s: KnowledgeState, notes: Note[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>()
  for (const n of notes) if (n.deletedAt === null) for (const t of noteTags(s, n)) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

// Links ---------------------------------------------------------------------------------------------

/** The titles in [[…]] in [body], in order, once each. */
export function extractLinks(body: string): string[] {
  return [...new Set([...body.matchAll(/\[\[([^[\]\n]{1,120})\]\]/g)].map((m) => m[1].trim()).filter(Boolean))]
}

const key = (title: string) => title.trim().toLowerCase()

/** The note with this title (as Notities shows it), newest first when there are more. */
export function findNote(notes: Note[], title: string): Note | null {
  const k = key(title)
  return notes.filter((n) => n.deletedAt === null && key(noteTitle(n)) === k).sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
}

export function outgoingLinks(notes: Note[], note: Note): Array<{ title: string; note: Note | null }> {
  return extractLinks(note.body).map((title) => ({ title, note: findNote(notes, title) }))
}

/** The notes that link to [note]. */
export function backlinks(notes: Note[], note: Note): Note[] {
  const k = key(noteTitle(note))
  return notes.filter((n) => n.id !== note.id && n.deletedAt === null && extractLinks(n.body).some((t) => key(t) === k)).sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Links that point to no note yet, with the notes that use them. */
export function missingLinks(notes: Note[]): Array<{ title: string; from: Note[] }> {
  const out = new Map<string, { title: string; from: Note[] }>()
  for (const n of notes) {
    if (n.deletedAt !== null) continue
    for (const l of outgoingLinks(notes, n)) {
      if (l.note) continue
      const entry = out.get(key(l.title)) ?? { title: l.title, from: [] }
      entry.from.push(n)
      out.set(key(l.title), entry)
    }
  }
  return [...out.values()].sort((a, b) => a.title.localeCompare(b.title, 'nl'))
}

// Search --------------------------------------------------------------------------------------------

export interface KnowledgeHit {
  note: Note
  /** A piece of text around the first match. */
  snippet: string
  score: number
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * Full-text search: every word must appear in the title, the text or the tags. Title matches count
 * more. [collection] and [tag] narrow the notes first; an empty query lists them, newest first.
 */
export function searchKnowledge(s: KnowledgeState, notes: Note[], query: string, filter: { collection?: string | null; tag?: string | null } = {}): KnowledgeHit[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  const out: KnowledgeHit[] = []
  for (const note of notes) {
    if (note.deletedAt !== null) continue
    if (filter.collection && !noteMeta(s, note.id).collections.includes(filter.collection)) continue
    const tags = noteTags(s, note)
    if (filter.tag && !tags.includes(filter.tag)) continue
    const title = fold(noteTitle(note))
    const body = fold(note.body)
    const tagText = tags.join(' ')
    if (!words.every((w) => title.includes(w) || body.includes(w) || tagText.includes(w))) continue
    const score = words.reduce((sum, w) => sum + (title.includes(w) ? 3 : 0) + (tagText.includes(w) ? 2 : 0) + (body.includes(w) ? 1 : 0), 0)
    const first = words.length > 0 ? Math.min(...words.map((w) => body.indexOf(w)).filter((i) => i >= 0)) : 0
    const start = Number.isFinite(first) ? Math.max(0, first - 40) : 0
    const snippet = `${start > 0 ? '…' : ''}${note.body.slice(start, start + 140).replace(/\s+/g, ' ').trim()}${note.body.length > start + 140 ? '…' : ''}`
    out.push({ note, snippet, score })
  }
  return out.sort((a, b) => b.score - a.score || b.note.updatedAt - a.note.updatedAt)
}

// History -------------------------------------------------------------------------------------------

export const noteRevisions = (s: KnowledgeState, noteId: string) => s.revisions.filter((r) => r.noteId === noteId).sort((a, b) => b.at - a.at)

/**
 * Keeps the current text of [note] as a version, unless it equals the newest version or that one is
 * younger than [REVISION_GAP_MS] (then the newest version is brought up to date). [force] always
 * starts a new version, e.g. before a restore.
 */
export function recordRevision(s: KnowledgeState, note: Note, id: string, now: number, force = false): KnowledgeState {
  if (note.deletedAt !== null || (!note.title.trim() && !note.body.trim())) return s
  const last = noteRevisions(s, note.id)[0]
  const body = note.body.slice(0, MAX_BODY)
  if (last && last.title === note.title && last.body === body) return s
  if (last && !force && now - last.at < REVISION_GAP_MS) {
    return { ...s, revisions: s.revisions.map((r) => (r.id === last.id ? { ...r, title: note.title, body, at: now } : r)) }
  }
  return { ...s, revisions: trimRevisions([{ id, noteId: note.id, at: now, title: note.title, body }, ...s.revisions]) }
}

/** Words added and removed between two versions, as a short summary: "+12 / −3 woorden". */
export function revisionChange(before: string, after: string): string {
  const words = (t: string) => t.split(/\s+/).filter(Boolean)
  const counts = new Map<string, number>()
  for (const w of words(before)) counts.set(w, (counts.get(w) ?? 0) + 1)
  let added = 0
  for (const w of words(after)) {
    const n = counts.get(w) ?? 0
    if (n > 0) counts.set(w, n - 1)
    else added++
  }
  const removed = [...counts.values()].reduce((a, b) => a + b, 0)
  return `+${added} / −${removed} woorden`
}

/** Collections and tags of a deleted note are dropped; its versions stay until they age out. */
export function tidyKnowledge(s: KnowledgeState, notes: Note[], now: number): KnowledgeState {
  const gone = new Set(notes.filter((n) => n.deletedAt !== null).map((n) => n.id))
  const stale = s.meta.filter((m) => gone.has(m.id) && (m.collections.length > 0 || m.tags.length > 0))
  if (stale.length === 0) return s
  return { ...s, meta: s.meta.map((m) => (gone.has(m.id) && (m.collections.length > 0 || m.tags.length > 0) ? { ...m, collections: [], tags: [], updatedAt: now } : m)) }
}

// Markdown ------------------------------------------------------------------------------------------

export type Inline =
  | { t: 'text'; text: string }
  | { t: 'bold'; text: string }
  | { t: 'italic'; text: string }
  | { t: 'code'; text: string }
  | { t: 'link'; text: string; href: string }
  | { t: 'wiki'; text: string }
  | { t: 'tag'; text: string }

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; inline: Inline[] }
  | { type: 'paragraph'; inline: Inline[] }
  | { type: 'quote'; inline: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'code'; text: string }
  | { type: 'rule' }

const INLINE = /\[\[([^[\]\n]{1,120})\]\]|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|`([^`\n]+)`|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|_([^_\n]+)_|(?:^|(?<=\s))#([\p{L}\p{N}_-]{2,40})/gu

/** Bold, italic, code, web links, [[note links]] and #tags. Anything else stays text; never HTML. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0
    if (at > last) out.push({ t: 'text', text: text.slice(last, at) })
    if (m[1]) out.push({ t: 'wiki', text: m[1].trim() })
    else if (m[2] && m[3]) out.push({ t: 'link', text: m[2], href: m[3] })
    else if (m[4]) out.push({ t: 'code', text: m[4] })
    else if (m[5]) out.push({ t: 'bold', text: m[5] })
    else if (m[6] ?? m[7]) out.push({ t: 'italic', text: (m[6] ?? m[7]) as string })
    else if (m[8]) out.push({ t: 'tag', text: cleanTag(m[8]) })
    last = at + m[0].length
  }
  if (last < text.length) out.push({ t: 'text', text: text.slice(last) })
  return out
}

/** A small, safe Markdown: headings, lists, quotes, code blocks, rules and paragraphs. */
export function parseMarkdown(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length > 0) blocks.push({ type: 'paragraph', inline: parseInline(para.join(' ')) })
    para = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim().startsWith('```')) {
      flush()
      const code: string[] = []
      for (i++; i < lines.length && !lines[i].trim().startsWith('```'); i++) code.push(lines[i])
      blocks.push({ type: 'code', text: code.join('\n') })
      continue
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      flush()
      blocks.push({ type: 'heading', level: heading[1].length as 1 | 2 | 3, inline: parseInline(heading[2].trim()) })
      continue
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush()
      blocks.push({ type: 'rule' })
      continue
    }
    const item = line.match(/^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/)
    if (item) {
      flush()
      const ordered = item[2] !== undefined
      const prev = blocks.at(-1)
      if (prev?.type === 'list' && prev.ordered === ordered) prev.items.push(parseInline(item[3]))
      else blocks.push({ type: 'list', ordered, items: [parseInline(item[3])] })
      continue
    }
    const quote = line.match(/^>\s?(.*)$/)
    if (quote) {
      flush()
      const prev = blocks.at(-1)
      if (prev?.type === 'quote') prev.inline.push({ t: 'text', text: ' ' }, ...parseInline(quote[1]))
      else blocks.push({ type: 'quote', inline: parseInline(quote[1]) })
      continue
    }
    if (!line.trim()) {
      flush()
      continue
    }
    para.push(line.trim())
  }
  flush()
  return blocks
}
