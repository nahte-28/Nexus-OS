import { createNote, parseNotes, sortNotes, toNote, type LocalStore, type Note } from '@nexus/core'
import { clearAll, getAll, getMeta, write } from './db'
import { readStorage } from './storage'

const LEGACY_KEY = 'nexus.notes'
const DIRTY_KEY = 'notes.dirty'
const CURSOR_KEY = 'notes.cursor'

type Listener = () => void

/**
 * The single source of truth for notes on this device. Data lives in IndexedDB so it
 * survives offline use; every change is marked dirty until the sync engine uploads it.
 */
export class NotesStore implements LocalStore<Note> {
  private records = new Map<string, Note>()
  private dirty = new Set<string>()
  private cursorValue: string | null = null
  private visible: Note[] = []
  private listeners = new Set<Listener>()
  private channel: BroadcastChannel | null = null
  private writes: Promise<void> = Promise.resolve()
  ready: Promise<void>

  constructor() {
    this.ready = this.load()
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('nexus-notes')
      // Another tab changed data: reload from IndexedDB.
      this.channel.onmessage = () => void this.load()
    }
  }

  private async load(): Promise<void> {
    const [stored, dirty, cursor] = await Promise.all([
      getAll<unknown>('notes'),
      getMeta<string[]>(DIRTY_KEY),
      getMeta<string | null>(CURSOR_KEY),
    ])
    this.records = new Map(stored.map(toNote).filter((n): n is Note => n !== null).map((n) => [n.id, n]))
    this.dirty = new Set(dirty ?? [])
    this.cursorValue = cursor ?? null
    await this.migrateLegacy()
    this.emit(false)
  }

  /** v0.2 kept notes in localStorage; move them over once and mark them for upload. */
  private async migrateLegacy(): Promise<void> {
    const legacy = parseNotes(readStorage(LEGACY_KEY))
    const fresh = legacy.filter((n) => !this.records.has(n.id))
    if (fresh.length === 0) return
    for (const n of fresh) {
      this.records.set(n.id, n)
      this.dirty.add(n.id)
    }
    await this.persist(fresh)
    try {
      localStorage.removeItem(LEGACY_KEY)
    } catch {
      // Ignore: the notes are safely in IndexedDB and won't be imported twice.
    }
  }

  private persist(put: Note[], extraMeta: Record<string, unknown> = {}): Promise<void> {
    const meta = { [DIRTY_KEY]: [...this.dirty], [CURSOR_KEY]: this.cursorValue, ...extraMeta }
    // Serialize writes so an older snapshot never overwrites a newer one.
    this.writes = this.writes.then(() => write({ store: 'notes', put, meta })).catch((err) => {
      console.error('NEXUS: kon notities niet opslaan', err)
    })
    return this.writes
  }

  private emit(broadcast = true): void {
    this.visible = sortNotes([...this.records.values()])
    if (broadcast) this.channel?.postMessage('changed')
    for (const l of this.listeners) l()
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): Note[] => this.visible

  private save(note: Note): void {
    this.records.set(note.id, note)
    this.dirty.add(note.id)
    void this.persist([note]).then(() => this.channel?.postMessage('changed'))
    this.emit(false)
  }

  add(): string {
    const note = createNote()
    this.save(note)
    return note.id
  }

  update(id: string, patch: Partial<Pick<Note, 'title' | 'body'>>): void {
    const note = this.records.get(id)
    if (note) this.save({ ...note, ...patch, updatedAt: Date.now() })
  }

  remove(id: string): void {
    const note = this.records.get(id)
    if (note) {
      const now = Date.now()
      this.save({ ...note, title: '', body: '', updatedAt: now, deletedAt: now })
    }
  }

  // LocalStore, used by the sync engine.
  all(): Note[] {
    return [...this.records.values()]
  }

  dirtyIds(): string[] {
    return [...this.dirty]
  }

  cursor(): string | null {
    return this.cursorValue
  }

  async commit({ upserts, cleanIds, cursor }: { upserts: Note[]; cleanIds: string[]; cursor: string | null }) {
    for (const n of upserts) this.records.set(n.id, n)
    for (const id of cleanIds) this.dirty.delete(id)
    this.cursorValue = cursor
    await this.persist(upserts)
    this.emit()
  }

  /** Wipes this device's copy (sign-out). Unsynced changes are lost, so callers warn first. */
  async reset(): Promise<void> {
    await this.writes
    await clearAll()
    this.records.clear()
    this.dirty.clear()
    this.cursorValue = null
    this.emit()
  }
}

export const notesStore = new NotesStore()
