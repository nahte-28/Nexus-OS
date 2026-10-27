import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { focusStore } from '../study/timer'

const { Study } = await import('./Study')
const { lifeStore } = await import('../life/store')

describe('Studie', () => {
  afterEach(() => {
    cleanup()
    focusStore.reset()
  })

  it('runs the focus timer and logs a finished round', () => {
    render(<Study />)
    expect(screen.getByRole('timer').textContent).toBe('25:00')
    fireEvent.click(screen.getByRole('button', { name: 'Starten' }))
    expect(screen.getByRole('button', { name: 'Pauzeren' })).toBeTruthy()
    const started = focusStore.getSnapshot().timer.endsAt!
    // Time is up: the break starts by itself and the round counts.
    expect(focusStore.tick(started + 1)?.phase).toBe('focus')
    expect(focusStore.getSnapshot().timer).toMatchObject({ phase: 'break', round: 1 })
    expect(focusStore.getSnapshot().log.at(-1)?.minutes).toBe(25)
  })

  it('plans study blocks before a deadline and puts them in the Agenda', async () => {
    const due = Date.now() + 5 * 24 * 60 * 60_000
    await lifeStore.addDeadline({ title: 'Verslag labo 3', dueAt: due, projectId: null, notes: '', remind: [], target: 'this_device' })
    render(<Study />)
    fireEvent.click(screen.getByRole('tab', { name: 'Planning' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Tijd voor Verslag labo 3' }), { target: { value: '120' } })
    fireEvent.click(screen.getByRole('button', { name: 'Planning maken' }))
    const plan = screen.getByRole('region', { name: 'Voorstel' })
    expect(within(plan).getAllByText('Verslag labo 3').length).toBeGreaterThanOrEqual(2)
    fireEvent.click(within(plan).getByRole('button', { name: 'In Agenda zetten' }))
    await screen.findByText(/studieblokken staan in je Agenda/)
    const blocks = lifeStore.getSnapshot().filter((i) => i.kind === 'appointment')
    expect(blocks.length).toBeGreaterThanOrEqual(2)
    expect(blocks.every((b) => b.kind === 'appointment' && b.title === 'Studeren: Verslag labo 3' && b.endAt <= due)).toBe(true)
  })
})
