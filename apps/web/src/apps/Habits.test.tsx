import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

const { Habits } = await import('./Habits')

describe('Gewoontes', () => {
  afterEach(cleanup)

  it('adds a habit, ticks it off today and shows it in the week', () => {
    render(<Habits />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Nieuwe gewoonte' }), { target: { value: 'Sporten' } })
    fireEvent.click(screen.getByRole('button', { name: 'Toevoegen' }))
    const today = screen.getByRole('region', { name: 'Vandaag' })
    expect(within(today).getByText('0 van 1 gedaan')).toBeTruthy()
    fireEvent.click(within(today).getByRole('checkbox', { name: 'Sporten gedaan' }))
    expect(within(today).getByText('1 van 1 gedaan')).toBeTruthy()
    expect(within(today).getByText('🔥 1')).toBeTruthy()
    expect(within(screen.getByRole('group', { name: 'Sporten deze week' })).getAllByRole('button', { pressed: true })).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Wijzigen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Gewoonte verwijderen' }))
    expect(screen.queryByText('Sporten')).toBeNull()
  })
})
