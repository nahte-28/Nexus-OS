/**
 * Local-first sync. Every device keeps a full local copy and works offline;
 * changes are queued as "dirty" ids and exchanged with the server when online.
 * Conflicts resolve last-write-wins on updatedAt, deletions travel as tombstones. With a
 * [SyncOptions.conflictCopy] the losing side of a real conflict is kept as a new record.
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
  /** Copies made of versions that lost a conflict. */
  copies: number
}

export interface SyncOptions<T extends SyncRecord> {
  /**
   * Both this device and another one changed the same record since the last sync. Return a new
   * record (own id) that keeps `loser`, or null when nothing worth keeping was lost.
   */
  conflictCopy?: (loser: T, winner: T) => T | null
}

/** One full sync round: push local changes, then pull and merge everything newer. */
export async function syncOnce<T extends SyncRecord>(local: LocalStore<T>, remote: RemoteStore<T>, options: SyncOptions<T> = {}): Promise<SyncReport> {
  if (options.conflictCopy && local.dirtyIds().length > 0) return syncWithCopies(local, remote, options.conflictCopy)
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
  return { pushed: outgoing.length, pulled: records.length, applied: upserts.length, copies: 0 }
}

/**
 * Like [syncOnce], but pulls before pushing: a dirty record that also changed on the server is a
 * conflict, and the losing version is uploaded as a copy instead of disappearing. A second pull
 * then moves the cursor past this device's own uploads. Nothing is stored until both pulls
 * worked, so a failed round leaves the conflict to be found again next time.
 */
async function syncWithCopies<T extends SyncRecord>(local: LocalStore<T>, remote: RemoteStore<T>, conflictCopy: (loser: T, winner: T) => T | null): Promise<SyncReport> {
  const first = await remote.pull(local.cursor())
  const dirty = new Set(local.dirtyIds())
  const before = new Map(local.all().map((r) => [r.id, r]))
  const winners = new Map<string, T>()
  const copies: T[] = []
  for (const incoming of first.records) {
    const mine = winners.get(incoming.id) ?? before.get(incoming.id)
    const winner = newer(mine, incoming)
    if (mine && dirty.has(mine.id) && mine.updatedAt !== incoming.updatedAt) {
      const copy = winner === incoming ? conflictCopy(mine, incoming) : conflictCopy(incoming, mine)
      if (copy) copies.push(copy)
    }
    if (winner === incoming && incoming !== mine) winners.set(incoming.id, incoming)
  }

  // Local edits that lost are replaced by the server's version: nothing left to upload for them.
  const outgoing = [...dirty].filter((id) => !winners.has(id)).map((id) => before.get(id)).filter((r): r is T => r !== undefined)
  const uploads = [...outgoing, ...copies]
  if (uploads.length > 0) await remote.push(uploads)
  const second = await remote.pull(first.cursor)

  // Re-read after the network round trips: the user may have edited meanwhile.
  const current = new Map(local.all().map((r) => [r.id, r]))
  const upserts = new Map<string, T>()
  const consider = (incoming: T) => {
    const mine = upserts.get(incoming.id) ?? current.get(incoming.id)
    if (newer(mine, incoming) === incoming && incoming !== mine) upserts.set(incoming.id, incoming)
  }
  for (const r of winners.values()) {
    // Edited again during the round: that newer local edit stays and is uploaded next time.
    if (current.get(r.id)?.updatedAt === before.get(r.id)?.updatedAt) consider(r)
  }
  for (const c of copies) upserts.set(c.id, c)
  for (const r of second.records) consider(r)

  const settled = [...winners.keys(), ...outgoing.map((r) => r.id)]
  const cleanIds = settled.filter((id) => {
    const now = current.get(id)
    return now === undefined || now.updatedAt === before.get(id)?.updatedAt
  })
  await local.commit({ upserts: [...upserts.values()], cleanIds, cursor: second.cursor })
  return { pushed: uploads.length, pulled: first.records.length + second.records.length, applied: upserts.size, copies: copies.length }
}
