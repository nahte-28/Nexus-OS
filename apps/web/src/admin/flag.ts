import { useSyncExternalStore } from 'react'
import { readStorage, writeStorage } from '../state/storage'

/** On its own so the app list (registry.tsx) knows about Beheer without loading the admin code. */
const KEY = 'nexus.admin'

// Whether this account is an admin, remembered so Beheer is in the sidebar right after a start.
let admin = readStorage(KEY) === 'on'
const listeners = new Set<() => void>()
export function setAdmin(on: boolean): void {
  if (on === admin) return
  admin = on
  writeStorage(KEY, on ? 'on' : 'off')
  listeners.forEach((l) => l())
}
export function useIsAdmin(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => admin,
  )
}
