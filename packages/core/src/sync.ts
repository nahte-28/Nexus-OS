/**
 * Local-first sync. Every device keeps a full local copy and works offline;
 * changes are queued as "dirty" ids and exchanged with the server when online.
 * Conflicts resolve last-write-wins on updatedAt, deletions travel as tombstones.
 */

export interface SyncRecord {
  id: string
  /** Client time (ms) of the last edit; decides which version wins. */
  updatedAt: number
  /** Set when deleted; the record is kept so the deletion reaches other devices. */
  deletedAt: number | null
}

export interface PullResult<T> {
  records: T[]
  /** Opaque server cursor to pass to the next pull. */
  cursor: string | null
}

export interface RemoteStore<T extends SyncRecord> {
  push(records: T[]): Promise<void>
  pull(cursor: string | null): Promise<PullResult<T>>
}

export interface LocalStore<T extends SyncRecord> {
  all(): T[]
  dirtyIds(): string[]
  cursor(): string | null
  /** Applies the result of a sync round atomically. */
  commit(change: { upserts: T[]; cleanIds: string[]; cursor: string | null }): Promise<void>
}

/** Returns the version that should win; ties keep the local one. */
export function newer<T extends SyncRecord>(local: T | undefined, remote: T): T {
  if (!local) return remote
  return remote.updatedAt > local.updatedAt ? remote : local
}

export interface SyncReport {
  pushed: number
  pulled: number
  applied: number
}

/** One full sync round: push local changes, then pull and merge everything newer. */
export async function syncOnce<T extends SyncRecord>(local: LocalStore<T>, remote: RemoteStore<T>): Promise<SyncReport> {
  const dirty = new Set(local.dirtyIds())
  const byId = new Map(local.all().map((r) => [r.id, r]))
  const outgoing = [...dirty].map((id) => byId.get(id)).filter((r): r is T => r !== undefined)

  if (outgoing.length > 0) await remote.push(outgoing)

  const { records, cursor } = await remote.pull(local.cursor())

  // Re-read after the network round trips: the user may have edited meanwhile.
  const current = new Map(local.all().map((r) => [r.id, r]))
  const upserts: T[] = []
  for (const incoming of records) {
    const mine = current.get(incoming.id)
    if (newer(mine, incoming) === incoming && incoming !== mine) upserts.push(incoming)
  }

  // Only mark records clean if they were not edited again while we were syncing.
  const pushedVersions = new Map(outgoing.map((r) => [r.id, r.updatedAt]))
  const cleanIds = [...pushedVersions].filter(([id, v]) => current.get(id)?.updatedAt === v).map(([id]) => id)

  await local.commit({ upserts, cleanIds, cursor })
  return { pushed: outgoing.length, pulled: records.length, applied: upserts.length }
}
