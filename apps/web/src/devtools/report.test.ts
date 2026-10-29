import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { makeReport, sendReport } from './report'

function fakeClient(signedIn: boolean, insertError: { code?: string; message: string } | null) {
  const inserted: unknown[] = []
  const client = {
    auth: { getSession: async () => ({ data: { session: signedIn ? {} : null } }) },
    from: (table: string) => ({
      insert: async (row: unknown) => {
        inserted.push({ table, row })
        return { error: insertError }
      },
    }),
  } as unknown as SupabaseClient
  return { client, inserted }
}

describe('sendReport', () => {
  const report = makeReport('Notities', new Error('boom'), 'Ik typte')

  it('stores the report when signed in', async () => {
    const { client, inserted } = fakeClient(true, null)
    expect(await sendReport(client, report)).toBe('sent')
    expect(inserted).toEqual([{ table: 'error_reports', row: report }])
    expect(report).toMatchObject({ app: 'Notities', message: 'Error: boom', note: 'Ik typte', version: __APP_VERSION__ })
  })

  it('says why it could not send', async () => {
    expect(await sendReport(null, report)).toBe('signed-out')
    expect(await sendReport(fakeClient(false, null).client, report)).toBe('signed-out')
    expect(await sendReport(fakeClient(true, { code: 'PGRST205', message: 'Could not find the table' }).client, report)).toBe('setup')
    expect(await sendReport(fakeClient(true, { code: 'P0001', message: 'too many error reports' }).client, report)).toBe('too-many')
    expect(await sendReport(fakeClient(true, { message: 'Failed to fetch' }).client, report)).toBe('failed')
  })
})
