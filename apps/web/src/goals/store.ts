import { useSyncExternalStore } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mergeGoals, parseGoals, type GoalsState } from '@nexus/core'
import { createProblem, DocStore, startDocSync } from '../state/docStore'

export const GOALS_MIGRATION = 'supabase/migrations/20261116120000_goals.sql'

/** Doelen: your semester goals (user_settings key 'goals'). */
export const goalsStore = new DocStore<GoalsState>('nexus.goals', parseGoals)
export const goalsSyncProblem = createProblem()

export const useGoals = () => useSyncExternalStore(goalsStore.subscribe, goalsStore.getSnapshot)

/** Syncs once the module is switched on, so an account without the SQL step gets no errors. */
export function startGoalsSync(client: SupabaseClient | null, enabled: () => boolean, onEnabled: (l: () => void) => () => void): () => void {
  let stop: (() => void) | null = null
  const start = () => {
    if (stop || !enabled()) return
    stop = startDocSync(client, goalsStore, { key: 'goals', parse: parseGoals, merge: mergeGoals, migration: GOALS_MIGRATION, problem: goalsSyncProblem, label: 'Doelen' })
  }
  start()
  const off = onEnabled(start)
  return () => {
    off()
    stop?.()
  }
}
