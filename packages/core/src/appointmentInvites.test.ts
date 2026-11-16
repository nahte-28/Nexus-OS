import { describe, expect, it } from 'vitest'
import { canInvite, inviteCopy, inviteCopyId, openInvites, parseInvites, planHostChanges, planInviteCopies, type AppointmentInvite } from './appointmentInvites'
import type { Appointment } from './life'

const H = 3_600_000
const base: AppointmentInvite = { id: 'i1', side: 'guest', hostItem: 'a1', other: 'u2', otherName: 'Remo', title: 'Samen studeren', startAt: 10 * H, endAt: 12 * H, location: 'Bib', notes: '', status: 'accepted', updatedAt: 5 * H }
const appointment = (patch: Partial<Appointment> = {}): Appointment => ({ kind: 'appointment', id: 'a1', title: 'Samen studeren', startAt: 10 * H, endAt: 12 * H, location: 'Bib', notes: '', remind: [60], target: 'phone', repeat: null, updatedAt: 1, deletedAt: null, ...patch })

describe('Afspraak met vrienden', () => {
  it('reads invites from the server and drops broken ones', () => {
    const list = parseInvites([
      { ...base, startAt: '1970-01-01T10:00:00Z', endAt: '1970-01-01T12:00:00Z', updatedAt: '1970-01-01T05:00:00Z' },
      { ...base, id: 'x', status: 'weird' },
      { ...base, id: 'y', title: '  ' },
      { ...base, id: 'z', endAt: 1 },
    ])
    expect(list).toEqual([base])
  })

  it('gives your copy an id that is the same on every device', async () => {
    const id = await inviteCopyId('i1')
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(await inviteCopyId('i1')).toBe(id)
    expect(await inviteCopyId('i2')).not.toBe(id)
  })

  it('puts an accepted invite in your Agenda and keeps it in line with the host', () => {
    const ids = { i1: 'c1' }
    expect(planInviteCopies([base], [], ids).add).toEqual([{ id: 'c1', invite: 'i1', copy: { title: 'Samen studeren', startAt: 10 * H, endAt: 12 * H, location: 'Bib', notes: 'Uitnodiging van Remo.' } }])
    const copy = appointment({ id: 'c1', ...inviteCopy(base) })
    expect(planInviteCopies([base], [copy], ids)).toEqual({ add: [], update: [], remove: [], decline: [] })
    const moved = { ...base, startAt: 11 * H, notes: 'Neem je laptop mee.' }
    expect(planInviteCopies([moved], [copy], ids).update).toEqual([{ id: 'c1', patch: { ...inviteCopy(moved), notes: 'Uitnodiging van Remo.\nNeem je laptop mee.' } }])
    // Cancelled or declined: the copy goes.
    expect(planInviteCopies([{ ...base, status: 'cancelled' }], [copy], ids).remove).toEqual(['c1'])
    expect(planInviteCopies([{ ...base, status: 'declined' }], [{ ...copy, deletedAt: 9 }], ids).remove).toEqual([])
    // Your own invites are not copied.
    expect(planInviteCopies([{ ...base, side: 'host' }], [], ids).add).toEqual([])
  })

  it('declines when you delete your copy, but brings it back when you accept again later', () => {
    const ids = { i1: 'c1' }
    const deleted = appointment({ id: 'c1', ...inviteCopy(base), deletedAt: 6 * H })
    expect(planInviteCopies([base], [deleted], ids)).toMatchObject({ add: [], decline: ['i1'] })
    expect(planInviteCopies([{ ...base, updatedAt: 7 * H }], [deleted], ids).add).toHaveLength(1)
  })

  it('sends your changes to the invites and cancels them when you delete the appointment', () => {
    const host = { ...base, side: 'host' as const, other: 'u2' }
    const second = { ...host, id: 'i2', other: 'u3' }
    expect(planHostChanges([host, second], [appointment()])).toEqual({ update: [], cancel: [] })
    expect(planHostChanges([host, second], [appointment({ title: 'Samen studeren (verzet)', startAt: 11 * H })]).update).toEqual([{ item: 'a1', title: 'Samen studeren (verzet)', startAt: 11 * H, endAt: 12 * H, location: 'Bib', notes: '' }])
    expect(planHostChanges([host], [appointment({ deletedAt: 9 })]).cancel).toEqual(['a1'])
    // Made a series: a series cannot be shared.
    expect(planHostChanges([host], [appointment({ repeat: { freq: 'weekly', interval: 1, days: [], until: null, except: [] } })]).cancel).toEqual(['a1'])
    // Not synced to this device yet, or already cancelled: nothing.
    expect(planHostChanges([host], [])).toEqual({ update: [], cancel: [] })
    expect(planHostChanges([{ ...host, status: 'cancelled' }], [appointment({ deletedAt: 9 })]).cancel).toEqual([])
  })

  it('lists what waits for your answer, and only single appointments can be shared', () => {
    const waiting = { ...base, status: 'invited' as const }
    expect(openInvites([waiting, { ...waiting, id: 'old', endAt: 1 }, base], 2 * H).map((i) => i.id)).toEqual(['i1'])
    expect(canInvite({ repeat: null })).toBe(true)
    expect(canInvite({ repeat: { freq: 'daily', interval: 1, days: [], until: null, except: [] } })).toBe(false)
  })
})
