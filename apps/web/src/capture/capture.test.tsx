import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { lifeStore } from '../life/store'
import { remindersStore } from '../reminders/store'
import { notesStore } from '../state/notesStore'
import { closeCapture, captureState, openCapture, openCaptureFromUrl } from './open'
import { QuickCapture, saveCapture, useCaptureShortcut } from './QuickCapture'

// Tuesday 27 October 2026, 11:00.
const now = new Date(2026, 9, 27, 11, 0).getTime()

function Shell() {
  useCaptureShortcut()
  return <QuickCapture />
}

describe('Snelle notitie', () => {
  beforeEach(() => closeCapture())
  afterEach(cleanup)

  it('saves a note, a deadline and a reminder', async () => {
    expect(await saveCapture('Idee\nmet uitleg', 'note', null, now)).toBe('in Notities')
    expect(notesStore.getSnapshot().find((n) => n.title === 'Idee')?.body).toBe('met uitleg')

    await saveCapture('Verslag labo indienen vrijdag', 'deadline', null, now)
    expect(lifeStore.getSnapshot().find((i) => i.kind === 'deadline' && i.title === 'Verslag labo indienen')).toMatchObject({ dueAt: new Date(2026, 9, 30, 23, 59).getTime() })

    await saveCapture('Mama bellen morgen om 14u', 'reminder', null, now)
    expect(remindersStore.getSnapshot().find((r) => r.title === 'Mama bellen')?.at).toBe(new Date(2026, 9, 28, 14, 0).getTime())
    await expect(saveCapture('Te laat', 'reminder', now - 1, now)).rejects.toThrow(/verleden/)
    await expect(saveCapture('  ', 'note', null, now)).rejects.toThrow(/Typ eerst/)
  })

  it('opens on Alt+N, guesses the kind and saves', async () => {
    render(<Shell />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.keyDown(document, { code: 'KeyN', altKey: true })
    const box = screen.getByRole('textbox', { name: 'Wat wil je bewaren?' })
    fireEvent.change(box, { target: { value: 'Boodschappen morgen om 18u' } })
    expect(screen.getByRole('button', { name: 'Herinnering' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Titel: Boodschappen')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Notitie' }))
    expect(screen.queryByLabelText('Tijdstip')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Bewaren' }))
    expect(await screen.findByRole('status')).toBeTruthy()
    await waitFor(() => expect(notesStore.getSnapshot().some((n) => n.title === 'Boodschappen morgen om 18u')).toBe(true))
  })

  it('opens with shared text from the phone', () => {
    const replaced: string[] = []
    const original = history.replaceState.bind(history)
    history.replaceState = (data, unused, url) => {
      replaced.push(String(url))
      original(data, unused, '/')
    }
    try {
      expect(openCaptureFromUrl({ pathname: '/', search: '', hash: '' })).toBe(false)
      expect(openCaptureFromUrl({ pathname: '/snel', search: '?title=Artikel&text=https%3A%2F%2Fa.be', hash: '' })).toBe(true)
      expect(captureState.getSnapshot()).toEqual({ open: true, text: 'Artikel\nhttps://a.be', dictate: false })
      expect(replaced).toEqual(['/'])
    } finally {
      history.replaceState = original
    }
    act(() => openCapture('x'))
    render(<QuickCapture />)
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('x')
  })
})
