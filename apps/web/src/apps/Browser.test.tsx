import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { emptyBrowser } from '@nexus/core'
import { Browser } from './Browser'
import { profilesStore } from '../profiles/store'

describe('Browser', () => {
  beforeEach(() => profilesStore.update((s) => ({ ...s, browser: emptyBrowser() })))
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('searches, opens addresses and keeps bookmarks in folders', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<Browser />)
    const bar = screen.getByRole('textbox', { name: 'Zoek of typ een adres' })
    fireEvent.change(bar, { target: { value: 'weer antwerpen' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ga' }))
    expect(open).toHaveBeenLastCalledWith('https://www.google.com/search?q=weer%20antwerpen', '_blank', 'noopener')
    fireEvent.change(screen.getByRole('combobox', { name: 'Zoekmachine' }), { target: { value: 'duckduckgo' } })
    fireEvent.change(bar, { target: { value: 'vrt.be' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ga' }))
    expect(open).toHaveBeenLastCalledWith('https://vrt.be/', '_blank', 'noopener')

    fireEvent.click(screen.getByRole('button', { name: '+ Bladwijzer' }))
    let form = screen.getByRole('form', { name: 'Nieuwe bladwijzer' })
    fireEvent.change(within(form).getByRole('textbox', { name: 'Adres' }), { target: { value: 'canvas.ap.be' } })
    fireEvent.change(within(form).getByRole('textbox', { name: 'Naam' }), { target: { value: 'Canvas' } })
    fireEvent.change(within(form).getByRole('combobox', { name: 'Map' }), { target: { value: 'School' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Toevoegen' }))
    const school = screen.getByRole('region', { name: 'School' })
    fireEvent.click(within(school).getByRole('button', { name: /Canvas/ }))
    expect(open).toHaveBeenLastCalledWith('https://canvas.ap.be/', '_blank', 'noopener')

    fireEvent.click(screen.getByRole('button', { name: '+ Bladwijzer' }))
    form = screen.getByRole('form', { name: 'Nieuwe bladwijzer' })
    fireEvent.change(within(form).getByRole('textbox', { name: 'Adres' }), { target: { value: 'https://canvas.ap.be' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Toevoegen' }))
    expect(screen.getByRole('alert').textContent).toBe('Die bladwijzer heb je al.')
    fireEvent.click(within(form).getByRole('button', { name: 'Annuleren' }))

    fireEvent.click(screen.getByRole('button', { name: 'Bewerken' }))
    fireEvent.click(screen.getByRole('button', { name: 'Canvas verwijderen' }))
    expect(profilesStore.getSnapshot().state.browser).toEqual({ engine: 'duckduckgo', bookmarks: [] })
  })
})
