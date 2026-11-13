import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { DirectMessage, FriendEntry } from '@nexus/core'
import type { DirectMessages } from './dm'

const { Messages } = await import('./Messages')

const friends: FriendEntry[] = [
  { userId: 'r', displayName: 'Remo', kind: 'friend', since: 0 },
  { userId: 'z', displayName: 'Zoë', kind: 'friend', since: 0 },
  { userId: 'b', displayName: 'Bram', kind: 'incoming', since: 0 },
]

function fake(list: DirectMessage[]) {
  const dms = {
    recent: vi.fn(async () => [...list]),
    conversation: vi.fn(async () => list.filter((m) => m.sender === 'r' || m.recipient === 'r')),
    send: vi.fn(async (friend: string, text: string) => ({ id: `s${list.length}`, sender: 'me', recipient: friend, createdAt: Date.now(), readAt: null, text })),
    markRead: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    watch: vi.fn(() => () => {}),
  }
  return dms as typeof dms & DirectMessages
}

describe('Berichten', () => {
  afterEach(cleanup)

  it('lists friends with unread messages and opens a conversation that marks them read', async () => {
    const dms = fake([
      { id: '1', sender: 'r', recipient: 'me', createdAt: Date.now() - 5000, readAt: null, text: 'Hoi Ethan' },
      { id: '2', sender: 'r', recipient: 'me', createdAt: Date.now() - 4000, readAt: null, text: null },
    ])
    render(<Messages dms={dms} me="me" friends={friends} sealed />)
    expect(await screen.findByLabelText('2 ongelezen')).toBeTruthy()
    expect(screen.queryByText('Bram')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Remo/ }))
    expect(await screen.findByText('Hoi Ethan')).toBeTruthy()
    expect(screen.getByText(/Niet te lezen op dit toestel/)).toBeTruthy()
    await waitFor(() => expect(dms.markRead).toHaveBeenCalledWith('r'))
    const field = screen.getByLabelText('Privébericht')
    fireEvent.change(field, { target: { value: 'Hallo terug' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await waitFor(() => expect(dms.send).toHaveBeenCalledWith('r', 'Hallo terug'))
    expect(await screen.findByText('Hallo terug')).toBeTruthy()
  })

  it('says when this device cannot seal messages yet', async () => {
    render(<Messages dms={fake([])} me="me" friends={friends} sealed={false} />)
    expect(await screen.findByText(/nog niet klaar/)).toBeTruthy()
  })
})
