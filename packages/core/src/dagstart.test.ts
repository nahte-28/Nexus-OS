import { describe, expect, it } from 'vitest'
import { dagstartNotice, dagstartNotices, dagstartRef, plannedDagstart } from './dagstart'
import type { Appointment, Deadline } from './life'
import { DEFAULT_DAGSTART, parseDagstart, parseProfilesState } from './profiles'

// Tuesday 3 November 2026, local midnight.
const tuesday = new Date(2026, 10, 3).getTime()
const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).getTime()
const deadline = (over: Partial<Deadline>): Deadline => ({
  kind: 'deadline', id: 'd', title: 'Verslag labo', dueAt: at(3, 23, 59), projectId: null, notes: '', doneAt: null,
  remind: [60], target: 'phone', updatedAt: 1, deletedAt: null, ...over,
})
const appointment: Appointment = {
  kind: 'appointment', id: 'a', title: 'Tandarts', startAt: at(3, 16), endAt: at(3, 17), location: 'Antwerpen',
  notes: '', remind: [60], target: 'phone', updatedAt: 1, deletedAt: null,
}
const input = {
  calendarEvents: [],
  timetable: [
    { id: 'l1', day: 2, start: '08:30', end: '10:30', subject: 'Wiskunde', room: 'B201' },
    { id: 'l2', day: 2, start: '10:45', end: '12:45', subject: 'Elektronica' },
  ],
  items: [deadline({}), deadline({ id: 'd2', title: 'Toets fysica', dueAt: at(5, 9) }), deadline({ id: 'd3', title: 'Ver weg', dueAt: at(20, 9) }), appointment],
  reminders: [],
}

describe('Dagstart', () => {
  it('sums up the day and lists what is coming', () => {
    const n = dagstartNotice(input, tuesday, DEFAULT_DAGSTART)
    expect(n.ref).toBe('dagstart:2026-11-03')
    expect(n.at).toBe(at(3, 7, 30))
    expect(n.title).toMatch(/^Dagstart di 3 nov\.?: 2 lessen, 1 afspraak, 1 deadline$/)
    expect(n.text?.split('\n')).toEqual([
      '08:30 Wiskunde · B201',
      '10:45 Elektronica',
      '16:00 Afspraak: Tandarts · Antwerpen',
      '23:59 Deadline: Verslag labo',
      expect.stringMatching(/^Binnenkort: Toets fysica \(do 5 nov\.?\)$/),
    ])
  })

  it('has no text on an empty day, which is skipped unless asked', () => {
    const empty = { ...input, timetable: [], items: [] }
    const saturday = new Date(2026, 10, 7).getTime()
    expect(dagstartNotice(empty, saturday, DEFAULT_DAGSTART)).toMatchObject({ title: expect.stringContaining('niets gepland') })
    expect(dagstartNotice(empty, saturday, DEFAULT_DAGSTART).text).toBeUndefined()
    expect(dagstartNotices(empty, DEFAULT_DAGSTART, saturday, saturday + 86_400_000)).toEqual([])
    expect(dagstartNotices(empty, { ...DEFAULT_DAGSTART, skipEmpty: false }, saturday, saturday + 86_400_000)).toHaveLength(1)
  })

  it('plans only the chosen days, ahead for the phone', () => {
    const settings = { ...DEFAULT_DAGSTART, skipEmpty: false, days: [2, 3] }
    // From Monday noon, three days ahead: Tuesday and Wednesday.
    const planned = plannedDagstart(input, settings, at(2, 12))
    expect(planned.map((n) => n.ref)).toEqual([dagstartRef(tuesday), dagstartRef(new Date(2026, 10, 4).getTime())])
    expect(plannedDagstart(input, { ...settings, target: 'this_device' }, at(2, 12))).toEqual([])
    expect(plannedDagstart(input, { ...settings, enabled: false }, at(2, 12))).toEqual([])
    // Once its moment passed, today's is no longer planned.
    expect(dagstartNotices(input, settings, at(3, 8), at(3, 20))).toEqual([])
  })

  it('repairs stored settings and gives old profile copies the default', () => {
    expect(parseDagstart({ enabled: false, time: '25:00', days: [8, 1, 1, 3], target: 'tv' })).toEqual({ ...DEFAULT_DAGSTART, enabled: false, days: [1, 3] })
    expect(parseProfilesState({ schema: 5 }).dagstart).toEqual(DEFAULT_DAGSTART)
  })
})
