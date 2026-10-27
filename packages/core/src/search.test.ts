import { describe, expect, it } from 'vitest'
import { normalize, searchAll, type SearchSources } from './search'
import type { Appointment, Deadline, Project } from './life'

const now = Date.UTC(2026, 9, 27, 12)
const deadline = (over: Partial<Deadline> = {}): Deadline => ({
  kind: 'deadline', id: 'd1', title: 'Verslag labo', dueAt: now + 86_400_000, projectId: 'p1', notes: '', doneAt: null,
  remind: [60], target: 'phone', updatedAt: 1, deletedAt: null, ...over,
})
const project: Project = { kind: 'project', id: 'p1', name: 'Elektronica', color: null, archived: false, updatedAt: 1, deletedAt: null }
const appointment: Appointment = {
  kind: 'appointment', id: 'a1', title: 'Tandarts', startAt: now + 3_600_000, endAt: now + 7_200_000, location: 'Antwerpen',
  notes: '', remind: [60], target: 'phone', updatedAt: 1, deletedAt: null,
}
const sources = (over: Partial<SearchSources> = {}): SearchSources => ({
  apps: [{ id: 'notes', title: 'Notities' }, { id: 'agenda', title: 'Agenda' }],
  notes: [
    { id: 'n1', title: 'Labo elektronica', body: 'Wet van Ohm en weerstanden', updatedAt: 1, deletedAt: null },
    { id: 'n2', title: '', body: 'Boodschappen\nmelk', updatedAt: 1, deletedAt: null },
    { id: 'n3', title: 'Weg', body: 'labo', updatedAt: 1, deletedAt: 5 },
  ],
  files: [{ id: 'f1', name: 'labo-verslag.pdf', mediaType: 'application/pdf', size: 10, addedAt: 1 }],
  life: [deadline(), project, appointment],
  reminders: [{ id: 'r1', title: 'Labojas meenemen', at: now, repeat: 'none', target: 'phone', createdAt: 1 }],
  ...over,
})

describe('Zoeken overal', () => {
  it('ignores case and accents', () => {
    expect(normalize('Één Café')).toBe('een cafe')
  })

  it('finds every kind and leaves deleted notes out', () => {
    const kinds = searchAll('labo', sources(), now).map((r) => `${r.kind}:${r.id}`)
    expect(kinds).toEqual(expect.arrayContaining(['note:n1', 'file:f1', 'deadline:d1', 'reminder:r1']))
    expect(kinds).not.toContain('note:n3')
  })

  it('needs every word and puts title matches before body matches', () => {
    expect(searchAll('labo ohm', sources(), now).map((r) => r.id)).toEqual(['n1'])
    const notes = searchAll('melk', sources(), now)
    expect(notes).toMatchObject([{ kind: 'note', id: 'n2', title: 'Boodschappen' }])
    expect(notes[0].detail).toContain('melk')
    const order = searchAll('elektronica', sources(), now).map((r) => r.kind)
    expect(order[0]).toBe('project')
  })

  it('opens each result in its app, with dates for the agenda', () => {
    const results = searchAll('tandarts', sources(), now)
    expect(results).toMatchObject([{ kind: 'appointment', app: 'agenda' }])
    expect(results[0].detail).toContain('Antwerpen')
    expect(searchAll('agenda', sources(), now)[0]).toMatchObject({ kind: 'app', id: 'agenda', app: 'agenda' })
    expect(searchAll('verslag', sources(), now).find((r) => r.kind === 'deadline')?.detail).toContain('Elektronica')
  })

  it('returns nothing for an empty query and handles special characters', () => {
    expect(searchAll('   ', sources(), now)).toEqual([])
    expect(searchAll('(c++', sources(), now)).toEqual([])
  })
})
