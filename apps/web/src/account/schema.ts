import { missingFromTables, missingSteps, parseSchemaStatus, SCHEMA_CHECK_FILE, SCHEMA_TABLES, type SchemaStep } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface SchemaReport {
  missing: SchemaStep[]
  /** Steps NEXUS can't judge until the check itself is installed. */
  unknown: SchemaStep[]
  checkInstalled: boolean
}

const MISSING = /42P01|42883|PGRST202|PGRST205|could not find the (table|function)|does not exist/i

export const CHECK_STEP: SchemaStep = { file: SCHEMA_CHECK_FILE, label: 'De Database-check zelf', needs: [] }

/** Compares your Supabase database with the SQL steps NEXUS needs. */
export async function checkSchema(client: SupabaseClient): Promise<SchemaReport> {
  const { data, error } = await client.rpc('nexus_schema_status')
  const status = error ? null : parseSchemaStatus(data)
  if (status) return { missing: missingSteps(status), unknown: [], checkInstalled: true }
  if (error && !MISSING.test(`${error.code ?? ''} ${error.message}`)) throw new Error(error.message)
  // Without the check: one probe per table (no rows are read).
  const absent = new Set<string>()
  await Promise.all(
    SCHEMA_TABLES.map(async (table) => {
      const { error: e } = await client.from(table).select('*', { head: true }).limit(0)
      if (e && MISSING.test(`${e.code ?? ''} ${e.message}`)) absent.add(table)
    }),
  )
  const { missing, unknown } = missingFromTables((t) => !absent.has(t))
  return { missing: [CHECK_STEP, ...missing], unknown, checkInstalled: false }
}

const sources = import.meta.glob<string>('../../../../supabase/migrations/*.sql', { query: '?raw', import: 'default' })

/** The SQL of a step, to paste in the SQL Editor of Supabase. */
export async function migrationSql(file: string): Promise<string> {
  const load = Object.entries(sources).find(([path]) => path.endsWith(`/${file}`))?.[1]
  if (!load) throw new Error(`${file} zit niet in deze versie van NEXUS.`)
  return load()
}
