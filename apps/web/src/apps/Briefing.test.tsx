import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { emptyBriefing, type Deadline } from '@nexus/core'
import { Briefing } from './Briefing'
import { briefingStore } from '../briefing/store'
import { setFeature } from '../features/store'
import { lifeStore } from '../life/store'

describe('Dagbriefing', () => {
  beforeEach(() => {
    setFeature('briefing', true)
    briefingStore.adopt(emptyBriefing())
  })
  afterEach(() => {
    cleanup()
    setFeature('briefing', false)
  })

  it('puts a late deadline first and ticks it off', async () => {
    await lifeStore.addDeadline({ title: 'Taak netwerken', dueAt: Date.now() - 2 * 24 * 60 * 60_000, projectId: null, notes: '', remind: [], target: 'this_device' })
    render(<Briefing />)
    fireEvent.click(screen.getByRole('tab', { name: 'Overzicht' }))
    const first = await screen.findByRole('list', { name: 'Eerst' })
    expect(within(first).getByText('Te laat')).toBeTruthy()
    expect(within(first).getByText('Taak netwerken')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Prioriteiten' }))
    fireEvent.click(within(screen.getByRole('list', { name: 'Prioriteiten' })).getByRole('button', { name: 'Taak netwerken afvinken' }))
    await waitFor(() => expect((lifeStore.getSnapshot().find((i) => i.kind === 'deadline' && i.title === 'Taak netwerken') as Deadline).doneAt).not.toBeNull())
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Taak netwerken afvinken' })).toBeNull())
  })

  it('shows the Dagstart settings in Bezorging and an empty history', () => {
    render(<Briefing />)
    fireEvent.click(screen.getByRole('tab', { name: 'Bezorging' }))
    expect(screen.getByRole('checkbox', { name: 'Dagstart aan' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Voorbeeld' })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Geschiedenis' }))
    expect(screen.getByText(/Nog geen Dagstart verstuurd/)).toBeTruthy()
    act(() => briefingStore.update((s) => ({ ...s, log: [{ id: '2026-11-03:phone', date: '2026-11-03', channel: 'phone', at: Date.now(), title: 'Dagstart di 3 nov.: 2 lessen', test: false }] })))
    expect(within(screen.getByRole('list', { name: 'Geschiedenis' })).getByText(/Gsm en horloge/)).toBeTruthy()
  })
})
