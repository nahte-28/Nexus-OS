import { describe, expect, it } from 'vitest'
import { EXAM_NOTE } from './exams'
import type { Appointment, Deadline, LifeItem } from './life'
import { STUDY_BLOCK_NOTE } from './study'
import { alreadyInAgenda, formatInvite, groupFeed, normalizeInvite, reconcileShared, shareableItems, type SharedItem } from './studyGroup'

const NOW = new Date(2026, 10, 2, 12).getTime()
const H = 60 * 60_000
const base = { createdAt: 0, updatedAt: 0, deletedAt: null }
const deadline = (id: string, dueAt: number, extra: Partial<Deadline> = {}): Deadline => ({ ...base, id, kind: 'deadline', title: `Taak ${id}`, dueAt, projectId: null, notes: '', doneAt: null, remind: [], target: 'phone', ...extra })
const appt = (id: string, startAt: number, notes: string): Appointment => ({ ...base, id, kind: 'appointment', title: `Afspraak ${id}`, startAt, endAt: startAt + H, location: '', notes, remind: [], target: 'phone' })

describe('studiegroep', () => {
  it('reads invite codes forgivingly', () => {
    expect(normalizeInvite(' abcd-ef23 ')).toBe('ABCDEF23')
    expect(normalizeInvite('ABCDEF2O')).toBeNull()
    expect(normalizeInvite('ABC')).toBeNull()
    expect(formatInvite('ABCDEF23')).toBe('ABCD-EF23')
  })

  it('offers deadlines, exams and study blocks but never ordinary appointments', () => {
    const items: LifeItem[] = [deadline('a', NOW + 5 * H), deadline('b', NOW + H, { doneAt: NOW }), appt('c', NOW + 2 * H, EXAM_NOTE), appt('d', NOW + 3 * H, STUDY_BLOCK_NOTE), appt('e', NOW + 4 * H, 'tandarts')]
    expect(shareableItems(items, NOW).map((i) => [i.sourceId, i.kind])).toEqual([
      ['c', 'exam'],
      ['d', 'study'],
      ['a', 'deadline'],
    ])
  })

  it('keeps shared copies in line with the Agenda', () => {
    const shared = (sourceId: string, at: number, extra: Partial<SharedItem> = {}): SharedItem => ({ groupId: 'g', userId: 'me', sourceId, kind: 'deadline', title: `Taak ${sourceId}`, at, endAt: null, done: false, ...extra })
    const items: LifeItem[] = [deadline('a', NOW + 2 * H), deadline('b', NOW + H, { doneAt: NOW }), deadline('c', NOW + H), { ...deadline('d', NOW), deletedAt: NOW }]
    const { put, remove } = reconcileShared([shared('a', NOW + H), shared('b', NOW + H), shared('c', NOW + H), shared('d', NOW), shared('x', NOW)], items, NOW)
    expect(put.map((p) => [p.sourceId, p.at, p.done])).toEqual([
      ['a', NOW + 2 * H, false],
      ['b', NOW + H, true],
    ])
    expect(remove.map((r) => r.sourceId)).toEqual(['d', 'x'])
  })

  it('groups the feed per day with names', () => {
    const items: SharedItem[] = [
      { groupId: 'g', userId: 'me', sourceId: '1', kind: 'deadline', title: 'Verslag', at: NOW + 30 * H, endAt: null, done: false },
      { groupId: 'g', userId: 'z', sourceId: '2', kind: 'exam', title: 'Examen wiskunde', at: NOW + H, endAt: NOW + 3 * H, done: false },
      { groupId: 'g', userId: 'z', sourceId: '3', kind: 'deadline', title: 'Oud', at: NOW - 3 * 24 * H, endAt: null, done: false },
      { groupId: 'g', userId: 'gone', sourceId: '4', kind: 'study', title: 'Studeren', at: NOW + 2 * H, endAt: NOW + 3 * H, done: false },
    ]
    const feed = groupFeed(items, [{ groupId: 'g', userId: 'z', displayName: 'Zoë' }], 'me', NOW)
    expect(feed).toHaveLength(2)
    expect(feed[0].entries.map((e) => e.who)).toEqual(['Zoë', 'Oud lid'])
    expect(feed[1].entries[0]).toMatchObject({ who: 'Jij', mine: true })
  })

  it('knows when a deadline is already yours', () => {
    expect(alreadyInAgenda({ title: ' taak A ', at: NOW }, [deadline('a', NOW)])).toBe(true)
    expect(alreadyInAgenda({ title: 'Taak a', at: NOW + 1 }, [deadline('a', NOW)])).toBe(false)
  })
})
