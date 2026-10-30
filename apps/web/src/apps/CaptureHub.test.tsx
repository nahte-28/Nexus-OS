import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { emptyCaptures } from '@nexus/core'
import { CaptureHub } from './CaptureHub'
import { capturesStore } from '../capture/hub'
import { closeCapture, openCapture } from '../capture/open'
import { QuickCapture } from '../capture/QuickCapture'
import { setFeature } from '../features/store'
import { notesStore } from '../state/notesStore'

describe('Snel vastleggen', () => {
  beforeEach(() => {
    setFeature('capture', true)
    capturesStore.adopt(emptyCaptures())
    closeCapture()
  })
  afterEach(() => {
    cleanup()
    setFeature('capture', false)
  })

  it('keeps a link for later and sorts it into a note', async () => {
    render(<CaptureHub />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Wat wil je bewaren?' }), { target: { value: 'Lezen voor Elektronica https://ap.be/les3' } })
    fireEvent.click(screen.getByRole('button', { name: 'In Te sorteren' }))
    expect((await screen.findByRole('status')).textContent).toBe('Bewaard in Te sorteren.')

    fireEvent.click(screen.getByRole('tab', { name: /Te sorteren/ }))
    const list = screen.getByRole('list', { name: 'Te sorteren' })
    expect(within(list).getByText('Link')).toBeTruthy()
    expect(within(list).getByRole('link', { name: 'Openen' }).getAttribute('href')).toBe('https://ap.be/les3')
    fireEvent.click(within(list).getByRole('button', { name: /naar Notitie$/ }))
    await waitFor(() => expect(screen.getByText(/Niets te sorteren/)).toBeTruthy())
    expect(notesStore.getSnapshot().some((n) => n.title === 'Lezen voor Elektronica https://ap.be/les3')).toBe(true)

    fireEvent.click(screen.getByRole('tab', { name: 'Geschiedenis' }))
    expect(within(screen.getByRole('list', { name: 'Geschiedenis' })).getAllByText('Lezen voor Elektronica https://ap.be/les3')).toHaveLength(2)
  })

  it('adds a template and offers it in Snelle notitie with Later sorteren', () => {
    render(
      <>
        <CaptureHub />
        <QuickCapture />
      </>,
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Sjablonen' }))
    const form = screen.getByRole('form', { name: 'Nieuw sjabloon' })
    fireEvent.change(within(form).getByRole('textbox', { name: 'Naam' }), { target: { value: 'Boek lezen' } })
    fireEvent.change(within(form).getByRole('textbox', { name: 'Tekst' }), { target: { value: 'Hoofdstuk lezen' } })
    fireEvent.change(within(form).getByRole('combobox', { name: 'Soort' }), { target: { value: 'later' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Toevoegen' }))
    expect(within(screen.getByRole('list', { name: 'Sjablonen' })).getByText('Boek lezen')).toBeTruthy()

    act(() => openCapture())
    const dialog = screen.getByRole('dialog', { name: 'Snelle notitie' })
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Sjabloon' }), { target: { value: capturesStore.getSnapshot().templates.find((t) => t.name === 'Boek lezen')!.id } })
    expect((within(dialog).getByRole('textbox', { name: 'Wat wil je bewaren?' }) as HTMLTextAreaElement).value).toBe('Hoofdstuk lezen')
    expect(within(dialog).getByRole('button', { name: 'Later sorteren' }).getAttribute('aria-pressed')).toBe('true')
  })
})
