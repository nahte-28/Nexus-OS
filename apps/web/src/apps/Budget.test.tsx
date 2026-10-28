import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { budgetStore, fireBudgetWarnings } from '../budget/store'

const { Budget } = await import('./Budget')

describe('Budget', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  it('sets a budget, adds an expense and shows what is left', () => {
    render(<Budget />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Budget per maand' }), { target: { value: '200' } })
    fireEvent.click(screen.getByRole('button', { name: 'Bewaren' }))
    expect(budgetStore.getSnapshot().monthly).toBe(20000)

    const form = screen.getByRole('form', { name: 'Nieuw bedrag' })
    fireEvent.change(within(form).getByRole('textbox', { name: 'Bedrag' }), { target: { value: '12,50' } })
    fireEvent.change(within(form).getByRole('textbox', { name: 'Notitie' }), { target: { value: 'Broodjes' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Toevoegen' }))

    const tiles = screen.getByRole('region', { name: 'Deze maand' })
    expect(within(tiles).getByText(/12,50/)).toBeTruthy()
    expect(within(tiles).getByText(/187,50/)).toBeTruthy()
    expect(screen.getByText(/Broodjes/)).toBeTruthy()
    expect(screen.getByRole('meter', { name: 'Budget gebruikt' }).getAttribute('aria-valuenow')).toBe('6')

    fireEvent.click(screen.getByRole('button', { name: /Eten en drinken .*12,50 verwijderen/ }))
    expect(screen.getByText('Nog niets ingevuld voor deze maand.')).toBeTruthy()
  })

  it('warns once when the budget is nearly used', async () => {
    const now = new Date(2026, 9, 15).getTime()
    const state = { transactions: [{ id: 'a', kind: 'expense' as const, amount: 9000, category: 'Uitgaan', note: '', date: '2026-10-14', createdAt: 0, updatedAt: 1, deletedAt: null }], monthly: 10000, monthlyAt: 1, revision: 1 }
    const effects = { local: vi.fn(async () => {}), phones: vi.fn(async () => {}) }
    expect(await fireBudgetWarnings(state, effects, now)).toBe(1)
    expect(effects.phones).toHaveBeenCalledWith('80% van je budget gebruikt', expect.stringContaining('Nog'), 'budget:2026-10@80')
    expect(await fireBudgetWarnings(state, effects, now)).toBe(0)
  })
})
