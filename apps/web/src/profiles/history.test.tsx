import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { defaultProfilesState, type ProfilesState } from '@nexus/core'
import { Profiles } from '../apps/Profiles'
import { profilesStore, ProfilesStore } from './store'

const at = (iso: string) => new Date(iso).getTime()

const agendaState = (): ProfilesState => {
  const s = defaultProfilesState()
  s.schedule = { ...s.schedule, enabled: false, timeZone: 'Europe/Brussels' }
  s.agenda = { enabled: true, profile: 'school', leadMinutes: 10, bridgeMinutes: 0 }
  s.calendarEvents = [{ start: at('2026-10-20T08:30:00+02:00'), end: at('2026-10-20T10:00:00+02:00'), subject: 'Wiskunde' }]
  return s
}

describe('Profiles 2.0', () => {
  afterEach(cleanup)

  it('switches when a lesson starts and keeps why in the history', () => {
    let now = at('2026-10-20T08:00:00+02:00')
    const store = new ProfilesStore(() => now, agendaState(), false)
    expect(store.getSnapshot().active.id).toBe('personal')
    now = at('2026-10-20T08:25:00+02:00')
    store.tick()
    expect(store.getSnapshot()).toMatchObject({ reason: 'agenda', active: { id: 'school' } })
    now = at('2026-10-20T08:40:00+02:00')
    store.tick()
    now = at('2026-10-20T10:05:00+02:00')
    store.tick()
    expect(store.getHistory().map((c) => [c.profile, c.reason, c.why])).toEqual([
      ['personal', 'default', 'Je standaardprofiel'],
      ['school', 'agenda', 'Les Wiskunde, 08:30–10:00'],
      ['school', 'agenda', 'Les Wiskunde begint om 08:30'],
      ['personal', 'default', 'Je standaardprofiel'],
    ])
    expect(store.getHistory()[0].from).toBe('school')
  })

  it('sets the agenda rule and shows the history tab', () => {
    render(<Profiles />)
    fireEvent.click(screen.getByRole('tab', { name: 'Automatisch' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Profiel wisselen wanneer een les begint' }))
    expect(profilesStore.getSnapshot().state.agenda.enabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Al wisselen'), { target: { value: '15' } })
    fireEvent.change(screen.getByLabelText('Pauzes overbruggen'), { target: { value: '30' } })
    expect(profilesStore.getSnapshot().state.agenda).toMatchObject({ leadMinutes: 15, bridgeMinutes: 30 })
    expect(screen.getByText(/Nog geen lessen|Volgende les|Nu:|Geen les/)).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Geschiedenis' }))
    expect(screen.getByRole('list', { name: 'Geschiedenis van profielen' }).textContent).toMatch(/Standaard|Uurschema|Gekozen|Lesrooster|Terug/)
    profilesStore.update((s) => ({ ...s, agenda: { ...s.agenda, enabled: false } }))
  })
})
