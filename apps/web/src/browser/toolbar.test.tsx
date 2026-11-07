import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const calls: Array<[string, Record<string, unknown> | undefined]> = []
let tabs = { tabs: [{ id: 1, url: 'https://vrt.be/', title: 'VRT NWS', loading: false }], active: 1 }
// The real @tauri-apps/api/core invoke goes through this object, like inside the Windows app.
Object.assign(window, {
  __TAURI_INTERNALS__: {
    invoke: async (command: string, args?: Record<string, unknown>) => {
      calls.push([command, args])
      return command === 'browser_tabs' ? tabs : undefined
    },
  },
})
vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => {} }))

const { Toolbar } = await import('./toolbar')

describe('NEXUS Browser toolbar', () => {
  afterEach(() => {
    cleanup()
    calls.length = 0
  })

  it('shows the tabs, searches, opens a new tab and saves a bookmark', async () => {
    localStorage.setItem('nexus.profiles', JSON.stringify({ browser: { engine: 'duckduckgo', bookmarks: [{ id: 'b', title: 'Canvas', url: 'https://canvas.ap.be/' }] } }))
    render(<Toolbar />)
    expect(await screen.findByRole('tab', { name: 'VRT NWS' })).toBeTruthy()
    const bar = screen.getByRole('textbox', { name: 'Adres of zoekterm' }) as HTMLInputElement
    await waitFor(() => expect(bar.value).toBe('https://vrt.be/'))

    fireEvent.focus(bar)
    fireEvent.change(bar, { target: { value: 'weer antwerpen' } })
    fireEvent.submit(bar.closest('form')!)
    await waitFor(() => expect(calls).toContainEqual(['browser_navigate', { url: 'https://duckduckgo.com/?q=weer%20antwerpen' }]))

    fireEvent.click(screen.getByRole('button', { name: 'Nieuw tabblad' }))
    fireEvent.change(bar, { target: { value: 'ap.be' } })
    fireEvent.submit(bar.closest('form')!)
    await waitFor(() => expect(calls).toContainEqual(['browser_open', { url: 'https://ap.be/' }]))

    fireEvent.click(screen.getByRole('button', { name: 'Canvas' }))
    await waitFor(() => expect(calls).toContainEqual(['browser_navigate', { url: 'https://canvas.ap.be/' }]))

    fireEvent.click(screen.getByRole('button', { name: 'Terug' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bladwijzer toevoegen' }))
    await waitFor(() => expect(calls).toContainEqual(['browser_bookmark', { url: 'https://vrt.be/', title: 'VRT NWS' }]))
    expect(calls).toContainEqual(['browser_go', { action: 'back' }])

    fireEvent.click(screen.getByRole('button', { name: 'VRT NWS sluiten' }))
    await waitFor(() => expect(calls).toContainEqual(['browser_close_tab', { id: 1 }]))
    localStorage.removeItem('nexus.profiles')
    tabs = { tabs: [], active: 1 }
  })
})
