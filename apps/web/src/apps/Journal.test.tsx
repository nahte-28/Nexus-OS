import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { dateKey, emptyJournal, journalStreak } from '@nexus/core'
import { journalStore } from '../journal/store'
import { Journal } from './Journal'

describe('Dagboek', () => {
  afterEach(() => {
    cleanup()
    journalStore.update(() => emptyJournal())
  })

  it('keeps a mood and a note for today, shows the streak and finds old days', () => {
    const now = Date.now()
    const yesterday = dateKey(now - 24 * 60 * 60_000)
    journalStore.update((s) => ({ ...s, entries: [{ date: yesterday, mood: 2, note: 'Examenstress', updatedAt: 1, deletedAt: null }] }))
    render(<Journal />)
    fireEvent.click(screen.getByRole('radio', { name: 'Goed' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Notitie' }), { target: { value: 'Labo was leuk' } })
    fireEvent.click(screen.getByRole('button', { name: 'Bewaren' }))
    expect(journalStore.getSnapshot().entries.find((e) => e.date === dateKey(now))).toMatchObject({ mood: 4, note: 'Labo was leuk', deletedAt: null })
    expect(screen.getByRole('radio', { name: 'Goed' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('2 dagen op rij geschreven')).toBeTruthy()
    expect(journalStreak(journalStore.getSnapshot(), now)).toBe(2)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Zoek in je dagboek' }), { target: { value: 'stress' } })
    fireEvent.click(screen.getByText('Examenstress'))
    expect((screen.getByRole('textbox', { name: 'Notitie' }) as HTMLTextAreaElement).value).toBe('Examenstress')
    expect(screen.getByRole('radio', { name: 'Matig' }).getAttribute('aria-checked')).toBe('true')

    // Clearing the mood and the note removes the day.
    fireEvent.click(screen.getByRole('radio', { name: 'Matig' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Notitie' }), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Bewaren' }))
    expect(journalStore.getSnapshot().entries.find((e) => e.date === yesterday)?.deletedAt).not.toBeNull()
  })
})
