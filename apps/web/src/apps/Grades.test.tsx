import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

const { Grades } = await import('./Grades')

describe('Cijfers', () => {
  afterEach(cleanup)

  it('adds a course, fills in marks and shows what the exam needs', () => {
    render(<Grades />)
    fireEvent.change(screen.getByPlaceholderText('bv. Elektronica 1'), { target: { value: 'Elektronica 1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Vak toevoegen' }))
    const list = screen.getByRole('list', { name: 'Vakken' })
    expect(within(list).getByText('Elektronica 1')).toBeTruthy()

    // Examen at 70 %, a labo at 30 % with 16/20.
    fireEvent.change(screen.getByLabelText('Examen telt mee'), { target: { value: '70' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Onderdeel' }))
    fireEvent.change(screen.getByLabelText('Labo punt'), { target: { value: '16' } })
    expect(within(list).getByText(/gemiddeld 7,4\/20 nodig op de rest/)).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Examen punt'), { target: { value: '12,5' } })
    expect(within(list).getByText('Geslaagd')).toBeTruthy()
    // 0,7 × 12,5 + 0,3 × 16 = 13,55
    expect(within(screen.getByRole('region', { name: 'Overzicht' })).getByText('13,6/20')).toBeTruthy()
    expect(screen.getByText('6 van 6')).toBeTruthy()
  })
})
