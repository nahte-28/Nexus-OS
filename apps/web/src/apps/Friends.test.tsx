import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { FriendEntry } from '@nexus/core'
import type { Friends as FriendsApi } from '../friends/friends'

const { Friends } = await import('./Friends')
const { friendError, openFriendFromUrl, pendingFriend } = await import('../friends/friends')

function fake(withProfile = true) {
  let profile = withProfile ? { displayName: 'Ethan', code: 'ABCDEFGH' } : null
  const list: FriendEntry[] = [
    { userId: 'r', displayName: 'Remo', kind: 'incoming', since: 0 },
    { userId: 'z', displayName: 'Zoë', kind: 'friend', since: Date.parse('2026-11-01') },
  ]
  const api = {
    me: vi.fn(async () => ({ id: 'me', email: 'ethan.a@student.ap.be' })),
    profile: vi.fn(async () => profile),
    setName: vi.fn(async (name: string) => (profile = { displayName: name, code: 'ABCDEFGH' })),
    renewCode: vi.fn(async () => (profile = { ...profile!, code: 'HGFEDCBA' })),
    list: vi.fn(async () => list.map((f) => ({ ...f }))),
    add: vi.fn(async () => ({ status: 'pending' as const, name: 'Bram' })),
    accept: vi.fn(async (id: string) => void (list.find((f) => f.userId === id)!.kind = 'friend')),
    remove: vi.fn(async (_me: string, id: string) => void list.splice(list.findIndex((f) => f.userId === id), 1)),
    watch: vi.fn(() => () => {}),
  }
  return api as typeof api & FriendsApi
}

describe('Vrienden', () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('asks for a name first, suggested from the e-mail address', async () => {
    const api = fake(false)
    render(<Friends api={api} />)
    const field = (await screen.findByLabelText('Je naam voor vrienden')) as HTMLInputElement
    expect(field.value).toBe('ethan a')
    fireEvent.change(field, { target: { value: 'Ethan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))
    await waitFor(() => expect(api.setName).toHaveBeenCalledWith('Ethan'))
    expect(await screen.findByLabelText('Jouw vriendencode')).toBeTruthy()
  })

  it('shows your code, answers a request first and sends one with a code', async () => {
    const api = fake()
    render(<Friends api={api} />)
    expect((await screen.findByLabelText('Jouw vriendencode')).textContent).toBe('ABCD-EFGH')
    const items = await screen.findAllByRole('listitem')
    expect(items[0].textContent).toContain('Remo')
    fireEvent.click(screen.getByRole('button', { name: 'Aanvaarden' }))
    await waitFor(() => expect(api.accept).toHaveBeenCalledWith('r'))
    fireEvent.change(screen.getByLabelText('Vriendencode'), { target: { value: 'wxyz-2345' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verzoek sturen' }))
    await waitFor(() => expect(api.add).toHaveBeenCalledWith('wxyz-2345'))
    expect((await screen.findByRole('status')).textContent).toMatch(/Verzoek gestuurd naar Bram/)
    fireEvent.click(screen.getByRole('button', { name: 'Vriendschap beëindigen met Zoë' }))
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('me', 'z'))
  })

  it('makes a new code after asking once more', async () => {
    const api = fake()
    render(<Friends api={api} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Nieuwe code' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ja, maak een nieuwe code' }))
    await waitFor(() => expect(screen.getByLabelText('Jouw vriendencode').textContent).toBe('HGFE-DCBA'))
  })

  it('keeps the code of a friend link and knows the SQL step', () => {
    expect(openFriendFromUrl({ pathname: '/vriend/wxyz-2345', hash: '' })).toBe(true)
    expect(pendingFriend()).toBe('WXYZ-2345')
    expect(friendError({ code: 'PGRST202', message: 'Could not find the function public.list_friends' })).toBe('setup:supabase/migrations/20261113150000_friends.sql')
  })
})
