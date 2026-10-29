import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readStorage } from '../state/storage'
import { startTour, Tour } from './Tour'

describe('Rondleiding', () => {
  afterEach(cleanup)

  it('walks through the steps and opens an app', () => {
    const onOpenApp = vi.fn()
    render(<Tour onOpenApp={onOpenApp} />)
    act(() => startTour())
    expect(screen.getByRole('dialog', { name: 'Welkom bij NEXUS' })).toBeTruthy()
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: 'Volgende' }))
    expect(screen.getByRole('heading', { name: 'Lesrooster en profielen' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Profielen openen' }))
    expect(onOpenApp).toHaveBeenCalledWith('profiles')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(readStorage('nexus.tour.done')).toBe('1')
  })

  it('can be skipped and started again', () => {
    render(<Tour onOpenApp={() => {}} />)
    act(() => startTour())
    fireEvent.click(screen.getByRole('button', { name: 'Overslaan' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => startTour())
    // It starts again at the first step.
    expect(screen.getByRole('dialog', { name: 'Welkom bij NEXUS' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Terug' })).toBeNull()
  })
})
