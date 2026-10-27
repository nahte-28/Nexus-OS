import { mergeHabits, parseHabitsState, type HabitsState } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { GRADES_MIGRATION } from '../grades/store'
import { createProblem, DocStore, startDocSync } from '../state/docStore'

export const habitsStore = new DocStore<HabitsState>('nexus.habits', parseHabitsState)
export const habitsSyncProblem = createProblem()

export function startHabitsSync(client: SupabaseClient | null): () => void {
  return startDocSync(client, habitsStore, { key: 'habits', parse: parseHabitsState, merge: mergeHabits, migration: GRADES_MIGRATION, problem: habitsSyncProblem, label: 'Gewoontes' })
}
