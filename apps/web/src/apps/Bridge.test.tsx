import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Bridge } from './Bridge'
import { preloadApps } from './registry'
import { bridgeStore } from '../bridge/store'
import { reveal } from '../search/reveal'

describe('Bridge app', () => {
  beforeAll(preloadApps)
  afterEach(cleanup)

  it('explains that Connect is needed before anything can be sent', () => {
    render(<Bridge />)
    fireEvent.click(screen.getByRole('tab', { name: 'Versturen' }))
    expect(screen.getByRole('alert').textContent).toMatch(/NEXUS Connect/)
    expect((screen.getByRole('button', { name: 'Versturen' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows a received transfer from the Inbox, with the ways to open it', () => {
    bridgeStore.update((s) => ({
      ...s,
      transfers: [{ id: 'in-1', direction: 'in', deviceId: 'pc', deviceName: 'Pc', type: 'link', content: 'https://ap.be/rooster', sentAt: Date.now(), expiresAt: Date.now() + 3_600_000, status: 'delivered', updatedAt: Date.now() }],
    }))
    reveal('bridge', 'in-1')
    render(<Bridge />)
    expect(screen.getByRole('tab', { name: 'Overdrachten' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('https://ap.be/rooster')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Link openen' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Als notitie bewaren' })).toBeTruthy()
  })
})
