/**
 * Database-check: which SQL steps (files in supabase/migrations) a NEXUS database still needs.
 * The Account app asks Supabase for the names of what exists and compares them with this list.
 */
export type SchemaNeed =
  | { table: string }
  | { fn: string }
  | { settingsKey: string }
  | { lifeKind: string }
  | { bucket: string }

export interface SchemaStep {
  /** The file in supabase/migrations. */
  file: string
  /** What stops working without it, in the words of the apps. */
  label: string
  needs: SchemaNeed[]
}

export const SCHEMA_CHECK_FILE = '20261029090000_schema_check.sql'

export const SCHEMA_STEPS: SchemaStep[] = [
  { file: '20261019000000_notes.sql', label: 'Notities syncen', needs: [{ table: 'notes' }] },
  { file: '20261019120000_connect.sql', label: 'NEXUS Connect (gsm, horloge, meldingen)', needs: [{ table: 'devices' }, { table: 'connect_messages' }] },
  { file: '20261020100000_settings.sql', label: 'Profielen en lesrooster syncen', needs: [{ table: 'user_settings' }, { settingsKey: 'profiles' }] },
  { file: '20261020140000_flows.sql', label: 'Flow Studio syncen', needs: [{ table: 'automation_flows' }, { table: 'automation_runs' }, { settingsKey: 'flows' }] },
  { file: '20261021100000_push.sql', label: 'Web-push naar je gsm', needs: [{ table: 'push_subscriptions' }, { table: 'push_schedule' }] },
  { file: '20261027090000_life.sql', label: 'Agenda: deadlines en projecten', needs: [{ table: 'life_items' }] },
  { file: '20261027120000_life_appointments.sql', label: 'Agenda: afspraken', needs: [{ lifeKind: 'appointment' }] },
  { file: '20261027130000_files.sql', label: 'Bestanden in je account', needs: [{ bucket: 'nexus-files' }] },
  { file: '20261027150000_grades_habits.sql', label: 'Cijfers en Gewoontes syncen', needs: [{ settingsKey: 'grades' }, { settingsKey: 'habits' }] },
  { file: '20261027160000_flashcards.sql', label: 'Leerkaarten syncen', needs: [{ settingsKey: 'flashcards' }] },
  { file: '20261028100000_finance.sql', label: 'Financiën syncen', needs: [{ settingsKey: 'finance' }] },
  { file: '20261028120000_exams_journal.sql', label: 'Examens en Dagboek syncen', needs: [{ settingsKey: 'exams' }, { settingsKey: 'journal' }] },
  { file: '20261028140000_study_groups.sql', label: 'Studiegroep', needs: [{ table: 'study_groups' }, { table: 'study_group_members' }, { table: 'study_group_items' }, { fn: 'join_study_group' }] },
  { file: '20261029120000_study_groups_live.sql', label: 'Studiegroep live en groepsdeadlines', needs: [{ table: 'study_group_tasks' }, { table: 'study_group_task_done' }] },
  { file: '20261029150000_error_reports.sql', label: 'Probleem melden', needs: [{ table: 'error_reports' }] },
  { file: '20261029170000_spaces.sql', label: 'Spaces syncen', needs: [{ settingsKey: 'spaces' }] },
  { file: '20261029190000_inbox.sql', label: 'Universal Inbox syncen', needs: [{ table: 'inbox_items' }] },
  { file: '20261030090000_flows_server.sql', label: 'Flows op de server', needs: [{ fn: 'flows_server_status' }] },
]

/** What nexus_schema_status() returns. */
export interface SchemaStatus {
  tables: string[]
  functions: string[]
  constraints: Record<string, string>
  buckets: string[]
}

export function parseSchemaStatus(value: unknown): SchemaStatus | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  const strings = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : [])
  const constraints: Record<string, string> = {}
  if (typeof v.constraints === 'object' && v.constraints !== null) {
    for (const [k, def] of Object.entries(v.constraints)) if (typeof def === 'string') constraints[k] = def
  }
  return { tables: strings(v.tables), functions: strings(v.functions), constraints, buckets: strings(v.buckets) }
}

/** Whether a check constraint (as pg_get_constraintdef writes it) allows this text value. */
function allows(def: string | undefined, value: string): boolean {
  return def !== undefined && def.includes(`'${value}'`)
}

function met(need: SchemaNeed, s: SchemaStatus): boolean {
  if ('table' in need) return s.tables.includes(need.table)
  if ('fn' in need) return s.functions.includes(need.fn)
  if ('bucket' in need) return s.buckets.includes(need.bucket)
  if ('settingsKey' in need) return s.tables.includes('user_settings') && allows(s.constraints.user_settings_key_check, need.settingsKey)
  return s.tables.includes('life_items') && allows(s.constraints.life_items_kind_check, need.lifeKind)
}

/** The steps still to run, in the order of their files. */
export function missingSteps(status: SchemaStatus, steps: SchemaStep[] = SCHEMA_STEPS): SchemaStep[] {
  return steps.filter((step) => !step.needs.every((n) => met(n, status)))
}

/**
 * Without the check function NEXUS can still see which tables exist (one probe each); the steps
 * that only change a constraint stay unknown until the check itself is installed.
 */
export function missingFromTables(present: (table: string) => boolean, steps: SchemaStep[] = SCHEMA_STEPS): { missing: SchemaStep[]; unknown: SchemaStep[] } {
  const missing: SchemaStep[] = []
  const unknown: SchemaStep[] = []
  for (const step of steps) {
    const tables = step.needs.filter((n): n is { table: string } => 'table' in n)
    if (tables.some((n) => !present(n.table))) missing.push(step)
    else if (tables.length < step.needs.length) unknown.push(step)
  }
  return { missing, unknown }
}

/** Every table a probe has to look at in [missingFromTables]. */
export const SCHEMA_TABLES = [...new Set(SCHEMA_STEPS.flatMap((s) => s.needs.flatMap((n) => ('table' in n ? [n.table] : []))))]
