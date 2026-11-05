import { useSyncExternalStore } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mergeDarts, parseDarts, type DartsState } from '@nexus/core'
import { createProblem, DocStore, startDocSync } from '../state/docStore'

export const DARTS_MIGRATION = 'supabase/migrations/20261105090000_darts.sql'

/** Darts: your matches and settings (user_settings key 'darts'). */
export const dartsStore = new DocStore<DartsState>('nexus.darts', parseDarts)
export const dartsSyncProblem = createProblem()

export const useDarts = () => useSyncExternalStore(dartsStore.subscribe, dartsStore.getSnapshot)

/** Syncs once the module is switched on, so an account without the SQL step gets no errors. */
export function startDartsSync(client: SupabaseClient | null, enabled: () => boolean, onEnabled: (l: () => void) => () => void): () => void {
  let stop: (() => void) | null = null
  const start = () => {
    if (stop || !enabled()) return
    stop = startDocSync(client, dartsStore, { key: 'darts', parse: parseDarts, merge: mergeDarts, migration: DARTS_MIGRATION, problem: dartsSyncProblem, label: 'Darts' })
  }
  start()
  const off = onEnabled(start)
  return () => {
    off()
    stop?.()
  }
}
