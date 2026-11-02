import { describe, expect, it } from 'vitest'
import {
  formatTeamCode,
  inviteState,
  inviteSummary,
  memberName,
  myTeamTasks,
  normalizeTeamCode,
  roleChoices,
  canRemove,
  sortMembers,
  teamBoard,
  teamCan,
  teamProjectProgress,
  type TeamInvite,
  type TeamMember,
  type TeamProjectTask,
} from './teams'

const HOUR = 3_600_000
const invite = (over: Partial<TeamInvite> = {}): TeamInvite => ({ id: 'i', groupId: 'g', code: 'ABCDEFGH23', role: 'member', expiresAt: 10 * HOUR, maxUses: null, uses: 0, createdBy: 'o', ...over })
const task = (over: Partial<TeamProjectTask>): TeamProjectTask => ({ id: 't', projectId: 'p', groupId: 'g', title: 'Taak', status: 'todo', assignee: null, dueAt: null, createdBy: 'o', updatedBy: 'o', updatedAt: 0, ...over })

describe('teams', () => {
  it('lets each role do what the database allows', () => {
    expect(teamCan('viewer', 'edit')).toBe(false)
    expect(teamCan('member', 'edit')).toBe(true)
    expect(teamCan('member', 'manage')).toBe(false)
    expect(teamCan('admin', 'manage')).toBe(true)
    expect(teamCan('admin', 'inviteAdmin')).toBe(false)
    expect(teamCan('owner', 'transfer')).toBe(true)
    expect(teamCan(null, 'edit')).toBe(false)
  })

  it('offers only the role changes the database accepts', () => {
    expect(roleChoices('owner', 'member')).toEqual(['admin', 'member', 'viewer'])
    expect(roleChoices('admin', 'viewer')).toEqual(['member', 'viewer'])
    expect(roleChoices('admin', 'admin')).toEqual([])
    expect(roleChoices('owner', 'owner')).toEqual([])
    expect(roleChoices('owner', 'admin', true)).toEqual([])
    expect(roleChoices('member', 'viewer')).toEqual([])
    expect(canRemove('admin', 'member')).toBe(true)
    expect(canRemove('admin', 'owner')).toBe(false)
  })

  it('sorts the owner first, then by role and name', () => {
    const m = (userId: string, role: TeamMember['role'], displayName: string): TeamMember => ({ groupId: 'g', userId, role, displayName })
    expect(sortMembers([m('1', 'viewer', 'A'), m('2', 'member', 'Z'), m('3', 'owner', 'Q'), m('4', 'member', 'B')]).map((x) => x.userId)).toEqual(['3', '4', '2', '1'])
  })

  it('knows when an invitation expired or ran out', () => {
    expect(inviteState(invite(), HOUR)).toBe('active')
    expect(inviteState(invite(), 10 * HOUR)).toBe('expired')
    expect(inviteState(invite({ maxUses: 2, uses: 2 }), HOUR)).toBe('usedUp')
    expect(inviteSummary(invite({ maxUses: 5, uses: 1 }), 7 * HOUR)).toBe('Nog 3 uur geldig · 1 van 5 keer gebruikt')
    expect(inviteSummary(invite(), 11 * HOUR)).toBe('Vervallen · 0 keer gebruikt')
  })

  it('reads invitation codes and permanent group codes', () => {
    expect(normalizeTeamCode('abcde-fgh23')).toEqual({ code: 'ABCDEFGH23', kind: 'invite' })
    expect(normalizeTeamCode('ABCD EF23')).toEqual({ code: 'ABCDEF23', kind: 'group' })
    expect(normalizeTeamCode('ABCDEF2I')).toBeNull()
    expect(formatTeamCode('ABCDEFGH23')).toBe('ABCDE-FGH23')
    expect(formatTeamCode('ABCDEF23')).toBe('ABCD-EF23')
  })

  it('puts project tasks on a board, soonest first', () => {
    const tasks = [task({ id: 'a', dueAt: 5 }), task({ id: 'b' }), task({ id: 'c', dueAt: 2 }), task({ id: 'd', status: 'done' }), task({ id: 'e', projectId: 'q' })]
    const board = teamBoard(tasks, 'p')
    expect(board.todo.map((t) => t.id)).toEqual(['c', 'a', 'b'])
    expect(board.done.map((t) => t.id)).toEqual(['d'])
    expect(teamProjectProgress(tasks, 'p')).toEqual({ done: 1, total: 4 })
  })

  it('lists your open tasks and names people', () => {
    const tasks = [task({ id: 'a', assignee: 'me', dueAt: 3 }), task({ id: 'b', assignee: 'me', status: 'done' }), task({ id: 'c', assignee: 'x' })]
    expect(myTeamTasks(tasks, 'me').map((t) => t.id)).toEqual(['a'])
    const members = [{ groupId: 'g', userId: 'x', displayName: 'Zoë' }]
    expect(memberName(members, 'x', 'me')).toBe('Zoë')
    expect(memberName(members, 'me', 'me')).toBe('jij')
    expect(memberName(members, 'gone', 'me')).toBe('Oud lid')
    expect(memberName(members, null, 'me')).toBe('Niemand')
  })
})
