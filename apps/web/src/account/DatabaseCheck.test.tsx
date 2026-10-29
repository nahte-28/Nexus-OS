import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SCHEMA_STEPS } from '@nexus/core'
import { DatabaseCheck } from './DatabaseCheck'
import { checkSchema, migrationSql } from './schema'

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
})
