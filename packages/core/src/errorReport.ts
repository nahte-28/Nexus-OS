/**
 * Probleem melden: what a one-click error report contains. Pure logic; the web app sends it to
 * the error_reports table (migration 20261029150000_error_reports.sql). No notes, messages or
 * other content: only the error, the version and NEXUS's own event log.
 */
export interface ReportLogLine {
  at: number
  source: string
  message: string
  error?: boolean
}

export interface ErrorReport {
  app: string
  message: string
  stack: string | null
  note: string | null
  version: string
  build: string
  platform: string
  log: ReportLogLine[]
}

export interface ErrorReportInput {
  app: string
  error?: { name?: string; message?: string; stack?: string } | null
  note?: string
  version: string
  build: string
  platform: string
  log: ReportLogLine[]
}

/** The same limits as the table's checks, so a report is never refused for its size. */
export const REPORT_LIMITS = { app: 80, message: 2000, stack: 4000, note: 2000, version: 40, build: 40, platform: 300, logLines: 30, logMessage: 300 }

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

export function buildErrorReport(input: ErrorReportInput): ErrorReport {
  const L = REPORT_LIMITS
  const note = input.note?.trim() ?? ''
  const err = input.error
  const message = err ? `${err.name ?? 'Error'}: ${err.message ?? ''}`.trim() : note || 'Probleem gemeld zonder foutmelding'
  return {
    app: clip(input.app.trim() || 'NEXUS', L.app),
    message: clip(message, L.message),
    stack: err?.stack ? clip(err.stack, L.stack) : null,
    note: note ? clip(note, L.note) : null,
    version: clip(input.version, L.version),
    build: clip(input.build, L.build),
    platform: clip(input.platform, L.platform),
    log: input.log.slice(0, L.logLines).map((line) => ({
      at: line.at,
      source: line.source,
      message: clip(line.message, L.logMessage),
      ...(line.error ? { error: true } : {}),
    })),
  }
}

/** The report as plain text, for copying when it cannot be sent. */
export function reportText(report: ErrorReport): string {
  const lines = [
    `NEXUS ${report.version} (${report.build}) – ${report.app}`,
    report.platform,
    '',
    report.message,
    ...(report.note && report.note !== report.message ? ['', `Wat ik deed: ${report.note}`] : []),
    ...(report.stack ? ['', report.stack] : []),
  ]
  if (report.log.length > 0) {
    lines.push('', 'Logboek:')
    for (const line of report.log) lines.push(`${new Date(line.at).toISOString()} [${line.source}]${line.error ? ' FOUT' : ''} ${line.message}`)
  }
  return lines.join('\n')
}
