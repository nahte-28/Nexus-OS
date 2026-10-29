import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkSchema, migrationSql, type SchemaReport } from './schema'

const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-60'

/** Account: which SQL steps your Supabase database still needs, with the SQL ready to copy. */
export function DatabaseCheck({ client, check = checkSchema, sql = migrationSql }: { client: SupabaseClient; check?: typeof checkSchema; sql?: typeof migrationSql }) {
  const [report, setReport] = useState<SchemaReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const run = useCallback(async () => {
    setBusy(true)
    try {
      setReport(await check(client))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [client, check])

  useEffect(() => void run(), [run])

  const copy = async (file: string) => {
    try {
      await navigator.clipboard.writeText(await sql(file))
      setCopied(file)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kopiëren lukte niet.')
    }
  }

  return (
    <section className="space-y-2 border-t border-nx-border pt-4" aria-label="Database-check">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 font-medium">Database-check</h3>
        <button type="button" className={small} disabled={busy} onClick={() => void run()}>
          {busy ? 'Nakijken…' : 'Opnieuw nakijken'}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-red-500">
          Nakijken lukte niet: {error}
        </p>
      )}
      {report && report.missing.length === 0 && <p role="status">✓ Je database is helemaal in orde. Alle SQL-stappen zijn uitgevoerd.</p>}
      {report && report.missing.length > 0 && (
        <>
          <p>
            {report.missing.length === 1 ? 'Er ontbreekt nog 1 SQL-stap.' : `Er ontbreken nog ${report.missing.length} SQL-stappen.`} Voer ze uit in deze volgorde: tik op <b>SQL kopiëren</b>, open in Supabase de <b>SQL Editor</b>, kies <b>New query</b>, plak en klik op <b>Run</b>. Kijk daarna hier opnieuw na.
          </p>
          <ol className="space-y-1">
            {report.missing.map((step, i) => (
              <li key={step.file} className="flex flex-wrap items-center gap-2 rounded-lg border border-nx-border px-3 py-2">
                <span className="w-5 shrink-0 text-nx-muted">{i + 1}.</span>
                <span className="min-w-0 flex-1">
                  <span className="block">{step.label}</span>
                  <code className="block font-mono text-xs text-nx-muted">{step.file}</code>
                </span>
                <button type="button" className={small} onClick={() => void copy(step.file)} aria-label={`SQL van ${step.file} kopiëren`}>
                  {copied === step.file ? 'Gekopieerd' : 'SQL kopiëren'}
                </button>
              </li>
            ))}
          </ol>
          {report.unknown.length > 0 && <p className="text-xs text-nx-muted">Na de eerste stap kan NEXUS ook nakijken: {report.unknown.map((s) => s.label).join(', ')}.</p>}
        </>
      )}
    </section>
  )
}
