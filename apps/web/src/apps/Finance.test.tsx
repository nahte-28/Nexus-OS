import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { emptyFinance, type FinanceState } from '@nexus/core'
import { applyRecurring, financeStore, fireBudgetWarnings, removeTransaction, fireSubscriptionNotices, clearFinance, takeOverLocalBudget } from '../finance/store'
import { reveal } from '../search/reveal'

const { Finance } = await import('./Finance')

const tab = (name: string) => fireEvent.click(screen.getByRole('tab', { name }))

describe('Financiën', () => {
  beforeEach(() => {
    localStorage.clear()
    financeStore.update(() => emptyFinance())
  })
  afterEach(cleanup)

  it('adds, edits and deletes a transaction and shows it in the overview', () => {
    render(<Finance />)
    tab('Transacties')
    fireEvent.click(screen.getByRole('button', { name: '+ Transactie' }))
    const form = screen.getByRole('form', { name: 'Nieuwe transactie' })
    fireEvent.change(within(form).getByRole('textbox', { name: 'Bedrag' }), { target: { value: '12,50' } })
    fireEvent.change(within(form).getByRole('textbox', { name: 'Omschrijving' }), { target: { value: 'Broodjes' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Toevoegen' }))
    // A second click right after is a double submit, not a second payment.
    expect(financeStore.getSnapshot().transactions).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: /bewerken/ }))
    const edit = screen.getByRole('form', { name: 'Transactie bewerken' })
    fireEvent.change(within(edit).getByRole('textbox', { name: 'Bedrag' }), { target: { value: '15' } })
    fireEvent.click(within(edit).getByRole('button', { name: 'Bewaren' }))
    expect(financeStore.getSnapshot().transactions[0].amount).toBe(1500)

    tab('Overzicht')
    const tiles = screen.getByRole('region', { name: 'Deze maand' })
    expect(within(tiles).getAllByText(/15,00/).length).toBeGreaterThan(0)

    tab('Transacties')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Zoek in transacties' }), { target: { value: 'pizza' } })
    expect(screen.getByText('Niets gevonden met deze filters.')).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Zoek in transacties' }), { target: { value: 'brood' } })
    fireEvent.click(screen.getByRole('button', { name: /verwijderen/ }))
    expect(screen.getByText('Nog geen transacties.')).toBeTruthy()
  })

  it('sets a category budget with its own threshold and warns once', async () => {
    render(<Finance />)
    tab('Budgetten')
    const form = screen.getByRole('form', { name: 'Nieuw budget' })
    fireEvent.change(within(form).getByRole('combobox'), { target: { value: 'Uitgaan' } })
    fireEvent.change(within(form).getByPlaceholderText('bv. 250'), { target: { value: '100' } })
    fireEvent.change(within(form).getByRole('spinbutton'), { target: { value: '50' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Budget instellen' }))
    expect(financeStore.getSnapshot().budgets[0]).toMatchObject({ category: 'Uitgaan', limit: 10000, threshold: 50 })

    const today = new Date()
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    act(() => financeStore.update((s) => ({ ...s, transactions: [{ id: 'a', kind: 'expense', amount: 6000, category: 'Uitgaan', note: '', date, subscriptionId: null, createdAt: 0, updatedAt: 1, deletedAt: null }] })))
    expect(screen.getByRole('meter', { name: 'Uitgaan gebruikt' }).getAttribute('aria-valuenow')).toBe('60')
    const effects = { local: vi.fn(async () => {}), phones: vi.fn(async () => {}) }
    expect(await fireBudgetWarnings(financeStore.getSnapshot(), effects)).toBe(1)
    expect(effects.phones).toHaveBeenCalledWith('Uitgaan: 50% van je budget gebruikt', expect.stringContaining('Nog'), expect.stringMatching(/^finance:.*@50$/))
    expect(await fireBudgetWarnings(financeStore.getSnapshot(), effects)).toBe(0)
  })

  it('tracks a savings goal and a subscription that becomes an expense when paid', async () => {
    render(<Finance />)
    tab('Sparen')
    fireEvent.click(screen.getByRole('button', { name: '+ Spaardoel' }))
    const goal = screen.getByRole('form', { name: 'Nieuw spaardoel' })
    fireEvent.change(within(goal).getByRole('textbox', { name: 'Naam' }), { target: { value: 'Laptop' } })
    fireEvent.change(within(goal).getByRole('textbox', { name: 'Doelbedrag' }), { target: { value: '600' } })
    fireEvent.click(within(goal).getByRole('button', { name: 'Spaardoel maken' }))
    const put = screen.getByRole('form', { name: 'Bijdrage aan Laptop' })
    fireEvent.change(within(put).getByRole('textbox', { name: 'Bedrag' }), { target: { value: '150' } })
    fireEvent.click(within(put).getByRole('button', { name: 'Opzijzetten' }))
    expect(screen.getByRole('meter', { name: 'Laptop gespaard' }).getAttribute('aria-valuenow')).toBe('25')

    tab('Abonnementen')
    fireEvent.click(screen.getByRole('button', { name: '+ Abonnement' }))
    const sub = screen.getByRole('form', { name: 'Nieuw abonnement' })
    fireEvent.change(within(sub).getByRole('textbox', { name: 'Naam' }), { target: { value: 'Spotify' } })
    fireEvent.change(within(sub).getByRole('textbox', { name: 'Bedrag' }), { target: { value: '11,99' } })
    fireEvent.click(within(sub).getByRole('button', { name: 'Abonnement toevoegen' }))
    const before = financeStore.getSnapshot().subscriptions[0].next
    fireEvent.click(screen.getByRole('button', { name: 'Spotify betaald' }))
    const s = financeStore.getSnapshot()
    expect(s.transactions[0]).toMatchObject({ amount: 1199, category: 'Abonnementen', note: 'Spotify', date: before, subscriptionId: s.subscriptions[0].id })
    expect(s.subscriptions[0].next > before).toBe(true)

    // The reminder comes at 09:00 the day before the next payment.
    const at = new Date(s.subscriptions[0].next)
    const dayBefore = new Date(at.getFullYear(), at.getMonth(), at.getDate() - 1, 9, 0, 30).getTime()
    localStorage.setItem('nexus.finance.checkedAt', String(dayBefore - 60_000))
    const effects = { local: vi.fn(async () => {}), phones: vi.fn(async () => {}) }
    expect(await fireSubscriptionNotices(s, effects, dayBefore)).toBe(1)
    expect(effects.phones).toHaveBeenCalledWith('Spotify wordt morgen betaald', expect.stringContaining('11,99'), expect.stringMatching(/^subscription:/))
  })

  it('takes over what the Budget app kept on this device, once', () => {
    localStorage.setItem('nexus.budget', JSON.stringify({ transactions: [{ id: 'old', kind: 'expense', amount: 450, category: 'Uitgaan', note: '', date: '2026-10-20', createdAt: 1, updatedAt: 1, deletedAt: null }], monthly: 20000, monthlyAt: 2, revision: 1 }))
    takeOverLocalBudget()
    takeOverLocalBudget()
    const s = financeStore.getSnapshot()
    expect(s.transactions.map((t) => t.id)).toEqual(['old'])
    expect(s.budgets).toHaveLength(1)
  })

  it('imports a bank CSV after showing it, without doubles the second time', async () => {
    const csv = 'Datum;Omschrijving;Bedrag;Naam tegenpartij\n31/10/2026;KAART;-23,45;DELHAIZE\n30/10/2026;OVERSCHRIJVING;1.250,00;RANDSTAD\n'
    // Windows-1252, as some banks write: "é" is one byte that is no valid UTF-8.
    const bytes = new Uint8Array([...new TextEncoder().encode(csv), ...[0x33, 0x30, 0x2f, 0x31, 0x30, 0x2f, 0x32, 0x30, 0x32, 0x36, 0x3b, 0x43, 0x61, 0x66, 0xe9, 0x3b, 0x2d, 0x34, 0x2c, 0x30, 0x30, 0x3b, 0x0a]])
    render(<Finance />)
    tab('Transacties')
    for (const round of [1, 2]) {
      fireEvent.click(screen.getByRole('button', { name: 'Importeren uit CSV' }))
      fireEvent.change(screen.getByLabelText('CSV-bestand van je bank'), { target: { files: [new File([bytes], 'bank.csv', { type: 'text/csv' })] } })
      await waitFor(() => screen.getByRole('table'))
      expect(screen.getByText('Café')).toBeTruthy()
      if (round === 1) {
        expect(screen.getByRole('combobox', { name: 'Categorie van DELHAIZE · KAART' })).toHaveProperty('value', 'Eten en drinken')
        fireEvent.click(screen.getByRole('checkbox', { name: /Café importeren/ }))
        fireEvent.click(screen.getByRole('button', { name: '2 transacties importeren' }))
        expect(screen.getByRole('status').textContent).toBe('2 transacties geïmporteerd.')
      } else {
        // The two from before are there already and not ticked; only Café is left.
        expect(screen.getAllByText('staat er al')).toHaveLength(2)
        fireEvent.click(screen.getByRole('button', { name: '1 transactie importeren' }))
      }
    }
    const s = financeStore.getSnapshot()
    expect(s.transactions.map((t) => [t.kind, t.amount, t.category])).toEqual([
      ['expense', 2345, 'Eten en drinken'],
      ['income', 125000, 'Job'],
      ['expense', 400, 'Uitgaan'],
    ])
  })

  it('carries what is left of a budget into the next month when asked', () => {
    render(<Finance />)
    tab('Budgetten')
    const form = screen.getByRole('form', { name: 'Nieuw budget' })
    fireEvent.change(within(form).getByPlaceholderText('bv. 250'), { target: { value: '100' } })
    fireEvent.click(within(form).getByRole('checkbox', { name: /schuift door/ }))
    fireEvent.click(within(form).getByRole('button', { name: 'Budget instellen' }))
    const today = new Date()
    expect(financeStore.getSnapshot().budgets[0].rolloverFrom).toBe(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)
    expect(screen.getByText(/overschot schuift door/)).toBeTruthy()
  })

  it('adds a fixed amount by itself on its date, once, and not again after deleting it', () => {
    render(<Finance />)
    tab('Abonnementen')
    fireEvent.click(screen.getByRole('button', { name: '+ Vast bedrag' }))
    const form = screen.getByRole('form', { name: 'Nieuw vast bedrag' })
    fireEvent.change(within(form).getByRole('textbox', { name: 'Naam' }), { target: { value: 'Zakgeld' } })
    fireEvent.change(within(form).getByRole('textbox', { name: 'Bedrag' }), { target: { value: '50' } })
    const today = new Date()
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    fireEvent.change(within(form).getByLabelText('Volgende datum'), { target: { value: day(lastMonth) } })
    fireEvent.click(within(form).getByRole('button', { name: 'Vast bedrag toevoegen' }))
    let s = financeStore.getSnapshot()
    // Last month and this month, as income in Zakgeld.
    expect(s.transactions.map((t) => [t.kind, t.amount, t.category, t.note])).toEqual([
      ['income', 5000, 'Zakgeld', 'Zakgeld'],
      ['income', 5000, 'Zakgeld', 'Zakgeld'],
    ])
    expect(s.recurring[0].next > day(today)).toBe(true)
    expect(screen.getByText(/erbij/)).toBeTruthy()

    act(() => removeTransaction(s.transactions[1].id))
    act(() => financeStore.update((x) => ({ ...x, recurring: x.recurring.map((r) => ({ ...r, next: s.transactions[1].date })) })))
    expect(applyRecurring()).toBe(0)
    s = financeStore.getSnapshot()
    expect(s.transactions.filter((t) => t.deletedAt === null)).toHaveLength(1)
  })

  it('shares a cost with friends, puts your own share in the expenses and settles up', () => {
    render(<Finance />)
    tab('Delen')
    for (const name of ['Remo', 'Lina']) {
      fireEvent.change(screen.getByRole('textbox', { name: 'Naam van je vriend' }), { target: { value: name } })
      fireEvent.click(screen.getByRole('button', { name: 'Toevoegen' }))
    }
    fireEvent.click(screen.getByRole('button', { name: '+ Gedeelde kosten' }))
    const form = screen.getByRole('form', { name: 'Nieuwe gedeelde kosten' })
    fireEvent.change(within(form).getByRole('textbox', { name: 'Omschrijving' }), { target: { value: 'Pizza' } })
    fireEvent.change(within(form).getByRole('textbox', { name: 'Totaalbedrag' }), { target: { value: '36' } })
    expect(within(form).getByText(/Jouw deel van € 12,00/)).toBeTruthy()
    fireEvent.click(within(form).getByRole('button', { name: 'Gedeelde kosten toevoegen' }))

    expect(screen.getAllByText(/is je € 12,00 schuldig/)).toHaveLength(2)
    expect(financeStore.getSnapshot().transactions).toMatchObject([{ kind: 'expense', amount: 1200, category: 'Eten en drinken', note: 'Gedeeld: Pizza' }])
    expect(screen.getByRole('button', { name: 'Remo verwijderen' })).toHaveProperty('disabled', true)

    fireEvent.click(screen.getByRole('button', { name: 'Remo terugbetaald' }))
    expect(screen.getByText('jullie staan quitte')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Pizza verwijderen' }))
    // Your share goes with it.
    expect(financeStore.getSnapshot().transactions[0].deletedAt).not.toBeNull()
  })

  it('opens the right form from a search shortcut, hides amounts and deletes everything', () => {
    financeStore.update((s): FinanceState => ({ ...s, transactions: [{ id: 'a', kind: 'income', amount: 5000, category: 'Job', note: '', date: '2026-10-01', subscriptionId: null, createdAt: 0, updatedAt: 1, deletedAt: null }] }))
    render(<Finance />)
    act(() => reveal('finance', 'new-goal'))
    expect(screen.getByRole('tab', { name: 'Sparen' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('form', { name: 'Nieuw spaardoel' })).toBeTruthy()

    tab('Instellingen')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bedragen verbergen op dit apparaat' }))
    tab('Transacties')
    expect(screen.getAllByText(/€ •••/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/50,00/)).toBeNull()

    tab('Instellingen')
    fireEvent.click(screen.getByRole('button', { name: 'Financiële gegevens verwijderen…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ja, alles verwijderen' }))
    const s = financeStore.getSnapshot()
    expect(s.transactions[0]).toMatchObject({ id: 'a', amount: 0, deletedAt: expect.any(Number) })
    expect(screen.getByRole('status').textContent).toContain('verwijderd')
    clearFinance()
  })
})
