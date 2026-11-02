import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ThemeProvider } from '../theme/ThemeContext'

vi.mock('../sync/SyncContext', () => ({ useSync: () => ({ state: { status: 'synced', pending: 0 } }) }))
vi.mock('../ai/runtime', async () => {
  const { AssistantSession } = await import('../ai/session')
  const assistant = new AssistantSession(
    async (_messages, onEvent) => {
      onEvent({ type: 'text', text: 'Hallo' })
      onEvent({
        type: 'done',
        message: { role: 'assistant', model: 'm', stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: 'Hallo', citations: null }] },
      })
    },
    () => ({ now: Date.now }) as never,
  )
  return { assistant, bindTheme: () => {} }
})

const { Assistant } = await import('./Assistant')

describe('Assistant', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('keeps working when scrollIntoView returns a Promise, as in newer browsers', async () => {
    Element.prototype.scrollIntoView = vi.fn(() => Promise.resolve()) as never
    render(
      <ThemeProvider>
        <Assistant />
      </ThemeProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Herinner me/ }))
    await waitFor(() => expect(screen.getByText('Hallo')).toBeTruthy())
    expect(screen.getByRole('textbox', { name: 'Bericht aan NEXUS AI' })).toBeTruthy()
  })

  it('shows what NEXUS AI may see and lets you switch a module off', () => {
    render(
      <ThemeProvider>
        <Assistant />
      </ThemeProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Wat NEXUS AI mag zien' }))
    const notes = screen.getByRole('checkbox', { name: /Notities/ }) as HTMLInputElement
    expect(notes.checked).toBe(true)
    fireEvent.click(notes)
    expect(notes.checked).toBe(false)
    expect(screen.getByText('Geschiedenis van goedkeuringen')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Terug naar het gesprek' }))
    expect(screen.getByRole('textbox', { name: 'Bericht aan NEXUS AI' })).toBeTruthy()
  })
})
