import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from './App'
import { getAll } from './state/db'
import { ThemeProvider } from './theme/ThemeContext'

function mockViewport(mobile: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: mobile,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

const renderApp = () =>
  render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  )

describe('App shell', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('opens a window from the start menu and closes it', () => {
    mockViewport(false)
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Notities' }))
    expect(screen.getByRole('dialog', { name: 'Notities' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sluiten' }))
    expect(screen.queryByRole('dialog', { name: 'Notities' })).toBeNull()
  })

  it('saves notes to the device database', async () => {
    mockViewport(false)
    renderApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'Notities' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Nieuw' }))
    fireEvent.change(screen.getByLabelText('Inhoud'), { target: { value: 'Hallo NEXUS' } })
    await waitFor(async () => {
      const stored = await getAll<{ body: string }>('notes')
      expect(stored.map((n) => n.body)).toContain('Hallo NEXUS')
    })
  })

  it('explains that sync is local-only until an account is connected', () => {
    mockViewport(false)
    renderApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'Account' })[0])
    expect(screen.getByText(/Synchronisatie is nog niet ingesteld/)).toBeTruthy()
  })

  it('explains that devices and notifications need an account', () => {
    mockViewport(false)
    renderApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'Apparaten' })[0])
    expect(screen.getByText(/werkt met een account/)).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Meldingen' })[0])
    expect(screen.getByText(/Koppel dit apparaat in Apparaten/)).toBeTruthy()
  })

  it('switches theme and remembers it', () => {
    mockViewport(false)
    renderApp()
    fireEvent.click(screen.getAllByRole('button', { name: 'Instellingen' })[0])
    fireEvent.click(screen.getByRole('radio', { name: /NEXUS Pulse/ }))
    expect(document.documentElement.dataset.theme).toBe('pulse')
    expect(localStorage.getItem('nexus.theme')).toBe('pulse')
  })

  it('shows the app grid on phones and opens apps full screen', () => {
    mockViewport(true)
    renderApp()
    const grid = screen.getByRole('list', { name: 'Apps' })
    expect(grid).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Over NEXUS' })[0])
    expect(screen.getByRole('button', { name: 'Terug' })).toBeTruthy()
    expect(screen.getByText('NEXUS OS v0.5')).toBeTruthy()
  })
})
