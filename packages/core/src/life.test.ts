import { describe, expect, it } from 'vitest'
import { agendaDay, appointmentRef, deadlineNotices, parseAppointment, deadlineRef, openDeadlines, parseDeadline, plannedDeadlineNotices, projectProgress, toLifeItem, type Appointment, type Deadline, type Project } from './life'

const H = 60 * 60_000
const deadline = (over: Partial<Deadline> = {}): Deadline => ({
  kind: 'deadline',
  id: 'd1',
  title: 'Verslag labo',
  dueAt: Date.UTC(2026, 10, 3, 22, 59),
  projectId: 'p1',
  notes: '',
  doneAt: null,
  remind: [24 * 60, 60],
  target: 'phone',
  updatedAt: 1,
  deletedAt: null,
  ...over,
})
const project: Project = { kind: 'project', id: 'p1', name: 'Elektronica', color: null, archived: false, updatedAt: 1, deletedAt: null }

describe('NEXUS Life', () => {
  it('keeps only valid items and known reminder times', () => {
    expect(toLifeItem({ ...deadline(), remind: [60, 61, 60, 1440] })).toMatchObject({ remind: [1440, 60] })
    expect(toLifeItem({ ...deadline(), dueAt: 'morgen' })).toBeNull()
    expect(toLifeItem({ kind: 'other', id: 'x', updatedAt: 1 })).toBeNull()
    expect(toLifeItem({ ...project, color: 'neon' })).toMatchObject({ color: null })
  })

  it('validates a new deadline', () => {
    expect(parseDeadline({ title: ' ', dueAt: 1 })).toMatchObject({ ok: false })
    expect(parseDeadline({ title: 'Toets', dueAt: 'geen datum' })).toMatchObject({ ok: false })
    expect(parseDeadline({ title: 'Toets', dueAt: '2026-11-03T23:59:00+01:00', remind: [5] })).toMatchObject({ ok: false })
    expect(parseDeadline({ title: ' Toets ', dueAt: '2026-11-03T23:59:00+01:00' })).toMatchObject({
      ok: true,
      value: { title: 'Toets', dueAt: Date.UTC(2026, 10, 3, 22, 59), remind: [1440, 60], target: 'phone', projectId: null },
    })
  })

  it('gives a notification per reminder time, not for done or deleted deadlines', () => {
    const d = deadline()
    const notices = deadlineNotices([d, project, deadline({ id: 'done', doneAt: 5 }), deadline({ id: 'gone', deletedAt: 5 })], d.dueAt - 2 * 24 * H, d.dueAt)
    expect(notices.map((n) => n.ref)).toEqual([deadlineRef(d, 1440), deadlineRef(d, 60)])
    expect(notices[0].title).toBe('Deadline over 1 dag: Verslag labo')
    expect(notices[1].title).toBe('Deadline over 1 uur: Verslag labo')
    expect(notices[0].text).toMatch(/^Elektronica · Tegen /)
    // Only what lies after [from]: a notice already shown is not shown again.
    expect(deadlineNotices([d], d.dueAt - 2 * H, d.dueAt).map((n) => n.ref)).toEqual([deadlineRef(d, 60)])
  })

  it('plans only phone deadlines ahead for the phone', () => {
    const d = deadline()
    const now = d.dueAt - 2 * 24 * H
    expect(plannedDeadlineNotices([d, deadline({ id: 'here', target: 'this_device' })], now).map((n) => n.ref)).toEqual([deadlineRef(d, 1440), deadlineRef(d, 60)])
  })

  it('counts project progress and lists open deadlines', () => {
    const items = [project, deadline(), deadline({ id: 'd2', doneAt: 3, dueAt: 5 }), deadline({ id: 'd3', projectId: null })]
    expect(projectProgress(project, items)).toMatchObject({ done: 1, total: 2, next: { id: 'd1' } })
    expect(openDeadlines(items).map((d) => d.id)).toEqual(['d1', 'd3'])
  })

  it('puts lessons, deadlines and reminders of one day in order', () => {
    const dayStart = new Date(2026, 10, 3).getTime() // a Tuesday
    const at = (h: number, m = 0) => new Date(2026, 10, 3, h, m).getTime()
    const items = [project, deadline({ dueAt: at(23, 59) }), deadline({ id: 'other-day', dueAt: at(23, 59) + 24 * H })]
    const reminders = [{ id: 'r', title: 'Boeken mee', at: at(7, 30), repeat: 'none' as const, target: 'phone' as const, createdAt: 0 }]
    const timetable = [
      { id: 'l1', day: 2, start: '08:30', end: '10:30', subject: 'Wiskunde', room: 'B1' },
      { id: 'l2', day: 3, start: '08:30', end: '10:30', subject: 'Niet vandaag' },
    ]
    expect(agendaDay({ calendarEvents: [], timetable, items, reminders }, dayStart).map((e) => [e.kind, e.title, e.detail])).toEqual([
      ['reminder', 'Boeken mee', undefined],
      ['lesson', 'Wiskunde', 'B1'],
      ['deadline', 'Verslag labo', 'Elektronica'],
    ])
    // Lessons from the school calendar replace the typed-in timetable.
    const calendarEvents = [{ start: at(13), end: at(15), subject: 'Labo' }]
    expect(agendaDay({ calendarEvents, timetable, items: [], reminders: [] }, dayStart).map((e) => e.title)).toEqual(['Labo'])
    // Google Agenda events come next to the lessons, not instead of them.
    const googleEvents = [{ start: at(16), end: at(17), subject: 'Tandarts', room: 'Centrum' }]
    expect(agendaDay({ calendarEvents, googleEvents, timetable, items: [], reminders: [] }, dayStart).map((e) => [e.kind, e.title, e.detail])).toEqual([
      ['lesson', 'Labo', undefined],
      ['event', 'Tandarts', 'Centrum'],
    ])
  })

  it('plans appointments: validation, notices and every day they cover', () => {
    expect(parseAppointment({ title: 'Tandarts', startAt: '2026-11-03T14:00:00+01:00' })).toMatchObject({
      ok: true,
      value: { endAt: Date.parse('2026-11-03T15:00:00+01:00'), remind: [60], target: 'phone', location: '' },
    })
    expect(parseAppointment({ title: 'x', startAt: 10 * H, endAt: 9 * H })).toMatchObject({ ok: false })
    expect(parseAppointment({ title: '', startAt: 1 })).toMatchObject({ ok: false })

    const start = new Date(2026, 10, 3, 14, 0).getTime()
    const a: Appointment = { kind: 'appointment', id: 'a1', title: 'Tandarts', startAt: start, endAt: start + H, location: 'Antwerpen', notes: '', remind: [60], target: 'phone', updatedAt: 1, deletedAt: null }
    expect(toLifeItem(a)).toEqual(a)
    const notices = deadlineNotices([a], start - 2 * H, start)
    expect(notices.map((n) => [n.ref, n.title])).toEqual([[appointmentRef(a, 60), 'Afspraak over 1 uur: Tandarts']])
    expect(notices[0].text).toContain('Antwerpen')

    const trip: Appointment = { ...a, id: 'a2', title: 'Uitstap', startAt: new Date(2026, 10, 3, 20).getTime(), endAt: new Date(2026, 10, 4, 18).getTime() }
    const day = (d: number) => new Date(2026, 10, d).getTime()
    expect(agendaDay({ calendarEvents: [], timetable: [], items: [a, trip], reminders: [] }, day(3)).map((e) => e.title)).toEqual(['Tandarts', 'Uitstap'])
    expect(agendaDay({ calendarEvents: [], timetable: [], items: [a, trip], reminders: [] }, day(4)).map((e) => [e.title, e.at])).toEqual([['Uitstap', day(4)]])
    expect(agendaDay({ calendarEvents: [], timetable: [], items: [a, trip], reminders: [] }, day(5))).toEqual([])
  })
})
