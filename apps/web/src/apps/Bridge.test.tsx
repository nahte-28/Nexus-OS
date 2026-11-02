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

  it('Bridge 2.0: switches between text, file and verdergaan, and shows received files and resumes', () => {
    render(<Bridge />)
    fireEvent.click(screen.getByRole('tab', { name: 'Versturen' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Bestand' }))
    expect(screen.getByLabelText('Bestand')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Verdergaan' }))
    expect(screen.getByText(/Open een app of een notitie/)).toBeTruthy()
    cleanup()

    const now = Date.now()
    const file = { name: 'verslag.pdf', size: 2_000_000, mediaType: 'application/pdf', path: '0b6f8e2a-1c3d-4e5f-8a9b-0c1d2e3f4a5b/bridge/f.bin', key: 'AAAA', iv: 'BBBB' }
    bridgeStore.update((s) => ({
      ...s,
      transfers: [
        { id: 'f', direction: 'in', deviceId: 'pc', deviceName: 'Pc', type: 'file', content: 'verslag.pdf', file, sentAt: now, expiresAt: now + 3_600_000, status: 'delivered', updatedAt: now },
        { id: 'r', direction: 'in', deviceId: 'pc', deviceName: 'Pc', type: 'resume', content: 'Notitie Wiskunde', resume: { app: 'notes', id: 'n1', title: 'Notitie Wiskunde' }, sentAt: now, expiresAt: now + 3_600_000, status: 'delivered', updatedAt: now },
      ],
    }))
    render(<Bridge />)
    fireEvent.click(screen.getByRole('tab', { name: 'Overdrachten' }))
    expect(screen.getByText(/verslag\.pdf · 2,0 MB/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Opslaan' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'In Bestanden zetten' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Verdergaan' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Kopiëren' })).toBeNull()
  })
})
