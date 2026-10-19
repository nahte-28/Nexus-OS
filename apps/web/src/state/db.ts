/** Minimal IndexedDB wrapper: one object store per collection plus a key/value "meta" store. */

const DB_NAME = 'nexus'
const DB_VERSION = 2
// inbox: received Connect notifications; connect: this device's identity and keys.
export const STORES = ['notes', 'meta', 'inbox', 'connect'] as const
export type StoreName = (typeof STORES)[number]

let dbPromise: Promise<IDBDatabase> | null = null

export function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
      if (!db.objectStoreNames.contains('inbox')) db.createObjectStore('inbox', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('connect')) db.createObjectStore('connect')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      dbPromise = null
      reject(req.error)
    }
  })
  return dbPromise
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function result<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb()
  return result(db.transaction(store).objectStore(store).getAll() as IDBRequest<T[]>)
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await openDb()
  return result(db.transaction('meta').objectStore('meta').get(key) as IDBRequest<T | undefined>)
}

/** Writes records and meta keys in one transaction, so a sync round is all-or-nothing. */
export async function write(change: { store: StoreName; put?: unknown[]; meta?: Record<string, unknown> }): Promise<void> {
  const db = await openDb()
  const tx = db.transaction([change.store, 'meta'], 'readwrite')
  const store = tx.objectStore(change.store)
  for (const value of change.put ?? []) store.put(value)
  const meta = tx.objectStore('meta')
  for (const [key, value] of Object.entries(change.meta ?? {})) meta.put(value, key)
  return done(tx)
}

export async function getValue<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await openDb()
  return result(db.transaction(store).objectStore(store).get(key) as IDBRequest<T | undefined>)
}

/** Puts and deletes records in one store; `key` is only for stores without a keyPath. */
export async function update(
  store: StoreName,
  change: { put?: unknown[]; key?: string; remove?: string[] },
): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(store, 'readwrite')
  const os = tx.objectStore(store)
  for (const value of change.put ?? []) {
    if (change.key) os.put(value, change.key)
    else os.put(value)
  }
  for (const key of change.remove ?? []) os.delete(key)
  return done(tx)
}

/** Clears all local data, used on sign-out so the next account starts clean. */
export async function clearAll(): Promise<void> {
  const db = await openDb()
  const tx = db.transaction([...STORES], 'readwrite')
  for (const name of STORES) tx.objectStore(name).clear()
  return done(tx)
}

/** Test helper: forget the cached connection so a fresh fake database is used. */
export function resetDbConnection(): void {
  dbPromise = null
}
