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

// Every migration in supabase/migrations, loaded only when its SQL is copied.
const sources = import.meta.glob<string>('../../../../supabase/migrations/*.sql', { query: '?raw', import: 'default' })

/** The SQL of a step, to paste in the SQL Editor of Supabase. */
export async function migrationSql(file: string): Promise<string> {
  const load = Object.entries(sources).find(([path]) => path.endsWith(`/${file}`))?.[1]
  if (!load) throw new Error(`${file} zit niet in deze versie van NEXUS.`)
  return load()
}

/** Every migration file in this version of NEXUS, oldest first. */
export const MIGRATION_FILES: string[] = Object.keys(sources)
  .map((path) => path.slice(path.lastIndexOf('/') + 1))
  .sort()

/**
 * One script with every migration from the oldest missing step on, in order. Every migration can
 * run again safely, and running the later ones again keeps their newer versions of functions.
 */
export async function allMissingSql(report: SchemaReport, sql: typeof migrationSql = migrationSql, files: string[] = MIGRATION_FILES): Promise<string> {
  const steps = [...report.missing, ...report.unknown]
  const labels = new Map(steps.map((s) => [s.file, s.label]))
  const first = steps.map((s) => s.file).sort()[0]
  const chosen = first ? files.filter((f) => f >= first) : []
  const parts = await Promise.all(chosen.map(async (file) => `-- ===== ${file}${labels.has(file) ? ` (ontbrak: ${labels.get(file)})` : ''} =====\n${(await sql(file)).trim()}\n`))
  return `-- NEXUS: alle SQL vanaf de oudste ontbrekende stap (${chosen.length} bestanden). Elke stap mag opnieuw lopen.\n-- Plak in Supabase › SQL Editor › New query en klik Run.\n\n${parts.join('\n')}`
}

/** The SQL Editor of this Supabase project, or null when the address is not a supabase.co project. */
export function sqlEditorUrl(projectUrl: string | undefined): string | null {
  const ref = projectUrl?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1]
  return ref ? `https://supabase.com/dashboard/project/${ref.toLowerCase()}/sql/new` : null
}
