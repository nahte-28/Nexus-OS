import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { StudyGroup, TeamInvite, TeamMember, TeamProject, TeamProjectTask, TeamRole } from '@nexus/core'
import type { Teams as TeamsApi } from '../teams/teams'

const { Teams } = await import('./Teams')
const { lifeStore } = await import('../life/store')

const ME = 'me-1'
function fake(myRole: TeamRole = 'owner', signedIn = true) {
  const teams: StudyGroup[] = [{ id: 'g1', name: 'Projectgroep', inviteCode: 'ABCDEF23', createdBy: ME }]
  const members: TeamMember[] = [
    { groupId: 'g1', userId: ME, displayName: 'Ethan', role: myRole },
    { groupId: 'g1', userId: 'z', displayName: 'Zoë', role: 'member' },
  ]
  const invites: TeamInvite[] = []
  const projects: TeamProject[] = []
  const tasks: TeamProjectTask[] = []
  const api = {
    me: vi.fn(async () => (signedIn ? { id: ME, email: 'ethan@student.ap.be' } : null)),
    teams: vi.fn(async () => [...teams]),
    create: vi.fn(),
    join: vi.fn(async () => null),
    load: vi.fn(async (_g: string, manage: boolean) => ({ members: members.map((m) => ({ ...m })), invites: manage ? [...invites] : [], projects: [...projects], tasks: tasks.map((t) => ({ ...t })) })),
    watch: vi.fn(() => () => {}),
    invite: vi.fn(async (groupId: string, role: TeamInvite['role'], hours: number, maxUses: number | null) => {
      invites.push({ id: `i${invites.length}`, groupId, code: 'ABCDEFGH23', role, expiresAt: Date.now() + hours * 3_600_000, maxUses, uses: 0, createdBy: ME })
    }),
    withdraw: vi.fn(async (id: string) => void invites.splice(invites.findIndex((i) => i.id === id), 1)),
    setRole: vi.fn(async (_g: string, userId: string, role: TeamRole) => void (members.find((m) => m.userId === userId)!.role = role)),
    removeMember: vi.fn(async (_g: string, userId: string) => void members.splice(members.findIndex((m) => m.userId === userId), 1)),
    transfer: vi.fn(),
    addProject: vi.fn(async (groupId: string, name: string) => void projects.push({ id: `p${projects.length}`, groupId, name, createdBy: ME })),
    removeProject: vi.fn(),
    addTask: vi.fn(async (project: TeamProject, title: string, assignee: string | null, dueAt: number | null) => {
      tasks.push({ id: `t${tasks.length}`, projectId: project.id, groupId: project.groupId, title, status: 'todo', assignee, dueAt, createdBy: ME, updatedBy: ME, updatedAt: Date.now() })
    }),
    updateTask: vi.fn(async (id: string, change: Partial<TeamProjectTask>) => void Object.assign(tasks.find((t) => t.id === id)!, change)),
    removeTask: vi.fn(),
    rename: vi.fn(),
    remove: vi.fn(),
    leave: vi.fn(),
    takeOver: vi.fn((t: TeamProjectTask) => lifeStore.addDeadline({ title: t.title, dueAt: t.dueAt!, projectId: null, notes: '', remind: [], target: 'this_device' })),
  }
  return api as typeof api & TeamsApi
}

describe('Teams', () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('asks to sign in first', async () => {
    render(<Teams api={fake('owner', false)} />)
    expect(await screen.findByText(/Meld je aan in Account/)).toBeTruthy()
  })

  it('makes a shared project, adds a task for yourself and moves it along', async () => {
    const api = fake()
    render(<Teams api={api} />)
    fireEvent.change(await screen.findByLabelText('Naam van het project'), { target: { value: 'Labo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Project maken' }))
    expect(await screen.findByRole('heading', { name: 'Labo' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Titel van de taak'), { target: { value: 'Verslag' } })
    fireEvent.change(screen.getByLabelText('Voor wie'), { target: { value: ME } })
    fireEvent.change(screen.getByLabelText('Tegen wanneer'), { target: { value: '2030-01-10T12:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Taak toevoegen' }))
    await waitFor(() => expect(api.addTask).toHaveBeenCalledWith(expect.objectContaining({ name: 'Labo' }), 'Verslag', ME, Date.parse('2030-01-10T12:00')))
    expect(await screen.findByRole('heading', { name: 'Mijn taken' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Verslag naar Bezig' }))
    await waitFor(() => expect(within(screen.getByRole('group', { name: 'Bezig' })).getByText('Verslag')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'In mijn Agenda' }))
    await waitFor(() => expect(lifeStore.getSnapshot().some((i) => i.kind === 'deadline' && i.title === 'Verslag')).toBe(true))
  })

  it('lets the owner change roles and make invitations that expire', async () => {
    const api = fake()
    render(<Teams api={api} />)
    fireEvent.click(await screen.findByRole('tab', { name: 'Leden' }))
    fireEvent.change(await screen.findByLabelText('Rol van Zoë'), { target: { value: 'viewer' } })
    await waitFor(() => expect(api.setRole).toHaveBeenCalledWith('g1', 'z', 'viewer'))
    fireEvent.click(screen.getByRole('tab', { name: 'Uitnodigingen' }))
    fireEvent.change(await screen.findByLabelText('Rol'), { target: { value: 'admin' } })
    fireEvent.change(screen.getByLabelText('Geldig'), { target: { value: '24' } })
    fireEvent.change(screen.getByLabelText('Hoe vaak'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Uitnodiging maken' }))
    await waitFor(() => expect(api.invite).toHaveBeenCalledWith('g1', 'admin', 24, 5))
    expect(await screen.findByText('ABCDE-FGH23')).toBeTruthy()
    expect(screen.getByText(/Nog 24 uur geldig · 0 van 5 keer gebruikt/)).toBeTruthy()
  })

  it('shows a viewer the team without anything to change', async () => {
    render(<Teams api={fake('viewer')} />)
    expect(await screen.findByText(/Je bent kijker/)).toBeTruthy()
    expect(screen.queryByLabelText('Naam van het project')).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Uitnodigingen' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Leden' }))
    expect(screen.queryByLabelText('Rol van Zoë')).toBeNull()
  })
})
