import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

const opened: string[] = []
vi.mock('../shell/openApp', () => ({ openApp: (id: string) => opened.push(id) }))
const { ControlCenter } = await import('./ControlCenter')
const { flowsStore } = await import('../flows/store')
const { lifeStore } = await import('../life/store')

describe('Control Center', () => {
  afterEach(cleanup)

  it('shows the status, opens the app behind a card and says what needs you', async () => {
    await lifeStore.addDeadline({ title: 'Te laat', dueAt: Date.now() - 60_000, projectId: null, notes: '', remind: [], target: 'this_device' })
    render(<ControlCenter />)
    expect(screen.getByRole('status').textContent).toMatch(/Deadlines: 1 te laat/)
    fireEvent.click(screen.getByRole('button', { name: /^Apparaten: Uit/ }))
    expect(opened).toContain('devices')
  })

  it('pauses flows with a quick switch', () => {
    render(<ControlCenter />)
    const pause = screen.getByRole('switch', { name: /Flows pauzeren/ })
    expect(pause.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(pause)
    expect(flowsStore.getSnapshot().settings.paused).toBe(true)
    expect(screen.getByRole('switch', { name: /Flows pauzeren/ }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('switch', { name: /Flows pauzeren/ }))
  })

  it('picks and orders favourites', () => {
    render(<ControlCenter />)
    const fav = screen.getByRole('heading', { name: 'Favorieten' }).parentElement!
    const stored = () => JSON.parse(localStorage.getItem('nexus.controlcenter.favorites') ?? '[]') as string[]
    fireEvent.click(within(fav).getByRole('button', { name: /Notities/, pressed: true }))
    expect(stored()).not.toContain('notes')
    expect(within(fav).queryByRole('button', { name: 'Notities naar voren' })).toBeNull()
    fireEvent.click(within(fav).getByRole('button', { name: /Notities/, pressed: false }))
    expect(stored().at(-1)).toBe('notes')
    fireEvent.click(within(fav).getByRole('button', { name: 'Notities naar voren' }))
    expect(stored().at(-2)).toBe('notes')
  })
})
