import type { SupabaseClient } from '@supabase/supabase-js'
import { buildErrorReport, type ErrorReport } from '@nexus/core'
import { isDesktopApp } from '../platform/desktop'
import { getLog, logEvent } from './log'

export const REPORT_MIGRATION = '20261029150000_error_reports.sql'

/** The last error NEXUS caught anywhere, so "Probleem melden" in Help can include it. */
let lastError: { app: string; error: Error } | null = null

export function rememberError(app: string, error: Error): void {
  lastError = { app, error }
}

export function takeLastError(): { app: string; error: Error } | null {
  return lastError
}

/** Errors outside any app (a failed promise, a script error) still reach the log and a report. */
export function watchGlobalErrors(): void {
  const record = (reason: unknown) => {
    const error = reason instanceof Error ? reason : new Error(String(reason))
    rememberError('NEXUS', error)
    logEvent('system', `Onverwachte fout: ${error.message}`, true)
  }
  window.addEventListener('error', (e) => record(e.error ?? e.message))
  window.addEventListener('unhandledrejection', (e) => record(e.reason))
}

function platform(): string {
  const where = isDesktopApp ? 'Windows-app' : window.matchMedia?.('(display-mode: standalone)').matches ? 'geïnstalleerde web-app' : 'browser'
  return `${where}; ${navigator.userAgent}`
}

export function makeReport(app: string, error: Error | null, note?: string): ErrorReport {
  return buildErrorReport({ app, error, note, version: __APP_VERSION__, build: __BUILD_COMMIT__, platform: platform(), log: getLog() })
}

export type SendResult = 'sent' | 'signed-out' | 'setup' | 'too-many' | 'failed'

/** Stores the report in error_reports; the owner reads it in the Supabase Table Editor. */
export async function sendReport(client: SupabaseClient | null, report: ErrorReport): Promise<SendResult> {
  if (!client) return 'signed-out'
  const { data } = await client.auth.getSession()
  if (!data.session) return 'signed-out'
  const { error } = await client.from('error_reports').insert(report)
  if (!error) {
    logEvent('system', `Probleem gemeld voor ${report.app}`)
    return 'sent'
  }
  const text = `${error.code ?? ''} ${error.message ?? ''}`
  if (/42P01|PGRST205|could not find the table|does not exist/i.test(text)) return 'setup'
  if (/too many error reports/i.test(text)) return 'too-many'
  return 'failed'
}
