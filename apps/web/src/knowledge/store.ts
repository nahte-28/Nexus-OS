import { useSyncExternalStore } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mergeKnowledge, parseKnowledge, tidyKnowledge, type KnowledgeState } from '@nexus/core'
import { createProblem, DocStore, startDocSync } from '../state/docStore'
import { notesStore } from '../state/notesStore'

export const KNOWLEDGE_MIGRATION = 'supabase/migrations/20261030120000_modules.sql'

/** Kennis: collections, tags and versions of Notities (user_settings key 'knowledge'). */
export const knowledgeStore = new DocStore<KnowledgeState>('nexus.knowledge', parseKnowledge)
export const knowledgeSyncProblem = createProblem()

export const useKnowledge = () => useSyncExternalStore(knowledgeStore.subscribe, knowledgeStore.getSnapshot)

/** Syncs once the module is switched on, so an account without the SQL step gets no errors. */
export function startKnowledgeSync(client: SupabaseClient | null, enabled: () => boolean, onEnabled: (l: () => void) => () => void): () => void {
  let stop: (() => void) | null = null
  const start = () => {
    if (stop || !enabled()) return
    void notesStore.ready.then(() => {
      const tidy = tidyKnowledge(knowledgeStore.getSnapshot(), notesStore.all(), Date.now())
      if (tidy !== knowledgeStore.getSnapshot()) knowledgeStore.update(() => tidy)
    })
    stop = startDocSync(client, knowledgeStore, { key: 'knowledge', parse: parseKnowledge, merge: mergeKnowledge, migration: KNOWLEDGE_MIGRATION, problem: knowledgeSyncProblem, label: 'Kennis' })
  }
  start()
  const off = onEnabled(start)
  return () => {
    off()
    stop?.()
  }
}
