import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { emptyGaming } from '@nexus/core'
import { Gaming } from './Gaming'
import { setFeature } from '../features/store'
import { gamingStore } from '../gaming/store'

describe('Gaming Companion', () => {
  beforeEach(() => {
    setFeature('gaming', true)
    gamingStore.adopt(emptyGaming())
    localStorage.removeItem('nexus.gaming.tab')
  })
  afterEach(() => {
    cleanup()
    setFeature('gaming', false)
  })

  it('adds a game, logs a session, saves a build and warns over the weekly plan', () => {
    render(<Gaming />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Nieuwe game' }), { target: { value: 'Rocket League' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Platform' }), { target: { value: 'pc' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Game' }))
    expect(within(screen.getByRole('list', { name: 'Bibliotheek' })).getByText('Rocket League')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Instellingen' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Uren per week' }), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Bewaren' }))

    fireEvent.click(screen.getByRole('tab', { name: 'Sessies' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Minuten' }), { target: { value: '90' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sessie noteren' }))
    expect(within(screen.getByRole('list', { name: 'Sessies' })).getByText(/Rocket League · 1 u 30 min/)).toBeTruthy()
    expect(screen.getByText(/meer dan je plan van 1 u/)).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Builds' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Naam van de build' }), { target: { value: 'Octane' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Tags' }), { target: { value: 'Ranked, 3v3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Build bewaren' }))
    expect(within(screen.getByRole('list', { name: 'Builds' })).getByText('#ranked #3v3')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Statistieken' }))
    expect(within(screen.getByRole('region', { name: 'Per game' })).getByText(/1 u 30 min · 1 sessie/)).toBeTruthy()
  })
})
