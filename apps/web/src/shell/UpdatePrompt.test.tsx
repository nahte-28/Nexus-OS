import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UpdatePrompt } from './UpdatePrompt'
import { connectServiceWorker, resetSwUpdate, updateReady } from './swUpdate'

afterEach(() => {
  cleanup()
  resetSwUpdate()
})

describe('UpdatePrompt', () => {
  it('shows nothing while no new version waits', () => {
    render(<UpdatePrompt bottom={8} />)
    expect(screen.queryByText(/Nieuwe versie/)).toBeNull()
  })

  it('activates the waiting version with Bijwerken, reloading once', () => {
    const activate = vi.fn(() => Promise.resolve())
    connectServiceWorker(activate)
    render(<UpdatePrompt bottom={8} />)
    act(() => updateReady())
    fireEvent.click(screen.getByRole('button', { name: 'Bijwerken' }))
    expect(activate).toHaveBeenCalledWith(true)
    expect(screen.getByRole('button', { name: 'Bijwerken…' })).toHaveProperty('disabled', true)
  })

  it('goes away with Later and comes back for the next new version', () => {
    render(<UpdatePrompt bottom={8} />)
    act(() => updateReady())
    fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(screen.queryByText(/Nieuwe versie/)).toBeNull()
    act(() => updateReady())
    expect(screen.getByText(/Nieuwe versie/)).toBeTruthy()
  })
})
