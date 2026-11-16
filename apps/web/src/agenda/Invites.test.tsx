import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { inviteCopyId, type AppointmentInvite } from '@nexus/core'
import { lifeStore } from '../life/store'
import { setInvitesApi, setInvitesState, syncInvites, type AppointmentInvites } from './invites'
import { InviteFriends, InviteInbox } from './Invites'

const H = 3_600_000
const soon = Date.now() + 24 * H
const guest: AppointmentInvite = { id: 'inv-1', side: 'guest', hostItem: '00000000-0000-0000-0000-0000000000b1', other: 'u2', otherName: 'Remo', title: 'Samen studeren', startAt: soon, endAt: soon + 2 * H, location: 'Bib', notes: '', status: 'accepted', updatedAt: Date.now() }

function fakeApi(invites: AppointmentInvite[]) {
  let list = invites
  return {
    list: vi.fn(async () => list),
    update: vi.fn(async () => 1),
    cancel: vi.fn(async (item: string) => {
      list = list.map((i) => (i.hostItem === item ? { ...i, status: 'cancelled' as const } : i))
    }),
    answer: vi.fn(async (id: string, accept: boolean) => {
      list = list.map((i) => (i.id === id ? { ...i, status: accept ? ('accepted' as const) : ('declined' as const), updatedAt: Date.now() } : i))
    }),
    invite: vi.fn(async () => 'new'),
    set: (next: AppointmentInvite[]) => (list = next),
  }
}

describe('Afspraak met vrienden', () => {
  afterEach(() => {
    cleanup()
    setInvitesApi(null)
    setInvitesState({ invites: null, copies: {}, error: null })
  })

  it('puts an accepted invite in your Agenda, follows the host and removes it when cancelled', async () => {
    const api = fakeApi([guest])
    await syncInvites(api as unknown as AppointmentInvites, lifeStore, Date.now(), false)
    const id = await inviteCopyId(guest.id)
    expect(lifeStore.getSnapshot().find((i) => i.id === id)).toMatchObject({ kind: 'appointment', title: 'Samen studeren', location: 'Bib', notes: 'Uitnodiging van Remo.' })

    api.set([{ ...guest, title: 'Samen studeren (verzet)', startAt: soon + H, endAt: soon + 3 * H }])
    await syncInvites(api as unknown as AppointmentInvites, lifeStore, Date.now(), false)
    expect(lifeStore.getSnapshot().find((i) => i.id === id)).toMatchObject({ title: 'Samen studeren (verzet)', startAt: soon + H })

    api.set([{ ...guest, status: 'cancelled' }])
    await syncInvites(api as unknown as AppointmentInvites, lifeStore, Date.now(), false)
    expect(lifeStore.getSnapshot().some((i) => i.id === id)).toBe(false)
  })

  it('sends your changes and cancels the invites of an appointment you delete', async () => {
    const mine = await lifeStore.addAppointment({ title: 'Verjaardag', startAt: soon, endAt: soon + H, location: '', notes: '', remind: [60], target: 'phone' })
    const host: AppointmentInvite = { ...guest, id: 'inv-2', side: 'host', hostItem: mine, title: 'Verjaardag', startAt: soon, endAt: soon + H, location: '', status: 'invited' }
    const api = fakeApi([host])
    await syncInvites(api as unknown as AppointmentInvites, lifeStore, Date.now(), false)
    expect(api.update).not.toHaveBeenCalled()
    await lifeStore.updateAppointment(mine, { title: 'Verjaardagsfeest' })
    await syncInvites(api as unknown as AppointmentInvites, lifeStore, Date.now(), false)
    expect(api.update).toHaveBeenCalledWith(mine, expect.objectContaining({ title: 'Verjaardagsfeest' }))
    await lifeStore.remove(mine)
    await syncInvites(api as unknown as AppointmentInvites, lifeStore, Date.now(), false)
    expect(api.cancel).toHaveBeenCalledWith(mine, null)
  })

  it('asks for your answer on a new invite', async () => {
    const api = fakeApi([{ ...guest, id: 'inv-3', status: 'invited' }])
    setInvitesApi({ api, refresh: async () => void (await syncInvites(api as unknown as AppointmentInvites, lifeStore, Date.now(), false)) })
    setInvitesState({ invites: await api.list() })
    render(<InviteInbox />)
    expect(screen.getByText(/Van Remo/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Samen studeren aanvaarden' }))
    await waitFor(() => expect(api.answer).toHaveBeenCalledWith('inv-3', true))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Uitnodigingen' })).toBeNull())
    const id = await inviteCopyId('inv-3')
    expect(lifeStore.getSnapshot().some((i) => i.id === id)).toBe(true)
  })

  it('invites friends to your appointment and shows who comes', async () => {
    const mine = await lifeStore.addAppointment({ title: 'Filmavond', startAt: soon, endAt: soon + 2 * H, location: '', notes: '', remind: [60], target: 'phone' })
    const appointment = lifeStore.getSnapshot().find((i) => i.id === mine)!
    if (appointment.kind !== 'appointment') throw new Error('geen afspraak')
    const api = fakeApi([{ ...guest, id: 'inv-4', side: 'host', hostItem: mine, title: 'Filmavond', other: 'u2', otherName: 'Remo', status: 'accepted' }])
    setInvitesApi({ api, refresh: async () => {} })
    setInvitesState({ invites: await api.list() })
    const friends = { list: vi.fn(async () => [
      { userId: 'u2', displayName: 'Remo', kind: 'friend' as const, since: 0 },
      { userId: 'u3', displayName: 'Lotte', kind: 'friend' as const, since: 0 },
      { userId: 'u4', displayName: 'Vraagt', kind: 'incoming' as const, since: 0 },
    ]) }
    render(<InviteFriends appointment={appointment} friendsApi={friends} />)
    expect(screen.getByLabelText('Uitgenodigd voor Filmavond').textContent).toContain('Remo (komt)')
    fireEvent.click(screen.getByText('Vrienden uitnodigen'))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Lotte' }))
    expect(screen.queryByRole('checkbox', { name: 'Remo' })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: 'Vraagt' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Uitnodigen' }))
    await waitFor(() => expect(api.invite).toHaveBeenCalledWith('u3', expect.objectContaining({ id: mine, title: 'Filmavond' })))
    fireEvent.click(screen.getByRole('button', { name: 'Uitnodiging van Remo intrekken' }))
    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith(mine, 'u2'))
  })
})
