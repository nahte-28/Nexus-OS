/** Notes model. Stored locally for now; v0.3 moves this behind Supabase sync. */

export interface Note {
  id: string
  title: string
  body: string
  updatedAt: number
}

export function createNote(now: number = Date.now(), id: string = crypto.randomUUID()): Note {
  return { id, title: '', body: '', updatedAt: now }
}

export function noteTitle(note: Note): string {
  const title = note.title.trim()
  if (title) return title
  const firstLine = note.body.trim().split('\n')[0]
  return firstLine ? firstLine.slice(0, 40) : 'Naamloze notitie'
}

export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Parses stored JSON defensively so corrupt storage never breaks the app. */
export function parseNotes(raw: string | null): Note[] {
  if (!raw) return []
  try {
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data.filter(
      (n): n is Note =>
        typeof n === 'object' &&
        n !== null &&
        typeof n.id === 'string' &&
        typeof n.title === 'string' &&
        typeof n.body === 'string' &&
        typeof n.updatedAt === 'number',
    )
  } catch {
    return []
  }
}
