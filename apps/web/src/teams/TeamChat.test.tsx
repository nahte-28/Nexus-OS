import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { StudyGroup, TeamMember, TeamMessage } from '@nexus/core'
import type { Teams as TeamsApi } from './teams'
import type { TeamChat } from './chat'

const { Teams } = await import('../apps/Teams')
const { chatError, chatReadAt } = await import('./chat')

const ME = 'me-1'
const team: StudyGroup = { id: 'g1', name: 'Projectgroep', inviteCode: 'ABCDEF23', createdBy: ME }

function fakeTeams(role: TeamMember['role'] = 'member') {
  const members: TeamMember[] = [
    { groupId: 'g1', userId: ME, displayName: 'Ethan', role },
    { groupId: 'g1', userId: 'z', displayName: 'Zoë', role: 'member' },
  ]
  return {
    me: vi.fn(async () => ({ id: ME, email: 'ethan@student.ap.be' })),
    teams: vi.fn(async () => [team]),
    load: vi.fn(async () => ({ members, invites: [], projects: [], tasks: [] })),
    watch: vi.fn(() => () => {}),
  } as unknown as TeamsApi
}

function fakeChat(start: TeamMessage[]) {
  const messages = [...start]
  let push: ((m: TeamMessage) => void) | null = null
  const chat = {
    load: vi.fn(async () => [...messages]),
    send: vi.fn(async (groupId: string, body: string) => {
      const m = { id: `n${messages.length}`, groupId, userId: ME, body: body.trim(), createdAt: Date.now() }
      messages.push(m)
      return m
    }),
    remove: vi.fn(async (id: string) => void messages.splice(messages.findIndex((m) => m.id === id), 1)),
    watch: vi.fn((_g: string | null, on: (m: TeamMessage) => void) => {
      push = on
      return () => (push = null)
    }),
  }
  return { chat: chat as typeof chat & TeamChat, incoming: (m: TeamMessage) => push?.(m) }
}

const earlier = Date.now() - 60_000
const start: TeamMessage[] = [{ id: 'a', groupId: 'g1', userId: 'z', body: 'Wie doet het verslag?', createdAt: earlier }]

describe('Teamchat', () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('shows unread messages on the tab, then the chat with names', async () => {
    const { chat } = fakeChat(start)
    render(<Teams api={fakeTeams()} chat={chat} />)
    const tab = await screen.findByRole('tab', { name: /Chat/ })
    await waitFor(() => expect(within(tab).getByLabelText('1 ongelezen')).toBeTruthy())
    fireEvent.click(tab)
    expect(await screen.findByText('Wie doet het verslag?')).toBeTruthy()
    expect(screen.getByText(/^Zoë ·/)).toBeTruthy()
    expect(within(screen.getByRole('tab', { name: /Chat/ })).queryByLabelText(/ongelezen/)).toBeNull()
    await waitFor(() => expect(chatReadAt('g1')).toBe(earlier))
  })

  it('sends with Enter, keeps Shift+Enter for a new line and shows live messages', async () => {
    const { chat, incoming } = fakeChat(start)
    localStorage.setItem('nexus.teams.tab', 'Chat')
    render(<Teams api={fakeTeams()} chat={chat} />)
    const field = await screen.findByLabelText('Bericht')
    fireEvent.change(field, { target: { value: 'Ik doe het' } })
    fireEvent.keyDown(field, { key: 'Enter', shiftKey: true })
    expect(chat.send).not.toHaveBeenCalled()
    fireEvent.keyDown(field, { key: 'Enter' })
    await waitFor(() => expect(chat.send).toHaveBeenCalledWith('g1', 'Ik doe het'))
    expect(await screen.findByText('Ik doe het')).toBeTruthy()
    expect((field as HTMLTextAreaElement).value).toBe('')
    incoming({ id: 'b', groupId: 'g1', userId: 'z', body: 'Top, bedankt', createdAt: Date.now() })
    expect(await screen.findByText('Top, bedankt')).toBeTruthy()
  })

  it('removes only your own messages as a member, any as an admin', async () => {
    const own: TeamMessage = { id: 'm', groupId: 'g1', userId: ME, body: 'Typfout', createdAt: Date.now() }
    localStorage.setItem('nexus.teams.tab', 'Chat')
    const { chat } = fakeChat([...start, own])
    render(<Teams api={fakeTeams()} chat={chat} />)
    await screen.findByText('Typfout')
    const buttons = screen.getAllByRole('button', { name: /verwijderen$/ })
    expect(buttons).toHaveLength(1)
    fireEvent.click(buttons[0])
    await waitFor(() => expect(chat.remove).toHaveBeenCalledWith('m'))
    await waitFor(() => expect(screen.queryByText('Typfout')).toBeNull())
    cleanup()
    render(<Teams api={fakeTeams('admin')} chat={fakeChat(start).chat} />)
    await screen.findByText('Wie doet het verslag?')
    expect(screen.getAllByRole('button', { name: /verwijderen$/ })).toHaveLength(1)
  })

  it('asks for the SQL step when the table is missing', () => {
    expect(chatError({ code: '42P01', message: 'relation "public.team_messages" does not exist' })).toBe('setup:supabase/migrations/20261113090000_team_chat.sql')
    expect(chatError({ message: 'too many messages' })).toMatch(/over een minuut/)
  })
})
