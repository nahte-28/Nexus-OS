import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const { Agenda } = await import('./Agenda')

describe('Agenda', () => {
  afterEach(cleanup)

  it('adds a deadline, shows it in the week and marks it done', async () => {
    render(<Agenda />)
    expect(screen.getByRole('heading', { name: 'Vandaag' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '+ Deadline' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Titel' }), { target: { value: 'Verslag labo 3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Toevoegen' }))

    const open = await screen.findByRole('list', { name: 'Open deadlines' })
    expect(within(open).getByText('Verslag labo 3')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Overzicht' }))
    // Due tomorrow at 23:59 by default.
    const tomorrow = screen.getByRole('region', { name: 'Morgen' })
    const box = within(tomorrow).getByRole('checkbox', { name: 'Verslag labo 3 klaar' })
    fireEvent.click(box)
    await waitFor(() => expect((within(screen.getByRole('region', { name: 'Morgen' })).getByRole('checkbox') as HTMLInputElement).checked).toBe(true))
  })

  it('groups deadlines in projects with their progress', async () => {
    render(<Agenda />)
    fireEvent.click(screen.getByRole('tab', { name: 'Projecten' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Naam' }), { target: { value: 'Elektronica' } })
    fireEvent.click(screen.getByRole('button', { name: 'Toevoegen' }))
    expect(await screen.findByRole('progressbar', { name: 'Elektronica voortgang' })).toBeTruthy()
    expect(screen.getByText('0/0 klaar')).toBeTruthy()
    // The form clears once the save has finished; wait for it so nothing updates after the test.
    await waitFor(() => expect((screen.getByRole('textbox', { name: 'Naam' }) as HTMLInputElement).value).toBe(''))
  })

  it('adds an appointment with a place and shows it in the week', async () => {
    render(<Agenda />)
    fireEvent.click(screen.getByRole('button', { name: '+ Afspraak' }))
    const form = screen.getByRole('form', { name: 'Nieuwe afspraak' })
    fireEvent.change(within(form).getByRole('textbox', { name: 'Titel' }), { target: { value: 'Tandarts' } })
    fireEvent.change(within(form).getByRole('textbox', { name: 'Plaats' }), { target: { value: 'Antwerpen' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Toevoegen' }))
    const list = await screen.findByRole('list', { name: 'Komende afspraken' })
    expect(within(list).getByText('Tandarts')).toBeTruthy()
    // The form clears once the save has finished; wait for it so nothing updates after the test.
    await waitFor(() => expect(screen.queryByDisplayValue('Tandarts')).toBeNull())
    fireEvent.click(screen.getByRole('tab', { name: 'Overzicht' }))
    expect(within(screen.getByRole('region', { name: 'Morgen' })).getByText(/Tandarts/).textContent).toContain('Antwerpen')
  })

  it('sets up Dagstart and shows what the next one will say', () => {
    render(<Agenda />)
    fireEvent.click(screen.getByRole('tab', { name: 'Dagstart' }))
    expect((screen.getByRole('checkbox', { name: 'Dagstart aan' }) as HTMLInputElement).checked).toBe(true)
    fireEvent.change(screen.getByLabelText('Tijdstip'), { target: { value: '06:45' } })
    expect(within(screen.getByRole('region', { name: 'Voorbeeld' })).getByText(/om 06:45$/)).toBeTruthy()
    const sunday = within(screen.getByRole('group', { name: 'Dagen' })).getByRole('button', { name: 'zo' })
    fireEvent.click(sunday)
    expect(sunday.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Dagstart aan' }))
    expect(screen.getByLabelText('Tijdstip').matches(':disabled')).toBe(true)
  })

  it('shows what the Weekoverzicht sends and can stop the Sunday run', () => {
    render(<Agenda />)
    fireEvent.click(screen.getByRole('tab', { name: 'Week' }))
    expect(screen.getByText(/Afgelopen week/)).toBeTruthy()
    const auto = screen.getByRole('checkbox', { name: /Elke zondag/ }) as HTMLInputElement
    expect(auto.checked).toBe(true)
    fireEvent.click(auto)
    expect(localStorage.getItem('nexus.review.auto')).toBe('off')
    expect(screen.getByRole('button', { name: 'Weekoverzicht maken' })).toBeTruthy()
  })
})
