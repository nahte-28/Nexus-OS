import { useSyncExternalStore } from 'react'
import { isQuotaError, type StorageFacts } from '@nexus/core'

/**
 * Whether saving on this device works. localStorage and IndexedDB report a failed save here, so a
 * full browser storage no longer loses changes silently: the shell shows a notice and the
 * Offline-centrum says how much space is used and whether the browser keeps the data.
 */

let facts: StorageFacts = { usage: null, quota: null, persisted: null, fullAt: null }
/** While storage stays full every save fails: a closed notice stays away this long. */
export const NOTICE_QUIET_MS = 10 * 60_000
/** When the notice in the shell was closed; it comes back for a failed save after the quiet time. */
let noticeClosedAt: number | null = null
let noticeOpen = false
const listeners = new Set<() => void>()

function set(next: Partial<StorageFacts>): void {
  facts = { ...facts, ...next }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Called when a save on this device threw; only "storage full" counts, not blocked storage. */
export function reportWriteFailure(err: unknown, where: string): void {
  if (!isQuotaError(err)) return
  const now = Date.now()
  if (noticeClosedAt === null || now - noticeClosedAt >= NOTICE_QUIET_MS) noticeOpen = true
  set({ fullAt: now })
  console.warn(`NEXUS: opslaan in ${where} mislukt, de opslag van de browser zit vol.`)
  void refreshEstimate()
}

/** Asks the browser how much space NEXUS uses and whether it keeps the data. */
export async function refreshEstimate(): Promise<void> {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage
  if (!storage?.estimate) return
  try {
    const [estimate, persisted] = await Promise.all([storage.estimate(), storage.persisted?.() ?? Promise.resolve(null)])
    set({ usage: estimate.usage ?? null, quota: estimate.quota ?? null, persisted })
  } catch {
    // Not in a secure context, or the browser refused: leave the facts as they were.
  }
}

/**
 * Asks the browser not to clear NEXUS' data when the disk runs low. Chrome and Edge decide by
 * themselves (installed or often used: yes); Firefox may ask once. True when the data is kept.
 */
export async function requestPersistence(): Promise<boolean> {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage
  if (!storage?.persist) return false
  try {
    const kept = (await storage.persisted?.()) || (await storage.persist())
    set({ persisted: kept })
    return kept
  } catch {
    return false
  }
}

/** Starts with NEXUS (background.ts): keep the data and know how full it is. */
export function startStorageHealth(): void {
  void requestPersistence().then(() => refreshEstimate())
}

export function closeStorageNotice(): void {
  noticeOpen = false
  noticeClosedAt = Date.now()
  listeners.forEach((l) => l())
}

export function useStorageFacts(): StorageFacts {
  return useSyncExternalStore(subscribe, () => facts, () => facts)
}

/** True while the shell should say that a save failed. */
export function useStorageNotice(): boolean {
  return useSyncExternalStore(subscribe, () => noticeOpen, () => false)
}

/** Only for tests. */
export function resetStorageHealth(): void {
  facts = { usage: null, quota: null, persisted: null, fullAt: null }
  noticeOpen = false
  noticeClosedAt = null
  listeners.forEach((l) => l())
}
