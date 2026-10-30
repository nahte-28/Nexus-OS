import { describe, expect, it } from 'vitest'
import { briefingLines, briefingSent, buildBriefing, durationLabel, emptyBriefing, freeBlocks, logBriefing, mergeBriefing, parseBriefing } from './briefing'
import { dagstartNotice, dagstartNotices } from './dagstart'
import type { Deadline } from './life'
import { DEFAULT_DAGSTART } from './profiles'

// Tuesday 3 November 2026, local midnight.
const tuesday = new Date(2026, 10, 3).getTime()
const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).getTime()
const deadline = (over: Partial<Deadline>): Deadline => ({
  kind: 'deadline', id: 'd', title: 'Verslag labo', dueAt: at(3, 23, 59), projectId: null, notes: '', doneAt: null,
  remind: [], target: 'phone', updatedAt: 1, deletedAt: null, ...over,
})
const input = {
  calendarEvents: [],
  timetable: [
    { id: 'l1', day: 2, start: '08:30', end: '10:30', subject: 'Wiskunde' },
    { id: 'l2', day: 2, start: '13:00', end: '15:00', subject: 'Elektronica' },
  ],
  items: [
    deadline({}),
    deadline({ id: 'late', title: 'Taak netwerken', dueAt: at(2, 18) }),
    deadline({ id: 'soon', title: 'Toets fysica', dueAt: at(5, 9) }),
    deadline({ id: 'far', title: 'Ver weg', dueAt: at(20, 9) }),
    deadline({ id: 'done', title: 'Al klaar', dueAt: at(1, 9), doneAt: 5 }),
  ],
  reminders: [],
  habits: {
    habits: [
      { id: 'h1', name: 'Lezen', days: [2], remindAt: '21:00', target: 'phone' as const, done: [], createdAt: 0, updatedAt: 0, deletedAt: null },
      { id: 'h2', name: 'Sporten', days: [2], remindAt: null, target: 'phone' as const, done: ['2026-11-03'], createdAt: 0, updatedAt: 0, deletedAt: null },
      { id: 'h3', name: 'Zondag', days: [7], remindAt: null, target: 'phone' as const, done: [], createdAt: 0, updatedAt: 0, deletedAt: null },
    ],
    revision: 0,
  },
  exams: {
    exams: [
      { id: 'e1', course: 'Digitale technieken', at: at(4, 9), minutes: 120, location: '', studyHours: 10, deckId: null, appointmentId: null, createdAt: 0, updatedAt: 0, deletedAt: null },
      { id: 'e2', course: 'Te ver', at: at(20, 9), minutes: 120, location: '', studyHours: 10, deckId: null, appointmentId: null, createdAt: 0, updatedAt: 0, deletedAt: null },
    ],
    revision: 0,
  },
  unsortedCaptures: 2,
}

describe('Dagbriefing', () => {
  it('puts what is late first, then today, exams, soon, habits and captures', () => {
    const b = buildBriefing(input, tuesday, at(3, 7))
    expect(b.date).toBe('2026-11-03')
    expect(b.priorities.map((p) => `${p.kind}:${p.title}`)).toEqual([
      'overdue:Taak netwerken',
      'today:Verslag labo',
      'exam:Digitale technieken',
      'soon:Toets fysica',
      'habit:Lezen',
      'capture:2 dingen te sorteren',
    ])
    expect(b.priorities[2].detail).toBe('morgen om 09:00')
    expect(b.counts).toEqual({ lessons: 2, appointments: 0, deadlines: 1, reminders: 0 })
  })

  it('finds free blocks of at least an hour between 08:00 and 20:00', () => {
    const b = buildBriefing(input, tuesday, at(3, 7))
    expect(b.free.map((f) => [new Date(f.start).getHours(), f.minutes])).toEqual([
      [10, 150],
      [15, 300],
    ])
    expect(b.headline).toBe('2 lessen, 1 deadline · 1 te laat · 7 u 30 min vrij')
    // Later the same day, free time starts now.
    expect(buildBriefing(input, tuesday, at(3, 16)).free).toEqual([{ start: at(3, 16), end: at(3, 20), minutes: 240 }])
  })

  it('skips short gaps and merges overlapping busy times', () => {
    const lesson = (at_: number, end: number) => ({ kind: 'lesson' as const, at: at_, end, title: 'x' })
    expect(freeBlocks([lesson(at(3, 9), at(3, 11)), lesson(at(3, 10), at(3, 12)), lesson(at(3, 12, 30), at(3, 19, 30))], at(3, 8), at(3, 20))).toEqual([{ start: at(3, 8), end: at(3, 9), minutes: 60 }])
    expect(durationLabel(45)).toBe('45 min')
    expect(durationLabel(120)).toBe('2 u')
  })

  it('counts a deadline as late on a later day when it is due before that day', () => {
    const wednesday = buildBriefing(input, at(4, 0), at(3, 7))
    expect(wednesday.priorities.filter((p) => p.kind === 'overdue').map((p) => p.title)).toEqual(['Taak netwerken', 'Verslag labo'])
  })

  it('adds late work, exams, habits and the longest free block to the Dagstart', () => {
    const extra = (day: number, when: number) => briefingLines(buildBriefing(input, day, when))
    expect(extra(tuesday, at(3, 7, 30))).toEqual(['Te laat: Taak netwerken', 'Examen: Digitale technieken morgen om 09:00', 'Gewoontes: Lezen', 'Vrij: 15:00–20:00 (5 u)'])
    const n = dagstartNotice(input, tuesday, DEFAULT_DAGSTART, extra)
    expect(n.text?.split('\n').slice(-4)[0]).toBe('Te laat: Taak netwerken')
    // A day with nothing planned stays quiet with skipEmpty, even with a habit open.
    const empty = { ...input, timetable: [], items: [] }
    expect(dagstartNotices(empty, DEFAULT_DAGSTART, at(3, 0), at(3, 12), extra)).toEqual([])
  })

  it('logs each day once per channel and merges the history', () => {
    let s = logBriefing(emptyBriefing(), { date: '2026-11-03', channel: 'local', at: 10, title: 'A', test: false })
    s = logBriefing(s, { date: '2026-11-03', channel: 'local', at: 20, title: 'A', test: false })
    s = logBriefing(s, { date: '2026-11-03', channel: 'local', at: 30, title: 'Proef', test: true })
    expect(s.log.map((l) => l.id)).toEqual(['proef-30:local', '2026-11-03:local'])
    expect(briefingSent(s, '2026-11-03', 'local')).toBe(true)
    expect(briefingSent(s, '2026-11-03', 'phone')).toBe(false)
    const other = logBriefing(emptyBriefing(), { date: '2026-11-03', channel: 'local', at: 5, title: 'B', test: false })
    const merged = mergeBriefing(s, other)
    expect(merged.log.find((l) => l.id === '2026-11-03:local')?.at).toBe(5)
    expect(parseBriefing(JSON.parse(JSON.stringify(merged)))).toEqual(merged)
    expect(parseBriefing({ log: [{ id: 'x', date: 'nope', channel: 'local', at: 1 }] }).log).toEqual([])
  })
})
