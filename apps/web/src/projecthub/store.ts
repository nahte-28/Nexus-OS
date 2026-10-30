import { useSyncExternalStore } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mergeProjectHub, parseProjectHub, type ProjectHubState } from '@nexus/core'
import { createProblem, DocStore, startDocSync } from '../state/docStore'

export const PROJECTHUB_MIGRATION = 'supabase/migrations/20261030120000_modules.sql'

/** Project Hub: board, milestones and activity of the Agenda projects (user_settings key 'projecthub'). */
export const projectHubStore = new DocStore<ProjectHubState>('nexus.projecthub', parseProjectHub)
export const projectHubSyncProblem = createProblem()

export const useProjectHub = () => useSyncExternalStore(projectHubStore.subscribe, projectHubStore.getSnapshot)

/** Syncs once the module is switched on, so an account without the SQL step gets no errors. */
export function startProjectHubSync(client: SupabaseClient | null, enabled: () => boolean, onEnabled: (l: () => void) => () => void): () => void {
  let stop: (() => void) | null = null
  const start = () => {
    if (stop || !enabled()) return
    stop = startDocSync(client, projectHubStore, { key: 'projecthub', parse: parseProjectHub, merge: mergeProjectHub, migration: PROJECTHUB_MIGRATION, problem: projectHubSyncProblem, label: 'Project Hub' })
  }
  start()
  const off = onEnabled(start)
  return () => {
    off()
    stop?.()
  }
}
