import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Dashboard } from './Dashboard'
import { profilesStore } from './store'

const active = () => profilesStore.getSnapshot().active

describe('Workspace Studio 2.0 dashboard', () => {
  afterEach(cleanup)

  it('resizes, moves, hides and adds widgets, and shows a phone preview', () => {
    const id = active().id
    profilesStore.updateProfile(id, { widgets: ['deadlines', 'notes', 'devices'], layout: {} })
    localStorage.setItem('nexus.dashboard.fill', 'off')
    render(<Dashboard onOpenApp={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Indeling aanpassen' }))

    // Notities starts one wide and two high.
    fireEvent.click(screen.getByRole('button', { name: 'Notities breder' }))
    fireEvent.click(screen.getByRole('button', { name: 'Notities hoger' }))
    expect(active().layout).toEqual({ notes: { w: 2, h: 3 } })
    expect((screen.getByRole('checkbox', { name: /Lege plekken opvullen/ }) as HTMLInputElement).checked).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Apparaten naar voren' }))
    expect(active().widgets).toEqual(['deadlines', 'devices', 'notes'])

    fireEvent.click(screen.getByRole('button', { name: 'Apparaten verbergen' }))
    expect(active().widgets).toEqual(['deadlines', 'notes'])
    fireEvent.click(screen.getByRole('button', { name: '+ Apparaten' }))
    expect(active().widgets).toEqual(['deadlines', 'notes', 'devices'])

    fireEvent.click(screen.getByRole('radio', { name: 'Gsm' }))
    const phone = screen.getByLabelText('Voorbeeld op de gsm')
    const items = within(phone).getAllByRole('listitem').filter((li) => li.parentElement?.getAttribute('aria-label') === 'Widgets')
    // On the phone everything is one column wide; the height stays.
    expect(items.every((li) => li.style.gridColumn === '1 / span 1')).toBe(true)
    expect(items.some((li) => li.style.gridRow.endsWith('span 3'))).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Klaar' }))
    expect(screen.queryByLabelText('Voorbeeld op de gsm')).toBeNull()
  })

  it('shows the profile card and the new widgets, and saves a quick note', () => {
    const id = active().id
    profilesStore.updateProfile(id, { widgets: ['profile', 'clock', 'quick_note', 'shortcuts'], layout: {} })
    render(<Dashboard onOpenApp={() => {}} />)
    expect(screen.getByText('Actief')).toBeTruthy()
    expect(screen.getByText('Snelkoppelingen')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Snelle notitie' }), { target: { value: 'Boeken terugbrengen' } })
    fireEvent.click(screen.getByRole('button', { name: 'Notitie bewaren' }))
    expect(screen.getByText('Bewaard in Notities')).toBeTruthy()
  })

  it('shows the week of the Agenda, open on the dashboard', () => {
    profilesStore.updateProfile(active().id, { widgets: ['agenda_week'], layout: {} })
    render(<Dashboard onOpenApp={() => {}} />)
    expect(screen.getByText('Agenda deze week')).toBeTruthy()
    expect(screen.getByRole('listitem', { name: 'Vandaag' })).toBeTruthy()
    expect(screen.getByRole('listitem', { name: 'Morgen' })).toBeTruthy()
  })

  it('shows Mijn dag as a time line with what is next and where it is now', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 24, 11, 10))
    const weekday = 2
    profilesStore.update((s) => ({
      ...s,
      calendarEvents: [],
      lessons: [
        { id: 'a', day: weekday, start: '10:25', end: '11:15', subject: 'Frans', room: 'A07' },
        { id: 'b', day: weekday, start: '11:15', end: '12:05', subject: 'Geschiedenis', room: 'B04' },
        { id: 'c', day: weekday, start: '14:55', end: '15:45', subject: 'Engels' },
      ],
    }))
    profilesStore.updateProfile(active().id, { widgets: ['today'], layout: {} })
    render(<Dashboard onOpenApp={() => {}} />)
    const day = screen.getByRole('region', { name: 'Mijn dag' })
    expect(within(day).getByRole('heading', { name: 'Geschiedenis begint over 5 minuten in B04' })).toBeTruthy()
    expect(within(day).getByText('Nog 2 vandaag, klaar om 15:45')).toBeTruthy()
    expect(within(day).getByTestId('nu')).toBeTruthy()
    vi.useRealTimers()
    profilesStore.update((s) => ({ ...s, lessons: [] }))
  })
})
