import { CHANGELOG, type ChangelogEntry } from './changelog'

/** The newest "Wat is er nieuw" entry this device already showed, so an update is shown once. */
const KEY = 'nexus.changelog.seen'

interface Seen {
  key: string
  date: string
}

export const entryKey = (e: ChangelogEntry): string => `${e.date}|${e.title}`

/**
 * The entries newer than [seen], newest first. Nothing on a device that never ran NEXUS before:
 * a fresh install starts with the tour, not with a list of changes.
 */
export function unseenEntries(changelog: ChangelogEntry[], seen: Seen | null): ChangelogEntry[] {
  if (!seen) return []
  const at = changelog.findIndex((e) => entryKey(e) === seen.key)
  return at >= 0 ? changelog.slice(0, at) : changelog.filter((e) => e.date > seen.date)
}

function read(): Seen | null {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<Seen>) : null
    return parsed && typeof parsed.key === 'string' && typeof parsed.date === 'string' ? { key: parsed.key, date: parsed.date } : null
  } catch {
    return null
  }
}

/** Marks everything up to the newest entry as seen. */
export function markChangelogSeen(changelog: ChangelogEntry[] = CHANGELOG): void {
  const newest = changelog[0]
  if (!newest) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ key: entryKey(newest), date: newest.date }))
  } catch {
    // Private mode: the notice shows again next time, which is harmless.
  }
}

/** What to show after an update; on a first run it marks everything seen and shows nothing. */
export function takeUnseen(changelog: ChangelogEntry[] = CHANGELOG): ChangelogEntry[] {
  const seen = read()
  if (!seen) markChangelogSeen(changelog)
  return unseenEntries(changelog, seen)
}
