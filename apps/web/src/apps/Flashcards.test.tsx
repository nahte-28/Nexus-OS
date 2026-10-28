import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { cardsInstruction, POST } from '../../../../api/cards'
import { flashcardsStore, makeCards } from '../flashcards/store'

const { Flashcards } = await import('./Flashcards')

describe('Leerkaarten', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('makes a deck, adds a card and practises it', () => {
    render(<Flashcards />)
    expect(screen.getByRole('button', { name: 'Niets te herhalen' })).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Naam van de stapel' }), { target: { value: 'Elektronica' } })
    fireEvent.click(screen.getByRole('button', { name: 'Toevoegen' }))

    fireEvent.change(screen.getByRole('textbox', { name: 'Vraag' }), { target: { value: 'Wet van Ohm?' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Antwoord' }), { target: { value: 'U = R · I' } })
    fireEvent.click(screen.getByRole('button', { name: 'Kaart toevoegen' }))
    expect(within(screen.getByRole('list', { name: 'Kaarten' })).getByText('Wet van Ohm?')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Oefen (1)' }))
    expect(screen.queryByLabelText('Antwoord')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Toon antwoord' }))
    expect(screen.getByLabelText('Antwoord').textContent).toBe('U = R · I')
    // A forgotten card comes back in the same session.
    fireEvent.click(screen.getByRole('button', { name: /Opnieuw/ }))
    expect(screen.getByText('Nog 1')).toBeTruthy()
    fireEvent.keyDown(document, { key: ' ' })
    fireEvent.keyDown(document, { key: '3' })
    expect(screen.getByText(/1 kaart herhaald/)).toBeTruthy()
    const card = flashcardsStore.getSnapshot().cards.find((c) => c.front === 'Wet van Ohm?')
    expect(card).toMatchObject({ reps: 1, lapses: 1, interval: 1 })
  })

  it('streams cards from NEXUS AI and needs a login', async () => {
    expect(cardsInstruction({ name: 'H3.pdf', focus: '' }, 20)).toBe('Bron: H3.pdf. Maak ongeveer 20 leerkaarten over het belangrijkste.')
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test')
    vi.stubEnv('NEXUS_AI_ALLOWED_EMAILS', 'ethan@example.com')
    expect((await POST(new Request('https://nexus.test/api/cards', { method: 'POST', body: '{}' }))).status).toBe(401)

    const lines = [{ type: 'text', text: 'V: Eenheid van weerstand?\nA: Ohm\n\nV: Ver' }, { type: 'text', text: 'mogen?\nA: P = U · I\n' }, { type: 'done' }].map((e) => JSON.stringify(e) + '\n').join('')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(lines)))
    const counts: number[] = []
    const cards = await makeCards('les.txt', { kind: 'text', data: 'x' }, { count: 10, focus: '' }, (n) => counts.push(n), async () => 'token', '')
    expect(cards).toEqual([{ front: 'Eenheid van weerstand?', back: 'Ohm' }, { front: 'Vermogen?', back: 'P = U · I' }])
    expect(counts.at(-1)).toBe(2)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ type: 'text', text: 'Geen studiemateriaal.' }) + '\n')))
    await expect(makeCards('x.txt', { kind: 'text', data: 'x' }, { count: 10, focus: '' }, () => {}, async () => 'token', '')).rejects.toThrow(/geen stof/)
  })
})
