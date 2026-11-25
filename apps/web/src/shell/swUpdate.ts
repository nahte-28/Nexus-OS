import { useSyncExternalStore } from 'react'

/**
 * A new version of NEXUS that the service worker has downloaded and keeps waiting, so nothing
 * reloads under your hands. The update popup asks; "Bijwerken" activates it and reloads once.
 * main.tsx connects the service worker (virtual:pwa-register) with [connectServiceWorker].
 */

/** How often an open NEXUS asks the server for a newer version. */
export const CHECK_EVERY_MS = 60 * 60_000

let waiting = false
let dismissed = false
let apply: ((reload: boolean) => Promise<void>) | null = null
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((l) => l())
}

/** Called by the service worker registration when a new version waits. */
export function updateReady(): void {
  waiting = true
  dismissed = false
  emit()
}

/** Gives this module the function that activates the waiting version and reloads. */
export function connectServiceWorker(activate: (reload: boolean) => Promise<void>): void {
  apply = activate
}

/** Activates the new version; the page reloads by itself once it is in charge. */
export async function applyUpdate(): Promise<void> {
  if (!apply) return
  await apply(true)
}

/** "Later": the popup goes away until the next start, the update still waits. */
export function dismissUpdate(): void {
  dismissed = true
  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** True while a new version waits and you did not choose "Later" in this session. */
export function useUpdateWaiting(): boolean {
  return useSyncExternalStore(subscribe, () => waiting && !dismissed, () => false)
}

/** Only for tests. */
export function resetSwUpdate(): void {
  waiting = false
  dismissed = false
  apply = null
  emit()
}
