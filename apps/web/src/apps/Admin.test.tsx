import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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

  it('toont alle accounts, ook wie offline is', async () => {
    const users = Array.from({ length: 22 }, (_, i) => ({ name: `lid${i}@test`, createdAt: '2026-11-01T10:00:00Z', lastSignIn: '2026-11-12T10:00:00Z', lastSeen: null, online: false }))
    const overview = parseAdminOverview({ accounts: { total: 23 }, users: [{ name: 'Bram', createdAt: '2026-11-01T10:00:00Z', lastSeen: '2026-11-13T14:59:00Z', online: true }, ...users] })
    const api = { overview: vi.fn(async () => overview) } as unknown as AdminApi
    render(<Admin api={api} />)
    const list = await screen.findByRole('region', { name: 'Alle accounts' })
    expect(within(list).getByText('Alle accounts (23)')).toBeTruthy()
    expect(within(list).getByText('Nu online')).toBeTruthy()
    expect(within(list).queryByText('lid21@test')).toBeNull()
    fireEvent.click(within(list).getByRole('button', { name: 'Toon alle 23' }))
    expect(within(list).getByText('lid21@test')).toBeTruthy()
  })

  it('zegt het als je geen beheerder bent of de SQL-stap ontbreekt', async () => {
    expect(adminError({ code: '42501', message: 'not an admin' })).toMatch(/Alleen een beheerder/)
    expect(adminError({ code: 'PGRST202', message: 'Could not find the function public.admin_overview' })).toBe('setup:supabase/migrations/20261113240000_admin.sql')
    const api = { overview: vi.fn(async () => Promise.reject(new Error(adminError({ code: '42501', message: 'not an admin' })))) } as unknown as AdminApi
    render(<Admin api={api} />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/Alleen een beheerder/)
  })
})
