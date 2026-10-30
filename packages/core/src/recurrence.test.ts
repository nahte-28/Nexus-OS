import { describe, expect, it } from 'vitest'
import { agendaDay, deadlineNotices, parseAppointment, toLifeItem, type Appointment } from './life'
import { nextOccurrence, occurrences, overlapsOf, parseRepeat, repeatLabel, wallDate, type AppointmentRepeat } from './recurrence'

// Monday 2 November 2026, 10:00 local time.
const start = new Date(2026, 10, 2, 10, 0).getTime()
const HOUR = 3_600_000
const DAY = 24 * HOUR
const weekly = (patch: Partial<AppointmentRepeat> = {}): AppointmentRepeat => ({ freq: 'weekly', interval: 1, days: [], until: null, except: [], ...patch })
const appointment = (repeat: AppointmentRepeat | null, extra: Partial<Appointment> = {}): Appointment => ({
  kind: 'appointment',
  id: 'a1',
  title: 'Bijles',
  startAt: start,
  endAt: start + HOUR,
  location: '',
  notes: '',
  remind: [60],
  target: 'phone',
  repeat,
  updatedAt: 1,
  deletedAt: null,
  ...extra,
})
const dates = (list: { startAt: number }[]) => list.map((o) => wallDate(o.startAt))

describe('smart calendar', () => {
  it('repeats weekly on the weekday of the start, at the same wall-clock time', () => {
    const list = occurrences(appointment(weekly()), start, start + 30 * DAY)
    expect(dates(list)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'])
    expect(list.every((o) => new Date(o.startAt).getHours() === 10 && o.endAt - o.startAt === HOUR)).toBe(true)
  })

  it('handles several weekdays, an interval, an end date and skipped dates', () => {
    const repeat = weekly({ days: [1, 3], interval: 2, until: '2026-12-02', except: ['2026-11-18'] })
    expect(dates(occurrences(appointment(repeat), 0, start + 60 * DAY))).toEqual(['2026-11-02', '2026-11-04', '2026-11-16', '2026-11-30', '2026-12-02'])
    expect(repeatLabel(repeat, start)).toMatch(/^Elke 2 weken op ma en wo, tot 2 dec\.? 2026$/)
  })

  it('skips months without the day and jumps ahead in a long series', () => {
    const jan31 = new Date(2027, 0, 31, 9).getTime()
    const monthly = appointment({ freq: 'monthly', interval: 1, days: [], until: null, except: [] }, { startAt: jan31, endAt: jan31 + HOUR })
    expect(dates(occurrences(monthly, jan31, jan31 + 100 * DAY))).toEqual(['2027-01-31', '2027-03-31'])
    const daily = appointment({ freq: 'daily', interval: 1, days: [], until: null, except: [] })
    const far = start + 3000 * DAY
    expect(occurrences(daily, far, far + DAY)).toHaveLength(1)
  })

  it('gives the next time that has not ended, and none after the end date', () => {
    const a = appointment(weekly({ until: '2026-11-09' }))
    expect(wallDate(nextOccurrence(a, start + 2 * HOUR)!.startAt)).toBe('2026-11-09')
    expect(nextOccurrence(a, start + 8 * DAY)).toBeNull()
  })

  it('shows every time in the agenda and notifies each one with its own ref', () => {
    const a = appointment(weekly())
    const input = { calendarEvents: [], timetable: [], items: [a], reminders: [] }
    const day = new Date(2026, 10, 9).getTime()
    expect(agendaDay(input, day).map((e) => e.title)).toEqual(['Bijles'])
    const notices = deadlineNotices([a], start, start + 14 * DAY)
    expect(notices.map((n) => n.ref)).toEqual([`appointment:a1@${start + 7 * DAY}-60`, `appointment:a1@${start + 14 * DAY}-60`])
  })

  it('validates repeat rules from forms, sync and the AI', () => {
    expect(parseRepeat({ freq: 'hourly' })).toBeNull()
    expect(parseRepeat({ freq: 'weekly', interval: 500, days: [9, 2, 2], except: ['x', '2026-11-09'] })).toEqual(weekly({ interval: 52, days: [2], except: ['2026-11-09'] }))
    expect(toLifeItem({ ...appointment(null), repeat: { freq: 'daily' } })).toMatchObject({ repeat: { freq: 'daily', interval: 1 } })
    expect(parseAppointment({ title: 'X', startAt: start, repeat: { freq: 'yearly', until: '2020-01-01' } })).toEqual({ ok: false, error: 'De herhaling stopt voor de eerste afspraak.' })
    expect(parseAppointment({ title: 'X', startAt: start, repeat: { freq: 'nope' } }).ok).toBe(false)
  })

  it('finds what overlaps, but not what only touches', () => {
    const a = { at: 0, end: 10, title: 'Les' }
    const b = { at: 5, end: 15, title: 'Tandarts' }
    const c = { at: 15, end: 20, title: 'Sport' }
    const map = overlapsOf([a, b, c])
    expect(map.get(a)).toEqual(['Tandarts'])
    expect(map.get(b)).toEqual(['Les'])
    expect(map.get(c)).toBeUndefined()
  })
})
