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
    expect(screen.getByLabelText('Gemiddelde van Ethan').textContent).toContain('gem. 180.00')
    expect(screen.getByLabelText('Gemiddelde van Remo').textContent).toContain('gem. 80.00')
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

  it('keeps nicknames, picks a regular player and shows stats per player', () => {
    render(<Darts />)
    fireEvent.click(screen.getByRole('tab', { name: 'Instellingen' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Jouw bijnaam (mag leeg)' }), { target: { value: 'The Power' } })
    const add = screen.getByRole('form', { name: 'Speler toevoegen' })
    fireEvent.change(within(add).getByRole('textbox', { name: 'Naam' }), { target: { value: 'Remo' } })
    fireEvent.change(within(add).getByRole('textbox', { name: 'Bijnaam' }), { target: { value: 'Bully' } })
    fireEvent.click(within(add).getByRole('button', { name: 'Toevoegen' }))
    expect((screen.getByRole('textbox', { name: 'Bijnaam van Remo' }) as HTMLInputElement).value).toBe('Bully')

    fireEvent.click(screen.getByRole('tab', { name: 'Spelen' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Vaste spelers' })).getByRole('button', { name: "+ Remo 'Bully'" }))
    expect((screen.getByRole('textbox', { name: 'Speler 2' }) as HTMLInputElement).value).toBe('Remo')
    fireEvent.click(screen.getByRole('button', { name: 'Starten' }))
    const board = screen.getByRole('region', { name: 'Scorebord' })
    expect(within(board).getByText("'The Power'")).toBeTruthy()
    expect(within(board).getByText("'Bully'")).toBeTruthy()
    throwScore(100)
    throwScore(60)

    fireEvent.click(screen.getByRole('tab', { name: 'Statistieken' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Speler' }), { target: { value: 'Remo' } })
    expect(within(screen.getByLabelText('Statistieken van Remo')).getAllByText('60.00', { selector: 'dd' })).toHaveLength(2) // average and first 9
  })

  it("plays Bob's 27, a scoring round and Doubles rond", () => {
    render(<Darts />)
    fireEvent.click(screen.getByRole('tab', { name: 'Oefenen' }))
    fireEvent.click(screen.getByRole('button', { name: "Bob's 27" }))
    const bobs = () => screen.getByRole('region', { name: "Bob's 27" })
    expect(within(bobs()).getByText('D1')).toBeTruthy()
    fireEvent.click(within(bobs()).getByRole('button', { name: '2 raak' }))
    expect(within(bobs()).getByText('stand: 31')).toBeTruthy()
    fireEvent.click(within(bobs()).getByRole('button', { name: 'Stoppen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nieuwe oefening' }))

    fireEvent.click(screen.getByRole('button', { name: 'Scoring op T20' }))
    const scoring = () => screen.getByRole('region', { name: 'Scoring op T20' })
    for (let i = 0; i < 10; i++) fireEvent.click(within(scoring()).getByRole('button', { name: i % 2 ? '100' : '60' }))
    expect(within(scoring()).getByText('80.0')).toBeTruthy()
    expect(within(scoring()).getByText('Klaar')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Nieuwe oefening' }))

    fireEvent.click(screen.getByRole('button', { name: 'Doubles rond' }))
    expect(within(screen.getByRole('region', { name: 'Doubles rond' })).getByText('D1')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Statistieken' }))
    const stats = screen.getByLabelText('Statistieken van het oefenen')
    expect(stats.textContent).toContain("Beste Bob's 2731")
    expect(stats.textContent).toContain('80 per beurt')
  })

  it('plays pairs from a custom score of 170, best of 3 legs', () => {
    render(<Darts />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Koppels (2 tegen 2)' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Koppel 1, speler 2' }), { target: { value: 'Remo' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Koppel 2, speler 1' }), { target: { value: 'Jan' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Koppel 2, speler 2' }), { target: { value: 'Piet' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Spel' }), { target: { value: 'eigen' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: /Startscore/ }), { target: { value: '170' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Legs' }), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Starten' }))
    const board = () => screen.getByRole('region', { name: 'Scorebord' })
    expect(within(board()).getByText(/170 · double-out · best of 3 legs/)).toBeTruthy()
    expect(within(board()).getByText('Ethan', { selector: 'b' })).toBeTruthy()
    throwScore(100)
    expect(within(board()).getByText('Jan', { selector: 'b' })).toBeTruthy()
    throwScore(0)
    expect(within(board()).getByText('Remo', { selector: 'b' })).toBeTruthy()
    throwScore(70)
    expect(dartsStore.getSnapshot().matches[0].legs).toHaveLength(2)
    // Leg 2: the other pair starts, and its other member throws first.
    expect(within(board()).getByText('Piet', { selector: 'b' })).toBeTruthy()
    expect(within(board()).getByText(/Ethan 100.00 · Remo 70.00/)).toBeTruthy()
  })

  it('plays best of 3 sets and shows the sets', () => {
    render(<Darts />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Speler 2' }), { target: { value: 'Remo' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Sets' }), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Starten' }))
    expect(screen.getByText(/best of 3 sets, 1 leg per set/)).toBeTruthy()
    expect(dartsStore.getSnapshot().matches[0].setsToWin).toBe(2)
  })
})
