import { describe, expect, it } from 'vitest'
import { advance, dueReminders, parseReminder, type Reminder } from './reminders'

const base: Reminder = {
  id: 'r1',
  title: 'Verslag',
  at: new Date(2026, 9, 20, 9, 0).getTime(),
  repeat: 'none',
  target: 'phone',
  createdAt: 0,
}

describe('reminders', () => {
  it('finds what is due, oldest first', () => {
    const later = { ...base, id: 'r2', at: base.at + 60_000 }
    expect(dueReminders([later, base], base.at + 60_000).map((r) => r.id)).toEqual(['r1', 'r2'])
    expect(dueReminders([later], base.at)).toEqual([])
  })

  it('removes one-off reminders and moves repeating ones to the next future time', () => {
    expect(advance(base, base.at)).toBeNull()
    const daily = advance({ ...base, repeat: 'daily' }, base.at)!
    expect(new Date(daily.at)).toEqual(new Date(2026, 9, 21, 9, 0))
    // Missed for three days (pc was off): skips to the first time still ahead.
    const late = advance({ ...base, repeat: 'daily' }, new Date(2026, 9, 23, 12, 0).getTime())!
    expect(new Date(late.at)).toEqual(new Date(2026, 9, 24, 9, 0))
    const weekly = advance({ ...base, repeat: 'weekly' }, base.at)!
    expect(new Date(weekly.at)).toEqual(new Date(2026, 9, 27, 9, 0))
  })

  it('keeps the local time across a daylight saving change', () => {
    const before = new Date(2026, 9, 24, 9, 0)
    const next = advance({ ...base, at: before.getTime(), repeat: 'daily' }, before.getTime())!
    expect(new Date(next.at).getHours()).toBe(9)
    expect(new Date(next.at).getDate()).toBe(25)
  })

  it('validates input from forms and the assistant', () => {
    const now = new Date('2026-10-19T12:00:00+02:00').getTime()
    expect(parseReminder({ title: ' Bellen ', at: '2026-10-20T09:00:00+02:00' }, now)).toEqual({
      ok: true,
      value: { title: 'Bellen', text: undefined, at: Date.parse('2026-10-20T09:00:00+02:00'), repeat: 'none', target: 'phone' },
    })
    expect(parseReminder({ title: 'Oud', at: '2026-10-18T09:00:00+02:00' }, now)).toMatchObject({ ok: false })
    expect(parseReminder({ title: 'X', at: 'morgen' }, now)).toMatchObject({ ok: false })
    expect(parseReminder({ title: '', at: '2026-10-20T09:00:00+02:00' }, now)).toMatchObject({ ok: false })
    expect(parseReminder({ title: 'X', at: '2026-10-20T09:00:00+02:00', repeat: 'hourly' }, now)).toMatchObject({ ok: false })
  })
})
