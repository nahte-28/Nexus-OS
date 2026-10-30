import { useSyncExternalStore } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mergeCaptures, parseCaptures, tidyCaptures, type CapturesState } from '@nexus/core'
import { createProblem, DocStore, startDocSync } from '../state/docStore'

export const CAPTURES_MIGRATION = 'supabase/migrations/20261030120000_modules.sql'

/** Snel vastleggen 2.0: Te sorteren, sjablonen and history (user_settings key 'captures'). */
export const capturesStore = new DocStore<CapturesState>('nexus.captures', parseCaptures)
export const capturesSyncProblem = createProblem()

export const useCaptures = () => useSyncExternalStore(capturesStore.subscribe, capturesStore.getSnapshot)

/** Syncs once the module is switched on, so an account without the SQL step gets no errors. */
export function startCapturesSync(client: SupabaseClient | null, enabled: () => boolean, onEnabled: (l: () => void) => () => void): () => void {
  let stop: (() => void) | null = null
  const start = () => {
    if (stop || !enabled()) return
    const tidy = tidyCaptures(capturesStore.getSnapshot(), Date.now())
    if (tidy !== capturesStore.getSnapshot()) capturesStore.update(() => tidy)
    stop = startDocSync(client, capturesStore, { key: 'captures', parse: parseCaptures, merge: mergeCaptures, migration: CAPTURES_MIGRATION, problem: capturesSyncProblem, label: 'Snel vastleggen' })
  }
  start()
  const off = onEnabled(start)
  return () => {
    off()
    stop?.()
  }
}
