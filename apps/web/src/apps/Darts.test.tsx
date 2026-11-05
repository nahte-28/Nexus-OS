import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { emptyDarts } from '@nexus/core'
import { Darts } from './Darts'
import { dartsStore } from '../darts/store'

const throwScore = (n: number) => {
  fireEvent.change(screen.getByRole('textbox', { name: 'Score van deze beurt' }), { target: { value: String(n) } })
  fireEvent.click(screen.getByRole('button', { name: 'Invoeren' }))
}

describe('Darts', () => {
  beforeEach(() => {
    dartsStore.adopt({ ...emptyDarts(), settings: { ...emptyDarts().settings, me: 'Ethan', legsToWin: 1 } })
    localStorage.removeItem('nexus.darts.tab')
  })
  afterEach(cleanup)

  it('plays a leg with a checkout tip, a bust and an undo, then shows the stats', () => {
    render(<Darts />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Speler 2' }), { target: { value: 'Remo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Starten' }))
    const board = () => screen.getByRole('region', { name: 'Scorebord' })

    throwScore(180)
    throwScore(60)
    throwScore(180)
    expect(within(board()).getByText('Remo', { selector: 'b' })).toBeTruthy()
    throwScore(100)
    // Ethan has 141 left.
    expect(screen.getByText('T20 T15 D18')).toBeTruthy()
    throwScore(150)
    expect(screen.getByText('vorige beurt: 150 (bust)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ongedaan maken' }))
    expect(screen.getByText('T20 T15 D18')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Score van deze beurt' }), { target: { value: '141' } })
    fireEvent.click(screen.getByRole('radio', { name: '3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Invoeren' }))
    expect(screen.getByRole('status').textContent).toMatch(/Ethan wint met 1–0/)

    fireEvent.click(screen.getByRole('tab', { name: 'Statistieken' }))
    const stats = screen.getByLabelText('Statistieken van Ethan')
    expect(within(stats).getAllByText('167.00')).toHaveLength(2) // average and first 9
    expect(within(stats).getByText('141')).toBeTruthy()
    expect(within(stats).getByText('9 pijlen')).toBeTruthy()
  })
})
