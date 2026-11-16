import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { NoteShare } from '@nexus/core'
import { notesStore } from '../state/notesStore'
import { setSharesApi, setSharesState, syncShares, type SharesApi } from './shares'
import { SharedNote, SharePanel } from './Sharing'

const share = (patch: Partial<NoteShare> = {}): NoteShare => ({ id: 's1', right: 'owner', noteId: 'n1', ownerName: 'Ethan', title: 'Samenvatting', body: 'H1', revision: 1, updatedAt: Date.now(), updatedByMe: true, updatedByName: 'Ethan', access: [], ...patch })

function fakeApi(list: NoteShare[]) {
  let shares = list
  const api = {
    list: vi.fn(async () => shares),
    create: vi.fn(async () => 's1'),
    grant: vi.fn(async () => {}),
    revoke: vi.fn(async () => {}),
    save: vi.fn(async (id: string, revision: number, title: string, body: string) => {
      shares = shares.map((s) => (s.id === id ? { ...s, revision: revision + 1, title, body, updatedAt: Date.now() } : s))
      return revision + 1
    }),
    remove: vi.fn(async (id: string) => {
      shares = shares.filter((s) => s.id !== id)
    }),
    set: (next: NoteShare[]) => (shares = next),
  }
  return api
}

describe('Notities delen', () => {
  afterEach(() => {
    cleanup()
    setSharesApi(null)
    setSharesState({ shares: null, error: null })
  })

  it('sends your edits, takes over an edit of someone else and stops when you delete the note', async () => {
    await notesStore.ready
    const id = notesStore.add()
    notesStore.update(id, { title: 'Samenvatting', body: 'H1' })
    const api = fakeApi([share({ noteId: id })])
    await syncShares(api as SharesApi, notesStore, Date.now(), false)
    expect(api.save).not.toHaveBeenCalled()

    await new Promise((r) => setTimeout(r, 5))
    notesStore.update(id, { body: 'H1 en H2' })
    await syncShares(api as SharesApi, notesStore, Date.now(), false)
    expect(api.save).toHaveBeenCalledWith('s1', 1, 'Samenvatting', 'H1 en H2')

    api.set([share({ noteId: id, body: 'H1 en H2, aangevuld door Remo', revision: 5, updatedByMe: false, updatedByName: 'Remo', updatedAt: Date.now() + 10 })])
    await syncShares(api as SharesApi, notesStore, Date.now() + 20, false)
    expect(notesStore.getSnapshot().find((n) => n.id === id)?.body).toBe('H1 en H2, aangevuld door Remo')

    notesStore.remove(id)
    await syncShares(api as SharesApi, notesStore, Date.now() + 30, false)
    expect(api.remove).toHaveBeenCalledWith('s1')
  })

  it('shares a note with a friend or a team', async () => {
    const api = fakeApi([])
    setSharesApi({ api, refresh: async () => {} })
    setSharesState({ shares: [] })
    const note = { id: 'n7', title: 'Labo', body: 'Meetwaarden', updatedAt: 1, deletedAt: null }
    const sources = {
      friends: { list: vi.fn(async () => [{ userId: 'u2', displayName: 'Remo', kind: 'friend' as const, since: 0 }]) },
      teams: { teams: vi.fn(async () => [{ id: 'g1', name: 'Labogroep', inviteCode: 'X', createdBy: 'me' }]) },
    }
    render(<SharePanel note={note} sources={sources} />)
    const select = await screen.findByRole('combobox', { name: 'Delen met' })
    await waitFor(() => expect(screen.getByRole('option', { name: 'Team Labogroep' })).toBeTruthy())
    fireEvent.change(select, { target: { value: 'group:g1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delen' }))
    await waitFor(() => expect(api.grant).toHaveBeenCalledWith('s1', { group: 'g1' }, true))
    expect(api.create).toHaveBeenCalledWith('n7', 'Labo', 'Meetwaarden')
  })

  it('shows who has it and takes access back', async () => {
    const api = fakeApi([])
    setSharesApi({ api, refresh: async () => {} })
    setSharesState({ shares: [share({ noteId: 'n8', access: [{ user: 'u2', group: null, name: 'Remo', canEdit: false }] })] })
    render(<SharePanel note={{ id: 'n8', title: 'x', body: '', updatedAt: 1, deletedAt: null }} sources={{ friends: { list: async () => [] }, teams: null }} />)
    expect(screen.getByRole('list', { name: 'Gedeeld met' }).textContent).toContain('Remo')
    fireEvent.click(screen.getByRole('button', { name: 'Niet meer delen met Remo' }))
    await waitFor(() => expect(api.revoke).toHaveBeenCalledWith('s1', { user: 'u2' }))
  })

  it('lets you edit along in a note shared with you, and only read when you may not edit', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const api = fakeApi([])
    setSharesApi({ api, refresh: async () => {} })
    const theirs = share({ right: 'edit', noteId: null, ownerName: 'Remo', updatedByMe: false, updatedByName: 'Remo', revision: 4 })
    const { unmount } = render(<SharedNote share={theirs} />)
    fireEvent.change(screen.getByLabelText('Inhoud'), { target: { value: 'H1, met mijn deel' } })
    await vi.advanceTimersByTimeAsync(1500)
    await waitFor(() => expect(api.save).toHaveBeenCalledWith('s1', 4, 'Samenvatting', 'H1, met mijn deel'))
    unmount()
    render(<SharedNote share={{ ...theirs, right: 'read' }} />)
    expect(screen.getByLabelText('Inhoud')).toHaveProperty('readOnly', true)
    expect(screen.getByRole('status').textContent).toContain('alleen lezen')
    vi.useRealTimers()
  })
})
