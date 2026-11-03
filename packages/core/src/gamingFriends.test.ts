import { describe, expect, it } from 'vitest'
import { checkGamePlan, planAnswers, playingNow, upcomingPlans, type TeamGamePlan } from './gamingFriends'
import { emptyGaming, parseGaming, setShareTeam } from './gaming'
import type { TeamMember } from './teams'

const H = 3_600_000
const members: TeamMember[] = [
  { groupId: 't', userId: 'me', displayName: 'Ethan', role: 'owner' },
  { groupId: 't', userId: 'a', displayName: 'Remo', role: 'member' },
  { groupId: 't', userId: 'b', displayName: 'Bram', role: 'viewer' },
]
const plan = (id: string, startsAt: number): TeamGamePlan => ({ id, groupId: 't', game: 'Rocket League', startsAt, note: '', createdBy: 'a' })

describe('Gamevrienden', () => {
  it('shows who is playing, without yourself, and marks a timer left running', () => {
    const now = 100 * H
    const list = playingNow(
      [
        { groupId: 't', userId: 'me', game: 'Minecraft', startedAt: now - H },
        { groupId: 't', userId: 'a', game: 'Rocket League', startedAt: now - 2 * H },
        { groupId: 't', userId: 'b', game: 'Fortnite', startedAt: now - 20 * H },
        { groupId: 't', userId: 'gone', game: 'X', startedAt: now },
      ],
      members,
      'me',
      now,
    )
    expect(list.map((p) => [p.name, p.stale])).toEqual([['Bram', true], ['Remo', false]])
  })

  it('lists plans to come, soonest first, until three hours after they start', () => {
    const now = 100 * H
    expect(upcomingPlans([plan('late', now + 5 * H), plan('old', now - 4 * H), plan('now', now - H)], now).map((p) => p.id)).toEqual(['now', 'late'])
  })

  it('counts the answers by name and knows yours', () => {
    const answers = [
      { planId: 'p', userId: 'a', answer: 'yes' as const },
      { planId: 'p', userId: 'me', answer: 'yes' as const },
      { planId: 'p', userId: 'b', answer: 'maybe' as const },
      { planId: 'other', userId: 'b', answer: 'no' as const },
    ]
    expect(planAnswers('p', answers, members, 'me')).toEqual({ names: { yes: ['Ethan', 'Remo'], maybe: ['Bram'], no: [] }, mine: 'yes' })
  })

  it('checks a new plan', () => {
    const now = 100 * H
    expect(checkGamePlan(' ', now + H, now)).toBe('Welke game?')
    expect(checkGamePlan('RL', now - H, now)).toBe('Dat moment is al voorbij.')
    expect(checkGamePlan('RL', now + 61 * 24 * H, now)).toBe('Plan hoogstens 60 dagen vooruit.')
    expect(checkGamePlan('RL', now + H, now)).toBeNull()
  })

  it('remembers which teams see you gaming', () => {
    let s = setShareTeam(emptyGaming(), 't1', true, 5)
    s = setShareTeam(s, 't2', true, 6)
    s = setShareTeam(s, 't1', false, 7)
    expect(s.settings.shareTeams).toEqual(['t2'])
    expect(parseGaming(JSON.parse(JSON.stringify(s))).settings.shareTeams).toEqual(['t2'])
    expect(parseGaming({ settings: { shareTeams: ['x', 'x', 3] } }).settings.shareTeams).toEqual(['x'])
  })
})
