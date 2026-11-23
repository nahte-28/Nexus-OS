import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { emptyDarts } from '@nexus/core'
import { BOT_PAUSE, Darts } from './Darts'
import { dartsStore } from '../darts/store'

vi.mock('../darts/photos', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../darts/photos')>()),
  // jsdom draws no images, and NEXUS AI is not reachable in a test.
  shrinkPhoto: async () => 'data:image/jpeg;base64,AAAA',
  checkProof: async (f: { leg: number }, _out: boolean, _data: string, at: number) => ({ leg: f.leg, at, verdict: 'ok', darts: ['T20', 'T11', 'D14'] }),
}))

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
    fireEvent.click(screen.getByRole('radio', { name: 'Uit in 3' }))
    fireEvent.click(screen.getByRole('radio', { name: '2 op een dubbel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Invoeren' }))
    expect(screen.getByRole('status').textContent).toMatch(/Ethan wint met 1–0/)

    // The summary of the match shows right away.
    const summary = screen.getByRole('region', { name: 'Samenvatting van de wedstrijd' })
    const row = (label: string) => within(summary).getByRole('row', { name: new RegExp(`^${label}`) })
    expect(row('Gemiddelde').textContent).toContain('167,0')
    expect(row('Checkout %').textContent).toContain('50,0% (1/2)')
    expect(row('Hoogste finish').textContent).toContain('141')
    expect(row('Beste leg').textContent).toContain('9 pijlen')
    expect(row('180').textContent).toContain('2')

    fireEvent.click(screen.getByRole('tab', { name: 'Statistieken' }))
    const stats = screen.getByLabelText('Statistieken van Ethan')
    expect(within(stats).getAllByText('167.00')).toHaveLength(2) // average and first 9
    expect(within(stats).getByText('141')).toBeTruthy()
    expect(within(stats).getByText('9 pijlen')).toBeTruthy()
    expect(within(stats).getByText('50%')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Geschiedenis' }))
    fireEvent.click(screen.getByRole('button', { name: 'Samenvatting' }))
    expect(screen.getByRole('region', { name: 'Samenvatting van de wedstrijd' })).toBeTruthy()
  })

  it('leaves out 0 darts at a double once a player stands on a double', () => {
    render(<Darts />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Speler 2' }), { target: { value: 'Remo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Starten' }))
    throwScore(180)
    throwScore(60)
    throwScore(81) // Ethan 240
    throwScore(60)
    throwScore(140) // Ethan 100
    throwScore(60)
    // Ethan can finish 100, but stands on no double yet.
    expect(screen.getByRole('radio', { name: '0 op een dubbel' })).toBeTruthy()
    throwScore(60) // Ethan 40
    throwScore(60)
    // Ethan stands on D20.
    expect(screen.queryByRole('radio', { name: '0 op een dubbel' })).toBeNull()
    expect((screen.getByRole('radio', { name: '1 op een dubbel' }) as HTMLInputElement).checked).toBe(true)
  })

  it('plays against the bot, which throws by itself, and undoes its visit with yours', () => {
    vi.useFakeTimers()
    try {
      render(<Darts />)
      fireEvent.click(screen.getByRole('checkbox', { name: 'Tegen de bot' }))
      expect(screen.queryByRole('textbox', { name: 'Speler 2' })).toBeNull()
      fireEvent.change(screen.getByRole('combobox', { name: 'Niveau van de bot' }), { target: { value: 'pro' } })
      fireEvent.click(screen.getByRole('button', { name: 'Starten' }))
      const board = () => screen.getByRole('region', { name: 'Scorebord' })
      expect(within(board()).getByText('Bot (Pro)')).toBeTruthy()
      throwScore(100)
      // The bot's turn: no score field, it throws after a pause.
      expect(screen.queryByRole('textbox', { name: 'Score van deze beurt' })).toBeNull()
      expect(within(board()).getByRole('status').textContent).toContain('Bot (Pro) gooit')
      act(() => vi.advanceTimersByTime(BOT_PAUSE + 10))
      expect(screen.getByLabelText('Pijlen van de bot').textContent).toMatch(/^Bot \(Pro\) gooide \S+ · \S+ · \S+$/)
      expect(screen.getByRole('textbox', { name: 'Score van deze beurt' })).toBeTruthy()
      expect(screen.getByLabelText('Gemiddelde van Bot (Pro)').textContent).not.toContain('–')
      // Undo takes back the bot's visit and yours.
      fireEvent.click(screen.getByRole('button', { name: 'Ongedaan maken' }))
      expect(screen.getByLabelText('Gemiddelde van Ethan').textContent).toContain('–')
      expect(screen.getByLabelText('Gemiddelde van Bot (Pro)').textContent).toContain('–')
      expect(screen.getByRole('textbox', { name: 'Score van deze beurt' })).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('adds a photo as proof of a high checkout, checked by NEXUS AI', async () => {
    dartsStore.adopt({ ...emptyDarts(), settings: { ...emptyDarts().settings, me: 'Ethan', legsToWin: 1, mode: 301 } })
    render(<Darts />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Speler 2' }), { target: { value: 'Remo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Starten' }))
    throwScore(180)
    throwScore(60)
    expect(screen.queryByRole('region', { name: "Bewijsfoto's" })).toBeNull()
    fireEvent.change(screen.getByRole('textbox', { name: 'Score van deze beurt' }), { target: { value: '121' } })
    fireEvent.click(screen.getByRole('button', { name: 'Invoeren' }))
    const proofs = screen.getByRole('region', { name: "Bewijsfoto's" })
    expect(within(proofs).getByText(/gooide/).textContent).toBe('Leg 1: Ethan gooide 121 uit')
    fireEvent.change(await within(proofs).findByLabelText('Bewijsfoto voor 121'), { target: { files: [new File(['x'], 'bord.jpg', { type: 'image/jpeg' })] } })
    expect(await within(proofs).findByText('✓ Klopt volgens NEXUS AI: T20 T11 D14')).toBeTruthy()
    expect(within(proofs).getByRole('img', { name: 'Bord na de finish van 121' })).toBeTruthy()
    expect(dartsStore.getSnapshot().matches[0].proofs).toMatchObject([{ leg: 0, verdict: 'ok', darts: ['T20', 'T11', 'D14'] }])
    fireEvent.click(within(proofs).getByRole('button', { name: 'Bewijsfoto van 121 weghalen' }))
    expect(await within(proofs).findByLabelText('Bewijsfoto voor 121')).toBeTruthy()
    expect(dartsStore.getSnapshot().matches[0].proofs).toBeUndefined()
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

  it('plays Cricket: marks, points, a win with its summary, and the history', () => {
    render(<Darts />)
    fireEvent.click(screen.getByRole('radio', { name: 'Cricket' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Speler 2' }), { target: { value: 'Remo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Starten' }))
    const board = () => screen.getByRole('region', { name: 'Cricket-scorebord' })
    const dart = (mult: 'Single' | 'Double' | 'Triple', target: string) => {
      fireEvent.click(within(board()).getByRole('radio', { name: mult }))
      fireEvent.click(within(board()).getByRole('button', { name: target }))
    }
    const visit = () => fireEvent.click(within(board()).getByRole('button', { name: /^Beurt invoeren/ }))
    // Ethan: T20 T20, then Remo misses.
    dart('Triple', '20')
    dart('Triple', '20')
    visit()
    expect(screen.getByLabelText('Punten van Ethan').textContent).toBe('60')
    expect(screen.getByLabelText('Ethan op 20: dicht')).toBeTruthy()
    visit()
    for (const set of [['19', '18', '17'], ['16', '15']]) {
      for (const t of set) dart('Triple', t)
      visit()
      visit()
    }
    dart('Double', 'Bull')
    dart('Single', 'Bull')
    visit()
    expect(screen.getByRole('status').textContent).toMatch(/Ethan wint met 1–0/)
    const summary = screen.getByRole('region', { name: 'Samenvatting van de wedstrijd' })
    expect(within(summary).getByRole('row', { name: /^Triples/ }).textContent).toContain('7')

    fireEvent.click(screen.getByRole('tab', { name: 'Geschiedenis' }))
    expect(screen.getByText(/Cricket ·/)).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Statistieken' }))
    expect(within(screen.getByLabelText('Cricket-statistieken van Ethan')).getByText('1 van 1')).toBeTruthy()
  })
})
