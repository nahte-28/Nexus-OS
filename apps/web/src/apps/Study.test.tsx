import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { examsStore } from '../study/exams'
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

  it('keeps an exam with its study time, puts it in the Agenda and plans study for it', async () => {
    render(<Study />)
    fireEvent.click(screen.getByRole('tab', { name: 'Examens' }))
    fireEvent.click(screen.getByRole('button', { name: '+ Examen' }))
    const form = screen.getByRole('form', { name: 'Nieuw examen' })
    fireEvent.change(within(form).getByRole('combobox', { name: 'Vak' }), { target: { value: 'Elektronica 1' } })
    fireEvent.change(within(form).getByRole('spinbutton', { name: 'Studietijd in uren' }), { target: { value: '4' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Examen toevoegen' }))

    expect(screen.getByText('Elektronica 1')).toBeTruthy()
    expect(screen.getByText('over 14 dagen')).toBeTruthy()
    expect(screen.getByText(/0 van 4 uur gestudeerd/)).toBeTruthy()
    await waitFor(() => expect(examsStore.getSnapshot().exams[0].appointmentId).not.toBeNull())
    const exam = examsStore.getSnapshot().exams[0]
    expect(lifeStore.getSnapshot().find((i) => i.id === exam.appointmentId)).toMatchObject({ kind: 'appointment', title: 'Examen Elektronica 1', startAt: exam.at, remind: [1440, 60] })

    fireEvent.click(screen.getByRole('button', { name: 'Studietijd plannen' }))
    expect(screen.getByText(/Elektronica 1 \(nog 4 uur\)/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Planning maken' }))
    const plan = screen.getByRole('region', { name: 'Voorstel' })
    expect(within(plan).getAllByText('Elektronica 1').length).toBeGreaterThanOrEqual(4)

    fireEvent.click(screen.getByRole('tab', { name: 'Examens' }))
    fireEvent.click(screen.getByRole('button', { name: 'Examen Elektronica 1 verwijderen' }))
    await waitFor(() => expect(lifeStore.getSnapshot().find((i) => i.id === exam.appointmentId)?.deletedAt).not.toBeNull())
    expect(screen.getByText('Nog geen examens.')).toBeTruthy()
  })
})
