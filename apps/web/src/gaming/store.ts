import { useSyncExternalStore } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mergeGaming, parseGaming, type GamingState } from '@nexus/core'
import { createProblem, DocStore, startDocSync } from '../state/docStore'

export const GAMING_MIGRATION = 'supabase/migrations/20261030120000_modules.sql'

/** Gaming Companion: games, sessions, builds and the weekly limit (user_settings key 'gaming'). */
export const gamingStore = new DocStore<GamingState>('nexus.gaming', parseGaming)
export const gamingSyncProblem = createProblem()

export const useGaming = () => useSyncExternalStore(gamingStore.subscribe, gamingStore.getSnapshot)

/** Syncs once the module is switched on, so an account without the SQL step gets no errors. */
export function startGamingSync(client: SupabaseClient | null, enabled: () => boolean, onEnabled: (l: () => void) => () => void): () => void {
  let stop: (() => void) | null = null
  const start = () => {
    if (stop || !enabled()) return
    stop = startDocSync(client, gamingStore, { key: 'gaming', parse: parseGaming, merge: mergeGaming, migration: GAMING_MIGRATION, problem: gamingSyncProblem, label: 'Gaming Companion' })
  }
  start()
  const off = onEnabled(start)
  return () => {
    off()
    stop?.()
  }
}
