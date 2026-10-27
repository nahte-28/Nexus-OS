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
    fireEvent.click(screen.getByRole('tab', { name: 'Overzicht' }))
    expect(within(screen.getByRole('region', { name: 'Morgen' })).getByText(/Tandarts/).textContent).toContain('Antwerpen')
  })
})
