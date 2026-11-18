import type { SyncRecord } from './sync'

/** Notes are stored locally first and synced when an account is connected. */
export interface Note extends SyncRecord {
  title: string
  body: string
}

export function createNote(now: number = Date.now(), id: string = crypto.randomUUID()): Note {
  return { id, title: '', body: '', updatedAt: now, deletedAt: null }
}

export function noteTitle(note: Note): string {
  const title = note.title.trim()
  if (title) return title
  const firstLine = note.body.trim().split('\n')[0]
  return firstLine ? firstLine.slice(0, 40) : 'Naamloze notitie'
}

/** Visible notes, newest first. Deleted notes stay stored as tombstones so the deletion syncs. */
export function sortNotes(notes: Note[]): Note[] {
  return notes.filter((n) => n.deletedAt === null).sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Validates one stored or synced note; v0.2 notes without deletedAt are upgraded. */
export function toNote(value: unknown): Note | null {
  if (typeof value !== 'object' || value === null) return null
  const n = value as Record<string, unknown>
  if (
    typeof n.id !== 'string' ||
    typeof n.title !== 'string' ||
    typeof n.body !== 'string' ||
    typeof n.updatedAt !== 'number'
  ) {
    return null
  }
  const deletedAt = typeof n.deletedAt === 'number' ? n.deletedAt : null
  return { id: n.id, title: n.title, body: n.body, updatedAt: n.updatedAt, deletedAt }
}

/** Parses stored JSON defensively so corrupt storage never breaks the app. */
export function parseNotes(raw: string | null): Note[] {
  if (!raw) return []
  try {
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data.map(toNote).filter((n): n is Note => n !== null)
  } catch {
    return []
  }
}

/**
 * Conflict copy for [syncOnce]: the version that lost keeps living as its own note, so an edit
 * made on two devices at once never disappears. Nothing is copied when the losing side was a
 * deletion or holds the same text as the winner.
 */
export function noteConflictCopy(loser: Note, winner: Note, now: number = Date.now(), id: string = crypto.randomUUID()): Note | null {
  if (loser.deletedAt !== null) return null
  if (!loser.title.trim() && !loser.body.trim()) return null
  if (winner.deletedAt === null && loser.title === winner.title && loser.body === winner.body) return null
  return { id, title: `${noteTitle(loser)} (conflictkopie)`, body: loser.body, updatedAt: now, deletedAt: null }
}
