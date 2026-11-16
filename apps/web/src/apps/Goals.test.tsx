import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { gradesStore } from '../grades/store'
import { goalsStore } from '../goals/store'

const { Goals } = await import('./Goals')

describe('Doelen', () => {
  afterEach(() => {
    cleanup()
    goalsStore.update((s) => ({ ...s, goals: [] }))
  })

  it('sets an average goal that follows Cijfers by itself', () => {
    gradesStore.update((s) => ({
      ...s,
      courses: [{ id: 'm', name: 'Wiskunde', credits: 6, target: 10, parts: [{ id: 'p', name: 'Examen', weight: 100, score: 12, max: 20 }], updatedAt: 1, deletedAt: null }],
    }))
    render(<Goals />)
    const form = screen.getByRole('form', { name: 'Nieuw doel' })
    fireEvent.click(within(form).getByRole('radio', { name: 'Gemiddelde van je cijfers' }))
    fireEvent.change(within(form).getByLabelText('Doel (/20)'), { target: { value: '14' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Doel opslaan' }))
    const row = screen.getByRole('listitem', { name: 'Gemiddeld 14/20' })
    expect(row.textContent).toContain('12/20 van 14/20')
    expect(row.textContent).toContain('Achter')
    act(() => gradesStore.update((s) => ({ ...s, courses: s.courses.map((c) => ({ ...c, parts: [{ ...c.parts[0], score: 15 }] })) })))
    expect(screen.getByRole('listitem', { name: 'Gemiddeld 14/20' }).textContent).toContain('Gehaald')
  })

  it('needs a habit before it can follow one, and removes a goal', () => {
    render(<Goals />)
    const form = screen.getByRole('form', { name: 'Nieuw doel' })
    fireEvent.click(within(form).getByRole('radio', { name: 'Een gewoonte volhouden' }))
    expect(within(form).getByText('Voeg eerst een gewoonte toe in Gewoontes.')).toBeTruthy()
    expect((within(form).getByRole('button', { name: 'Doel opslaan' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(within(form).getByRole('radio', { name: 'Focustijd per week' }))
    fireEvent.click(within(form).getByRole('button', { name: 'Doel opslaan' }))
    const row = screen.getByRole('listitem', { name: '10 uur per week studeren' })
    expect(row.textContent).toContain('van 10 uur deze week')
    fireEvent.click(within(row).getByRole('button', { name: 'Aanpassen' }))
    const confirm = window.confirm
    window.confirm = () => true
    fireEvent.click(within(row).getByRole('button', { name: 'Verwijderen' }))
    window.confirm = confirm
    expect(screen.queryByRole('listitem', { name: '10 uur per week studeren' })).toBeNull()
  })
})
