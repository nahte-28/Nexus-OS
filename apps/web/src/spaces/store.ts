import { useSyncExternalStore } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mergeSpaces, parseSpacesState, type SpacesState } from '@nexus/core'
import { createProblem, DocStore, startDocSync } from '../state/docStore'
import { readStorage, writeStorage } from '../state/storage'

export const SPACES_MIGRATION = 'supabase/migrations/20261029170000_spaces.sql'

export const spacesStore = new DocStore<SpacesState>('nexus.spaces', parseSpacesState)
export const spacesSyncProblem = createProblem()

/**
 * Syncs once the module is switched on (now or later). Until then nothing is written, so an
 * account without the SQL step never gets errors for a module nobody uses.
 */
export function startSpacesSync(client: SupabaseClient | null, enabled: () => boolean, onEnabled: (l: () => void) => () => void): () => void {
  let stop: (() => void) | null = null
  const start = () => {
    if (stop || !enabled()) return
    stop = startDocSync(client, spacesStore, { key: 'spaces', parse: parseSpacesState, merge: mergeSpaces, migration: SPACES_MIGRATION, problem: spacesSyncProblem, label: 'Spaces' })
  }
  start()
  const off = onEnabled(start)
  return () => {
    off()
    stop?.()
  }
}

export function useSpaces(): SpacesState {
  return useSyncExternalStore(spacesStore.subscribe, spacesStore.getSnapshot)
}

/** Which Space this device has open; per device, since each screen has its own layout. */
const CURRENT_KEY = 'nexus.space.current'
let current: string | null = readStorage(CURRENT_KEY) || null
const listeners = new Set<() => void>()

export function setCurrentSpace(id: string | null): void {
  current = id
  writeStorage(CURRENT_KEY, id ?? '')
  listeners.forEach((l) => l())
}

export const getCurrentSpace = () => current

export function useCurrentSpace(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}
