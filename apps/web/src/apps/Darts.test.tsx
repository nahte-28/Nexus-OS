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

  it('practises Around the Clock and checkouts, with stats', () => {
    render(<Darts />)
    fireEvent.click(screen.getByRole('tab', { name: 'Oefenen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Around the Clock' }))
    const clock = () => screen.getByRole('region', { name: 'Around the Clock' })
    fireEvent.click(within(clock()).getByRole('button', { name: 'Mis' }))
    for (let i = 0; i < 20; i++) fireEvent.click(within(clock()).getByRole('button', { name: 'Raak' }))
    expect(within(clock()).getByText('Bull')).toBeTruthy()
    fireEvent.click(within(clock()).getByRole('button', { name: 'Raak' }))
    expect(within(clock()).getByText('Rond in 22 pijlen.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Nieuwe oefening' }))
    fireEvent.click(screen.getByRole('button', { name: 'Checkout-training' }))
    const round = () => screen.getByRole('region', { name: 'Checkout-training' })
    expect(within(round()).getByText(/^Tip: /)).toBeTruthy()
    fireEvent.click(within(round()).getByRole('button', { name: 'Uit in 6 pijlen' }))
    fireEvent.click(within(round()).getByRole('button', { name: 'Niet gelukt' }))
    expect(within(round()).getByText(/1 van 2 uitgegooid/)).toBeTruthy()
    fireEvent.click(within(round()).getByRole('button', { name: 'Klaar' }))
    expect(screen.getByRole('list').textContent).toContain('Around the Clock')

    fireEvent.click(screen.getByRole('tab', { name: 'Statistieken' }))
    const stats = screen.getByLabelText('Statistieken van het oefenen')
    expect(stats.textContent).toContain('22 pijlen')
    expect(stats.textContent).toContain('1 van 2 (50%)')
    expect(dartsStore.getSnapshot().practice).toHaveLength(2)
  })
})
