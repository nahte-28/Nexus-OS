import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { GroupMember, SharedItem, StudyGroup } from '@nexus/core'
import type { StudyGroups } from '../study/group'

const { StudyGroupTab } = await import('./StudyGroup')
const { lifeStore } = await import('../life/store')

const ME = 'me-1'
function fake(signedIn = true) {
  const groups: StudyGroup[] = []
  const members: GroupMember[] = []
  const items: SharedItem[] = []
  const api = {
    me: vi.fn(async () => (signedIn ? { id: ME, email: 'ethan.voorbeeld@student.ap.be' } : null)),
    groups: vi.fn(async () => [...groups]),
    create: vi.fn(async (name: string, displayName: string) => {
      const g = { id: 'g1', name, inviteCode: 'ABCDEF23', createdBy: ME }
      groups.push(g)
      members.push({ groupId: 'g1', userId: ME, displayName }, { groupId: 'g1', userId: 'z', displayName: 'Zoë' })
      items.push({ groupId: 'g1', userId: 'z', sourceId: 'x', kind: 'deadline', title: 'Verslag Zoë', at: Date.now() + 86_400_000, endAt: null, done: false })
      return g
    }),
    join: vi.fn(async () => null),
    leave: vi.fn(async () => {}),
    load: vi.fn(async () => ({ members: [...members], items: [...items] })),
    share: vi.fn(async (groupId: string, sourceId: string) => {
      const d = lifeStore.getSnapshot().find((i) => i.id === sourceId)
      if (d?.kind === 'deadline') items.push({ groupId, userId: ME, sourceId, kind: 'deadline', title: d.title, at: d.dueAt, endAt: null, done: false })
    }),
    unshare: vi.fn(async () => {}),
    takeOver: vi.fn(async (item: SharedItem) => lifeStore.addDeadline({ title: item.title, dueAt: item.at, projectId: null, notes: '', remind: [], target: 'this_device' })),
  }
  return api as typeof api & StudyGroups
}

describe('Studiegroep', () => {
  afterEach(cleanup)

  it('asks to sign in first', async () => {
    render(<StudyGroupTab groups={fake(false)} />)
    expect(await screen.findByText(/Meld je aan in Account/)).toBeTruthy()
  })

  it('makes a group, shares a deadline and takes over one of a friend', async () => {
    await lifeStore.addDeadline({ title: 'Eigen opdracht', dueAt: Date.now() + 2 * 86_400_000, projectId: null, notes: '', remind: [], target: 'this_device' })
    const groups = fake()
    render(<StudyGroupTab groups={groups} />)
    fireEvent.click(await screen.findByRole('button', { name: '+ Nieuwe groep' }))
    fireEvent.change(screen.getByLabelText('Naam van de groep'), { target: { value: '1IT3' } })
    expect((screen.getByLabelText('Je naam in de groep') as HTMLInputElement).value).toBe('ethan voorbeeld')
    fireEvent.click(screen.getByRole('button', { name: 'Groep maken' }))
    expect(await screen.findByText('ABCD-EF23')).toBeTruthy()
    expect(groups.create).toHaveBeenCalledWith('1IT3', 'ethan voorbeeld')
    expect(await screen.findByText(/2 leden: ethan voorbeeld \(jij\), Zoë/)).toBeTruthy()

    fireEvent.click(screen.getByRole('checkbox', { name: /Eigen opdracht/ }))
    await waitFor(() => expect(groups.share).toHaveBeenCalledWith('g1', expect.any(String)))
    await waitFor(() => expect((screen.getByRole('checkbox', { name: /Eigen opdracht/ }) as HTMLInputElement).checked).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: 'In mijn Agenda' }))
    await waitFor(() => expect(lifeStore.getSnapshot().some((i) => i.kind === 'deadline' && i.title === 'Verslag Zoë')).toBe(true))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'In mijn Agenda' })).toBeNull())
  })

  it('refuses a malformed invite code', async () => {
    const groups = fake()
    render(<StudyGroupTab groups={groups} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Lid worden met een code' }))
    fireEvent.change(screen.getByLabelText('Uitnodigingscode'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lid worden' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(groups.join).not.toHaveBeenCalled()
  })
})
