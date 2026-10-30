import { useSyncExternalStore } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mergeStudyLab, parseStudyLab, type StudyLabState } from '@nexus/core'
import { createProblem, DocStore, startDocSync } from '../state/docStore'

export const STUDYLAB_MIGRATION = 'supabase/migrations/20261030120000_modules.sql'

/** Study Lab: courses, topics, practice questions and sessions (user_settings key 'studylab'). */
export const studyLabStore = new DocStore<StudyLabState>('nexus.studylab', parseStudyLab)
export const studyLabSyncProblem = createProblem()

export const useStudyLab = () => useSyncExternalStore(studyLabStore.subscribe, studyLabStore.getSnapshot)

/** Syncs once the module is switched on, so an account without the SQL step gets no errors. */
export function startStudyLabSync(client: SupabaseClient | null, enabled: () => boolean, onEnabled: (l: () => void) => () => void): () => void {
  let stop: (() => void) | null = null
  const start = () => {
    if (stop || !enabled()) return
    stop = startDocSync(client, studyLabStore, { key: 'studylab', parse: parseStudyLab, merge: mergeStudyLab, migration: STUDYLAB_MIGRATION, problem: studyLabSyncProblem, label: 'Study Lab' })
  }
  start()
  const off = onEnabled(start)
  return () => {
    off()
    stop?.()
  }
}
