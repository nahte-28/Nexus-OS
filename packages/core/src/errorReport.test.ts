import { describe, expect, it } from 'vitest'
import { buildErrorReport, REPORT_LIMITS, reportText } from './errorReport'

const base = { app: 'Notities', version: '1.0.0', build: 'abc1234', platform: 'Chrome op Windows', log: [] }

describe('error reports', () => {
  it('keeps the error, the note and the version', () => {
    const report = buildErrorReport({ ...base, error: { name: 'TypeError', message: 'x is undefined', stack: 'TypeError\n  at a' }, note: ' Ik opende een notitie ' })
    expect(report.message).toBe('TypeError: x is undefined')
    expect(report.note).toBe('Ik opende een notitie')
    expect(report.stack).toContain('at a')
    expect(reportText(report)).toContain('NEXUS 1.0.0 (abc1234) – Notities')
    expect(reportText(report)).toContain('Wat ik deed: Ik opende een notitie')
  })

  it('uses the note when there is no error, and stays within the table limits', () => {
    const report = buildErrorReport({
      ...base,
      note: 'a'.repeat(5000),
      log: Array.from({ length: 50 }, (_, i) => ({ at: i, source: 'sync', message: 'm'.repeat(500), error: i === 0 })),
    })
    expect(report.message.length).toBe(REPORT_LIMITS.message)
    expect(report.note?.length).toBe(REPORT_LIMITS.note)
    expect(report.stack).toBeNull()
    expect(report.log).toHaveLength(REPORT_LIMITS.logLines)
    expect(report.log[0]).toMatchObject({ error: true })
    expect(report.log[1].error).toBeUndefined()
    expect(report.log[0].message.length).toBe(REPORT_LIMITS.logMessage)
  })

  it('still has a message with neither an error nor a note', () => {
    expect(buildErrorReport(base).message).toBe('Probleem gemeld zonder foutmelding')
  })
})
