import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { parseAdminOverview } from '@nexus/core'
import type { Admin as AdminApi } from '../admin/admin'

const { Admin } = await import('./Admin')
const { adminError } = await import('../admin/admin')

describe('Beheer', () => {
  afterEach(cleanup)

  it('toont wie online is, de tellingen, teams en foutmeldingen', async () => {
    const overview = parseAdminOverview({
      at: '2026-11-13T15:00:00Z',
      accounts: { total: 7, new7d: 2, active24h: 3, active7d: 5 },
      online: [{ name: 'Bram', state: 'busy' }, { name: 'Zoë', state: 'available' }],
      devices: { web: 4 },
      teams: [{ name: '1IT3', members: 5, online: 2, messages7d: 12 }],
      activity: { friendships: 3, directMessages7d: 9 },
      errors: { count7d: 1, latest: [{ at: '2026-11-13T10:00:00Z', app: 'Agenda', message: 'Het rooster laadt niet', version: '1.0', name: 'Bram' }] },
    })
    const api = { overview: vi.fn(async () => overview) } as unknown as AdminApi
    render(<Admin api={api} />)
    expect(await screen.findByText('Zoë')).toBeTruthy()
    expect(screen.getByText('(bezet)')).toBeTruthy()
    expect(screen.getByText('2 nieuw deze week')).toBeTruthy()
    expect(screen.getByRole('cell', { name: '1IT3' })).toBeTruthy()
    expect(screen.getByText('Het rooster laadt niet')).toBeTruthy()
    expect(screen.getByText(/4 browser/)).toBeTruthy()
  })

  it('zegt het als je geen beheerder bent of de SQL-stap ontbreekt', async () => {
    expect(adminError({ code: '42501', message: 'not an admin' })).toMatch(/Alleen een beheerder/)
    expect(adminError({ code: 'PGRST202', message: 'Could not find the function public.admin_overview' })).toBe('setup:supabase/migrations/20261113240000_admin.sql')
    const api = { overview: vi.fn(async () => Promise.reject(new Error(adminError({ code: '42501', message: 'not an admin' })))) } as unknown as AdminApi
    render(<Admin api={api} />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/Alleen een beheerder/)
  })
})
