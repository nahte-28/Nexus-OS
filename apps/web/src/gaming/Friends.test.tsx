import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { emptyGaming, saveGame, type GameAnswer, type GamingState, type StudyGroup, type TeamGamePlan, type TeamMember, type TeamRole } from '@nexus/core'
import { Friends } from './Friends'
import { friendsError, sharedPlaying, type FriendsData, type GamingFriends } from './friends'
import { gamingStore } from './store'

const ME = 'me-1'
function fake(myRole: TeamRole = 'member') {
  const teams: StudyGroup[] = [{ id: 'g1', name: 'Squad', inviteCode: 'ABCDEF23', createdBy: 'z' }]
  const members: TeamMember[] = [
    { groupId: 'g1', userId: ME, displayName: 'Ethan', role: myRole },
    { groupId: 'g1', userId: 'z', displayName: 'Remo', role: 'owner' },
  ]
  const data: FriendsData = {
    playing: [{ groupId: 'g1', userId: 'z', game: 'Rocket League', startedAt: Date.now() - 30 * 60_000 }],
    plans: [],
    answers: [],
  }
  const friends = {
    load: vi.fn(async () => ({ playing: [...data.playing], plans: [...data.plans], answers: [...data.answers] })),
    addPlan: vi.fn(async (groupId: string, game: string, startsAt: number, note: string) => void data.plans.push({ id: `p${data.plans.length}`, groupId, game, startsAt, note, createdBy: ME })),
    removePlan: vi.fn(async (id: string) => void data.plans.splice(data.plans.findIndex((p) => p.id === id), 1)),
    answer: vi.fn(async (plan: TeamGamePlan, answer: GameAnswer | null) => {
      data.answers = data.answers.filter((a) => !(a.planId === plan.id && a.userId === ME))
      if (answer) data.answers.push({ planId: plan.id, userId: ME, answer })
    }),
    watch: vi.fn(() => () => {}),
  } satisfies Pick<GamingFriends, 'load' | 'addPlan' | 'removePlan' | 'answer' | 'watch'>
  const teamsApi = {
    me: vi.fn(async () => ({ id: ME, email: 'ethan@student.ap.be' })),
    teams: vi.fn(async () => [...teams]),
    load: vi.fn(async () => ({ members: members.map((m) => ({ ...m })), invites: [], projects: [], tasks: [] })),
  }
  return { apis: { teams: teamsApi, friends }, data }
}

describe('Gaming › Vrienden', () => {
  afterEach(() => {
    cleanup()
    gamingStore.update(() => emptyGaming())
  })

  it('shows who plays, plans a session and answers it', async () => {
    const { apis, data } = fake()
    const state = saveGame(emptyGaming(), { id: 'g', name: 'Minecraft', platform: 'pc', status: 'playing', rating: null, notes: '' }, 1) as GamingState
    render(<Friends state={state} apis={apis} />)
    const team = await screen.findByRole('region', { name: 'Squad' })
    expect(within(team).getByText('Remo')).toBeTruthy()
    expect(within(team).getByText(/speelt Rocket League sinds/)).toBeTruthy()
    expect((within(team).getByLabelText('Game om samen te spelen') as HTMLInputElement).value).toBe('Minecraft')
    fireEvent.click(within(team).getByRole('button', { name: 'Sessie plannen' }))
    await waitFor(() => expect(apis.friends.addPlan).toHaveBeenCalled())
    expect(data.plans[0]).toMatchObject({ groupId: 'g1', game: 'Minecraft' })
    fireEvent.click(await within(team).findByRole('button', { name: 'Doe mee' }))
    await waitFor(() => expect(within(team).getByRole('button', { name: 'Doe mee (1)' }).getAttribute('aria-pressed')).toBe('true'))
    expect(within(team).getByText('Doen mee: Ethan.')).toBeTruthy()
  })

  it('lets you choose which team sees you gaming', async () => {
    const { apis } = fake()
    render(<Friends state={gamingStore.getSnapshot()} apis={apis} />)
    fireEvent.click(await screen.findByLabelText('Laat dit team zien wanneer ik game'))
    expect(gamingStore.getSnapshot().settings.shareTeams).toEqual(['g1'])
  })

  it('lets a viewer answer but not plan', async () => {
    const { apis } = fake('viewer')
    render(<Friends state={emptyGaming()} apis={apis} />)
    expect(await screen.findByText('Als kijker kun je antwoorden, maar geen sessie plannen.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sessie plannen' })).toBeNull()
  })

  it('asks for the SQL step when the tables are missing', async () => {
    const { apis } = fake()
    apis.friends.load.mockRejectedValue(new Error('setup:supabase/migrations/20261103090000_team_gaming.sql'))
    render(<Friends state={emptyGaming()} apis={apis} />)
    expect(await screen.findByText(/20261103090000_team_gaming.sql/)).toBeTruthy()
  })

  it('shares the running timer with the chosen teams only', () => {
    let s = saveGame(emptyGaming(), { id: 'g', name: 'Minecraft', platform: 'pc', status: 'playing', rating: null, notes: '' }, 1) as GamingState
    expect(sharedPlaying(s)).toEqual({ share: [], playing: null })
    s = { ...s, settings: { ...s.settings, shareTeams: ['g1'] }, active: { gameId: 'g', startedAt: 50, updatedAt: 50 } }
    expect(sharedPlaying(s)).toEqual({ share: ['g1'], playing: { game: 'Minecraft', startedAt: 50 } })
  })

  it('names the SQL step and the plan limit', () => {
    expect(friendsError({ code: '42P01', message: 'relation "public.team_playing" does not exist' })).toBe('setup:supabase/migrations/20261103090000_team_gaming.sql')
    expect(friendsError({ message: 'too many game plans' })).toMatch(/50 geplande sessies/)
  })
})
