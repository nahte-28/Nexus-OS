import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Dashboard } from './Dashboard'
import { profilesStore } from './store'

const active = () => profilesStore.getSnapshot().active

describe('Workspace Studio 2.0 dashboard', () => {
  afterEach(cleanup)

  it('resizes, moves, hides and adds widgets, and shows a phone preview', () => {
    const id = active().id
    profilesStore.updateProfile(id, { widgets: ['deadlines', 'notes', 'devices'], layout: {} })
    render(<Dashboard onOpenApp={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Indeling aanpassen' }))

    fireEvent.click(screen.getByRole('button', { name: 'Notities breder' }))
    fireEvent.click(screen.getByRole('button', { name: 'Notities hoger' }))
    expect(active().layout).toEqual({ notes: { w: 2, h: 2 } })

    fireEvent.click(screen.getByRole('button', { name: 'Apparaten naar voren' }))
    expect(active().widgets).toEqual(['deadlines', 'devices', 'notes'])

    fireEvent.click(screen.getByRole('button', { name: 'Apparaten verbergen' }))
    expect(active().widgets).toEqual(['deadlines', 'notes'])
    fireEvent.click(screen.getByRole('button', { name: '+ Apparaten' }))
    expect(active().widgets).toEqual(['deadlines', 'notes', 'devices'])

    fireEvent.click(screen.getByRole('radio', { name: 'Gsm' }))
    const phone = screen.getByLabelText('Voorbeeld op de gsm')
    const items = within(phone).getAllByRole('listitem').filter((li) => li.parentElement?.getAttribute('aria-label') === 'Widgets')
    // On the phone everything is one column wide; the height stays.
    expect(items.every((li) => li.style.gridColumn === 'span 1')).toBe(true)
    expect(items.some((li) => li.style.gridRow === 'span 2')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Klaar' }))
    expect(screen.queryByLabelText('Voorbeeld op de gsm')).toBeNull()
  })
})
