import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TeamProjectTask } from '@nexus/core'
import { remindDueTeamTasks } from './dueReminders'

const now = new Date(2030, 0, 10, 12, 0).getTime()
const task: TeamProjectTask = { id: 't1', projectId: 'p1', groupId: 'g1', title: 'Verslag', status: 'doing', assignee: 'me', dueAt: new Date(2030, 0, 11, 9, 0).getTime(), createdBy: 'z', updatedBy: 'z', updatedAt: 0 }

describe('team task reminders', () => {
  afterEach(() => localStorage.clear())

  it('reminds here and on the phone once, and again after a new date', async () => {
    const teams = { myDueTasks: vi.fn(async () => ({ tasks: [task], projects: new Map([['p1', 'Labo']]) })) }
    const effects = { local: vi.fn(async () => {}), phones: vi.fn(async () => {}) }
    expect(await remindDueTeamTasks(teams, 'me', effects, now)).toBe(1)
    expect(teams.myDueTasks).toHaveBeenCalledWith('me', now + 24 * 60 * 60_000)
    expect(effects.local).toHaveBeenCalledWith('Teamtaak bijna te laat', 'Verslag (Labo) moet af tegen morgen om 09:00.', `teamtask:t1:${task.dueAt}`)
    expect(effects.phones).toHaveBeenCalledTimes(1)
    expect(await remindDueTeamTasks(teams, 'me', effects, now + 60_000)).toBe(0)

    teams.myDueTasks.mockImplementation(async () => ({ tasks: [{ ...task, dueAt: task.dueAt! + 3_600_000 }], projects: new Map() }))
    expect(await remindDueTeamTasks(teams, 'me', effects, now + 120_000)).toBe(1)
    expect(effects.local).toHaveBeenLastCalledWith('Teamtaak bijna te laat', 'Verslag moet af tegen morgen om 10:00.', expect.any(String))
  })

  it('still reminds here when the phone cannot be reached', async () => {
    const teams = { myDueTasks: vi.fn(async () => ({ tasks: [task], projects: new Map() })) }
    const effects = { local: vi.fn(async () => {}), phones: vi.fn(async () => Promise.reject(new Error('geen gsm'))) }
    expect(await remindDueTeamTasks(teams, 'me', effects, now)).toBe(1)
    expect(effects.local).toHaveBeenCalledTimes(1)
  })
})
