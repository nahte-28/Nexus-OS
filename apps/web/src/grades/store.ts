import { mergeGrades, parseGradesState, type GradesState } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createProblem, DocStore, startDocSync } from '../state/docStore'

export const GRADES_MIGRATION = 'supabase/migrations/20261027150000_grades_habits.sql'

export const gradesStore = new DocStore<GradesState>('nexus.grades', parseGradesState)
export const gradesSyncProblem = createProblem()

export function startGradesSync(client: SupabaseClient | null): () => void {
  return startDocSync(client, gradesStore, { key: 'grades', parse: parseGradesState, merge: mergeGrades, migration: GRADES_MIGRATION, problem: gradesSyncProblem, label: 'Cijfers' })
}
