import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { CommentTarget, GroupMember, TaskComment } from '@nexus/core'
import type { TaskComments } from './comments'

const { TaskCommentThread } = await import('./TaskCommentsPanel')
const { commentError } = await import('./comments')
const { flushOutbox, registerOutboxSender, resetOutbox } = await import('../offline/outbox')

const ME = 'me'
const members: GroupMember[] = [
  { groupId: 'g', userId: ME, displayName: 'Ethan' },
  { groupId: 'g', userId: 'r', displayName: 'Remo' },
  { groupId: 'g', userId: 'z', displayName: 'Zoë' },
]
const target: CommentTarget = { kind: 'project', taskId: 't1' }

function fake(start: TaskComment[]) {
  const list = [...start]
  const api = {
    load: vi.fn(async () => [...list]),
    add: vi.fn(async (groupId: string, t: CommentTarget, body: string, mentions: string[]) => {
      const c = { id: `c${list.length}`, groupId, target: t, userId: ME, body: body.trim(), mentions, createdAt: Date.now() }
      list.push(c)
      return c
    }),
    remove: vi.fn(async () => {}),
    watch: vi.fn(() => () => {}),
    counted: vi.fn(async () => []),
  }
  return api as typeof api & TaskComments
}

describe('Opmerkingen', () => {
  afterEach(() => {
    cleanup()
    resetOutbox()
    localStorage.clear()
  })

  it('keeps an opmerking written without internet waiting, and shows it once it went out', async () => {
    const api = fake([])
    api.add.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    render(<TaskCommentThread api={api} groupId="g" target={target} members={members} me={ME} role="member" />)
    await screen.findByText(/Nog geen opmerkingen/)
    const field = screen.getByLabelText('Opmerking') as HTMLTextAreaElement
    fireEvent.change(field, { target: { value: 'Klaar @Remo', selectionStart: 11 } })
    fireEvent.click(screen.getByRole('button', { name: 'Plaatsen' }))
    const waiting = await screen.findByRole('list', { name: 'Berichten die wachten' })
    expect(within(waiting).getByText('Klaar @Remo')).toBeTruthy()
    expect(field.value).toBe('')

    // Back online: the sender of startMentionNotices sends it, with the mention.
    registerOutboxSender('comment', { owner: () => ME, send: (item) => api.add('g', target, item.text, item.mentions ?? []) })
    await flushOutbox()
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Berichten die wachten' })).toBeNull())
    expect(api.add).toHaveBeenLastCalledWith('g', target, 'Klaar @Remo', ['r'])
    expect((await screen.findByText('@Remo')).tagName).toBe('STRONG')
  })

  it('suggests a member after @ and sends the mention along', async () => {
    const api = fake([{ id: 'a', groupId: 'g', target, userId: 'r', body: 'Hoe ver staat het, @Ethan?', mentions: [ME], createdAt: Date.now() - 1000 }])
    render(<TaskCommentThread api={api} groupId="g" target={target} members={members} me={ME} role="member" />)
    expect((await screen.findByText('@Ethan')).tagName).toBe('STRONG')
    const field = screen.getByLabelText('Opmerking') as HTMLTextAreaElement
    fireEvent.change(field, { target: { value: 'Bijna klaar @z', selectionStart: 14 } })
    fireEvent.click(await screen.findByRole('button', { name: '@Zoë' }))
    expect(field.value).toBe('Bijna klaar @Zoë ')
    fireEvent.change(field, { target: { value: 'Bijna klaar @Zoë kijk jij?', selectionStart: 26 } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await waitFor(() => expect(api.add).toHaveBeenCalledWith('g', target, 'Bijna klaar @Zoë kijk jij?', ['z']))
    expect(await screen.findByText(/kijk jij\?/)).toBeTruthy()
  })

  it('lets you remove only your own comment as a member', async () => {
    const api = fake([
      { id: 'a', groupId: 'g', target, userId: 'r', body: 'Van Remo', mentions: [], createdAt: 1 },
      { id: 'b', groupId: 'g', target, userId: ME, body: 'Van mij', mentions: [], createdAt: 2 },
    ])
    render(<TaskCommentThread api={api} groupId="g" target={target} members={members} me={ME} role="member" />)
    await screen.findByText('Van mij')
    const remove = screen.getAllByRole('button', { name: /verwijderen$/ })
    expect(remove).toHaveLength(1)
    fireEvent.click(remove[0])
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('b'))
    await waitFor(() => expect(screen.queryByText('Van mij')).toBeNull())
  })

  it('asks for the SQL step when the table is missing', () => {
    expect(commentError({ code: 'PGRST205', message: "Could not find the table 'public.team_task_comments'" })).toBe('setup:supabase/migrations/20261113120000_task_comments.sql')
  })
})
