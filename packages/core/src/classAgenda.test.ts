import { describe, expect, it } from 'vitest'
import { classAgendaOn, classCopyId, emptyClassAgenda, planClassAgenda, toClassAgenda, uuidFromHex, type ClassAgendaInput } from './classAgenda'
import type { Deadline } from './life'
import type { GroupTask } from './studyGroup'

const NOW = 1_000_000
const task = (id: string, over: Partial<GroupTask> = {}): GroupTask => ({ id, groupId: 'g1', createdBy: 'x', title: `Taak ${id}`, dueAt: NOW + 1000, doneBy: [], ...over })
const copy = (id: string, over: Partial<Deadline> = {}): Deadline => ({ id: `c-${id}`, kind: 'deadline', title: `Taak ${id}`, dueAt: NOW + 1000, projectId: null, notes: '', doneAt: null, remind: [], target: 'phone', updatedAt: 1, deletedAt: null, ...over })
const input = (over: Partial<ClassAgendaInput> = {}): ClassAgendaInput => ({
  groups: [{ id: 'g1', name: '1IT3', klas: '1IT3' }],
  tasks: { g1: [task('a')] },
  life: [],
  me: 'me',
  copyIdOf: { a: 'c-a', b: 'c-b' },
  state: emptyClassAgenda(),
  now: NOW,
  ...over,
})

describe('klasagenda', () => {
  it('is on for class teams and off for others, unless you chose', () => {
    expect(classAgendaOn(emptyClassAgenda(), { id: 'g1', klas: '1IT3' })).toBe(true)
    expect(classAgendaOn(emptyClassAgenda(), { id: 'g2', klas: null })).toBe(false)
    expect(classAgendaOn({ groups: { g1: false, g2: true }, seen: {} }, { id: 'g1', klas: '1IT3' })).toBe(false)
    expect(classAgendaOn({ groups: { g2: true }, seen: {} }, { id: 'g2' })).toBe(true)
  })

  it('adds new group deadlines of class teams to the Agenda, not past ones or other teams', () => {
    const plan = planClassAgenda(input({ groups: [{ id: 'g1', name: '1IT3', klas: '1IT3' }, { id: 'g2', name: 'Vrienden' }], tasks: { g1: [task('a'), task('old', { dueAt: NOW - 1 })], g2: [task('b', { groupId: 'g2' })] }, copyIdOf: { a: 'c-a', old: 'c-old', b: 'c-b' } }))
    expect(plan.add).toEqual([{ id: 'c-a', title: 'Taak a', dueAt: NOW + 1000, notes: expect.stringContaining('1IT3'), done: false }])
    expect(Object.keys(plan.seen)).toEqual(['a'])
  })

  it('keeps a copy you deleted deleted', () => {
    const plan = planClassAgenda(input({ life: [copy('a', { deletedAt: 5 })] }))
    expect(plan.add).toEqual([])
    expect(plan.update).toEqual([])
    expect(plan.seen.a).toBeDefined()
  })

  it('ticks off in the team what you ticked off in the Agenda, and the other way round', () => {
    const seen = { a: { groupId: 'g1', title: 'Taak a', dueAt: NOW + 1000, done: false } }
    const fromAgenda = planClassAgenda(input({ life: [copy('a', { doneAt: 7 })], state: { groups: {}, seen } }))
    expect(fromAgenda.markTask.map((m) => [m.task.id, m.done])).toEqual([['a', true]])
    expect(fromAgenda.seen.a.done).toBe(true)
    const fromTeam = planClassAgenda(input({ tasks: { g1: [task('a', { doneBy: ['me'] })] }, life: [copy('a')], state: { groups: {}, seen } }))
    expect(fromTeam.update).toEqual([{ id: 'c-a', doneAt: NOW }])
    expect(fromTeam.markTask).toEqual([])
    const undo = planClassAgenda(input({ tasks: { g1: [task('a', { doneBy: ['me'] })] }, life: [copy('a')], state: { groups: {}, seen: { a: { ...seen.a, done: true } } } }))
    expect(undo.markTask.map((m) => m.done)).toEqual([false])
  })

  it('follows a changed title or moment unless you changed your copy', () => {
    const seen = { a: { groupId: 'g1', title: 'Taak a', dueAt: NOW + 1000, done: false } }
    const plan = planClassAgenda(input({ tasks: { g1: [task('a', { title: 'Nieuw', dueAt: NOW + 5 })] }, life: [copy('a')], state: { groups: {}, seen } }))
    expect(plan.update).toEqual([{ id: 'c-a', title: 'Nieuw', dueAt: NOW + 5 }])
    const own = planClassAgenda(input({ tasks: { g1: [task('a', { title: 'Nieuw' })] }, life: [copy('a', { title: 'Mijn titel' })], state: { groups: {}, seen } }))
    expect(own.update).toEqual([])
  })

  it('removes open copies of removed deadlines, left or switched-off teams, but keeps done ones and teams that failed to load', () => {
    const seen = { a: { groupId: 'g1', title: 'Taak a', dueAt: NOW + 1000, done: false }, b: { groupId: 'g1', title: 'Taak b', dueAt: NOW + 1000, done: true } }
    const removed = planClassAgenda(input({ tasks: { g1: [] }, life: [copy('a'), copy('b', { doneAt: 3 })], state: { groups: {}, seen } }))
    expect(removed.remove).toEqual(['c-a'])
    expect(removed.seen).toEqual({})
    const off = planClassAgenda(input({ life: [copy('a')], state: { groups: { g1: false }, seen } }))
    expect(off.remove).toEqual(['c-a'])
    const failed = planClassAgenda(input({ tasks: {}, life: [copy('a')], state: { groups: {}, seen } }))
    expect(failed.remove).toEqual([])
    expect(failed.seen).toEqual(seen)
  })

  it('brings back a copy this device had, e.g. after signing in again', () => {
    const plan = planClassAgenda(input({ tasks: { g1: [task('a', { dueAt: NOW - 5 })] }, state: { groups: {}, seen: { a: { groupId: 'g1', title: 'Taak a', dueAt: NOW - 5, done: true } } } }))
    expect(plan.add[0]).toMatchObject({ id: 'c-a', done: true })
    expect(plan.markTask.map((m) => m.done)).toEqual([true])
  })

  it('makes the same valid uuid for the same member and deadline', async () => {
    expect(uuidFromHex('0'.repeat(64))).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    const a = await classCopyId('u1', 't1')
    expect(a).toBe(await classCopyId('u1', 't1'))
    expect(a).not.toBe(await classCopyId('u2', 't1'))
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('reads stored state forgivingly', () => {
    expect(toClassAgenda(null)).toEqual(emptyClassAgenda())
    expect(toClassAgenda({ groups: { g: true, h: 'x' }, seen: { a: { groupId: 'g', title: 't', dueAt: 1, done: false }, b: { title: 1 } } })).toEqual({ groups: { g: true }, seen: { a: { groupId: 'g', title: 't', dueAt: 1, done: false } } })
  })
})
