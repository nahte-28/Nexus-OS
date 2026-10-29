import { describe, expect, it } from 'vitest'
import { missingFromTables, missingSteps, parseSchemaStatus, SCHEMA_STEPS, SCHEMA_TABLES } from './schemaCheck'
import { readdirSync } from 'node:fs'

const ALL_KEYS = "CHECK ((key = ANY (ARRAY['profiles'::text, 'flows'::text, 'grades'::text, 'habits'::text, 'flashcards'::text, 'budget'::text, 'finance'::text, 'exams'::text, 'journal'::text, 'spaces'::text])))"
const full = parseSchemaStatus({
  tables: [...SCHEMA_TABLES, 'push_schedule'],
  functions: ['join_study_group', 'create_study_group'],
  constraints: { user_settings_key_check: ALL_KEYS, life_items_kind_check: "CHECK ((kind = ANY (ARRAY['deadline'::text, 'project'::text, 'appointment'::text])))" },
  buckets: ['nexus-files'],
})!

describe('database-check', () => {
  it('finds nothing missing in a complete database', () => {
    expect(missingSteps(full)).toEqual([])
  })

  it('names the steps that are missing', () => {
    const old = { ...full, tables: full.tables.filter((t) => !t.startsWith('study_group')), constraints: { ...full.constraints, user_settings_key_check: "CHECK ((key = ANY (ARRAY['profiles'::text, 'flows'::text, 'grades'::text, 'habits'::text])))" } }
    expect(missingSteps(old).map((s) => s.file)).toEqual(['20261027160000_flashcards.sql', '20261028100000_finance.sql', '20261028120000_exams_journal.sql', '20261028140000_study_groups.sql', '20261029120000_study_groups_live.sql', '20261029170000_spaces.sql'])
  })

  it('works from table probes alone before the check is installed', () => {
    const { missing, unknown } = missingFromTables((t) => t !== 'study_groups')
    expect(missing.map((s) => s.file)).toEqual(['20261028140000_study_groups.sql'])
    expect(unknown.map((s) => s.file)).toContain('20261028120000_exams_journal.sql')
  })

  it('lists only files that exist', () => {
    const files = readdirSync(new URL('../../../supabase/migrations', import.meta.url))
    for (const s of SCHEMA_STEPS) expect(files).toContain(s.file)
  })
})
