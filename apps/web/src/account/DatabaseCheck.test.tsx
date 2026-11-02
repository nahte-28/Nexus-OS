import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SCHEMA_STEPS } from '@nexus/core'
import { DatabaseCheck } from './DatabaseCheck'
import { allMissingSql, checkSchema, migrationSql, sqlEditorUrl } from './schema'

const client = {} as SupabaseClient

describe('Database-check', () => {
  afterEach(cleanup)

  it('says when everything is in order', async () => {
    render(<DatabaseCheck client={client} check={async () => ({ missing: [], unknown: [], checkInstalled: true })} />)
    expect(await screen.findByText(/helemaal in orde/)).toBeTruthy()
  })

  it('lists missing steps and copies their SQL', async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    const step = SCHEMA_STEPS.at(-1)!
    render(<DatabaseCheck client={client} check={async () => ({ missing: [step], unknown: [], checkInstalled: true })} sql={async (f) => `-- ${f}`} />)
    expect(await screen.findByText(/nog 1 SQL-stap/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: `SQL van ${step.file} kopiëren` }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`-- ${step.file}`))
    expect(await screen.findByText('Gekopieerd')).toBeTruthy()
  })

  it('bundles the SQL of every step', async () => {
    for (const s of SCHEMA_STEPS) expect(await migrationSql(s.file)).toMatch(/\S/)
    expect(await migrationSql('20261029090000_schema_check.sql')).toContain('nexus_schema_status')
  })

  it('falls back to table probes before the check is installed', async () => {
    const probe = { select: () => ({ limit: async () => ({ error: null }) }) }
    const fake = {
      rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.nexus_schema_status' } }),
      from: (t: string) => (t === 'study_groups' ? { select: () => ({ limit: async () => ({ error: { code: 'PGRST205', message: 'Could not find the table' } }) }) } : probe),
    } as unknown as SupabaseClient
    const report = await checkSchema(fake)
    expect(report.checkInstalled).toBe(false)
    expect(report.missing.map((s) => s.file)).toEqual(['20261029090000_schema_check.sql', '20261028140000_study_groups.sql'])
  })
  it('copies every missing step at once and links the SQL Editor', async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    const [a, b] = SCHEMA_STEPS.slice(-2)
    render(<DatabaseCheck client={client} check={async () => ({ missing: [b], unknown: [a], checkInstalled: true })} sql={async (f) => `select '${f}';`} projectUrl="https://abcdefgh.supabase.co" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Alles in één keer kopiëren' }))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    const text = (writeText.mock.calls[0] as unknown as [string])[0]
    expect(text.indexOf(a.file)).toBeLessThan(text.indexOf(b.file))
    expect(text).toContain(`select '${b.file}';`)
    expect(screen.getByRole('link', { name: 'SQL Editor openen' }).getAttribute('href')).toBe('https://supabase.com/dashboard/project/abcdefgh/sql/new')
  })

  it('makes one script of real migrations', async () => {
    const text = await allMissingSql({ missing: [SCHEMA_STEPS.find((s) => s.file === '20261020140000_flows.sql')!], unknown: [], checkInstalled: true })
    expect(text).not.toContain('public.notes')
    // From the oldest missing step on, also the steps after it that were run already.
    expect(text).toContain('20261020140000_flows.sql (ontbrak')
    expect(text).toContain('===== 20261102120000_flows_server_agenda.sql =====')
    expect(sqlEditorUrl('http://127.0.0.1:54321')).toBeNull()
  })
})
