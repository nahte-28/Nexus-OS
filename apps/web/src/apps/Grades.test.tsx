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

  it('works out what the next exam needs with practice exams of 15 %', () => {
    render(<Grades />)
    fireEvent.change(screen.getByPlaceholderText('bv. Elektronica 1'), { target: { value: 'Wiskunde' } })
    fireEvent.click(screen.getByRole('button', { name: 'Vak toevoegen' }))
    fireEvent.change(screen.getAllByLabelText('Examen telt mee').at(-1)!, { target: { value: '70' } })
    for (const name of ['Oefenexamen 1', 'Oefenexamen 2']) {
      fireEvent.click(screen.getByRole('button', { name: '+ Onderdeel' }))
      fireEvent.change(screen.getAllByLabelText('Onderdeel').at(-1)!, { target: { value: name } })
      fireEvent.change(screen.getByLabelText(`${name} telt mee`), { target: { value: '15' } })
    }
    fireEvent.change(screen.getByLabelText('Oefenexamen 1 punt'), { target: { value: '12' } })

    const calc = screen.getByRole('region', { name: 'Wat moet ik halen' })
    // Examen first: the other open part at your mark so far, 12/20.
    expect(within(calc).getByText('Op Examen heb je minstens 9,2/20 nodig.')).toBeTruthy()
    expect(within(calc).getByText(/Haal je daar 20\/20, dan volstaat 7,5\/20/)).toBeTruthy()

    fireEvent.change(within(calc).getByLabelText('Volgende examen'), { target: { value: within(calc).getByRole('option', { name: /Oefenexamen 2/ }).getAttribute('value') } })
    fireEvent.change(within(calc).getByLabelText('Verwacht op de rest'), { target: { value: '10' } })
    expect(within(calc).getByText('Op Oefenexamen 2 heb je minstens 8/20 nodig.')).toBeTruthy()
  })
})
