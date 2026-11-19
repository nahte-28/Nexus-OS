import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { DirectMessage, FriendEntry, SystemMessage } from '@nexus/core'
import type { Birthdays } from './birthdaysApi'
import type { DirectMessages } from './dm'

const { AdminBirthdays, FriendBirthdays } = await import('./Birthdays')
const { Messages } = await import('./Messages')

const today = () => {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fake(inbox: SystemMessage[] = [], friends = [{ user: 'r', name: 'Remo', monthDay: today() }]) {
  const api = {
    friends: vi.fn(async () => friends),
    all: vi.fn(async () => [...friends, { name: 'ethan@test', monthDay: '01-01' }]),
    inbox: vi.fn(async () => inbox),
    markRead: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    publish: vi.fn(async () => {}),
  }
  return api as typeof api & Birthdays
}

const dms = {
  recent: vi.fn(async (): Promise<DirectMessage[]> => []),
  conversation: vi.fn(async (): Promise<DirectMessage[]> => []),
  send: vi.fn(),
  markRead: vi.fn(async () => {}),
  remove: vi.fn(),
  watch: vi.fn(() => () => {}),
} as unknown as DirectMessages

describe('Verjaardagen', () => {
  afterEach(cleanup)

  it('shows when friends are jarig, today first', async () => {
    render(<FriendBirthdays api={fake()} />)
    const list = await screen.findByRole('list', { name: 'Verjaardagen van vrienden' })
    expect(list.textContent).toContain('Remo')
    expect(list.textContent).toContain('Vandaag jarig')
  })

  it('shows every birthday in Beheer', async () => {
    render(<AdminBirthdays api={fake()} />)
    expect(await screen.findByText(/1 vandaag jarig · 2 ingevuld/)).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Verjaardagen van alle accounts' }).textContent).toContain('1 januari')
  })

  it('shows messages from NEXUS in Berichten, marks them read and opens the friend to congratulate', async () => {
    const friends: FriendEntry[] = [{ userId: 'r', displayName: 'Remo', kind: 'friend', since: 0 }]
    const api = fake([
      { id: '1', kind: 'birthday', title: 'Gelukkige verjaardag! 🎂', body: 'Gelukkige verjaardag, Ethan!', aboutUser: null, createdAt: Date.now(), readAt: null },
      { id: '2', kind: 'friend_birthday', title: 'Remo is vandaag jarig 🎂', body: 'Stuur Remo een berichtje om te feliciteren.', aboutUser: 'r', createdAt: Date.now(), readAt: null },
    ])
    render(<Messages dms={dms} me="me" friends={friends} sealed system={api} />)
    expect(await screen.findByText('Gelukkige verjaardag! 🎂')).toBeTruthy()
    await waitFor(() => expect(api.markRead).toHaveBeenCalledWith(null))
    fireEvent.click(screen.getByRole('button', { name: 'Feliciteer' }))
    expect(await screen.findByRole('list', { name: 'Gesprek met Remo' })).toBeTruthy()
  })
})
