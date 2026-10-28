import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { closeCapture, captureState, openCapture, openCaptureFromUrl } from './open'
import { QuickCapture } from './QuickCapture'
import { appendSpoken, speechError, type Recognition } from './speech'

/** A stand-in for the browser's speech recognition that the test speaks into. */
class FakeRecognition implements Recognition {
  static last: FakeRecognition | null = null
  lang = ''
  continuous = false
  interimResults = false
  started = false
  onresult: Recognition['onresult'] = null
  onerror: Recognition['onerror'] = null
  onend: Recognition['onend'] = null
  constructor() {
    FakeRecognition.last = this
  }
  start() {
    this.started = true
  }
  stop() {
    this.started = false
    this.onend?.()
  }
  say(transcript: string, isFinal: boolean) {
    this.onresult?.({ resultIndex: 0, results: [{ isFinal, 0: { transcript } }] })
  }
}

const w = window as unknown as { webkitSpeechRecognition?: typeof FakeRecognition }

describe('Spraaknotitie', () => {
  beforeEach(() => {
    closeCapture()
    FakeRecognition.last = null
    w.webkitSpeechRecognition = FakeRecognition
  })
  afterEach(() => {
    cleanup()
    delete w.webkitSpeechRecognition
  })

  it('glues spoken pieces into the text', () => {
    expect(appendSpoken('', 'mama bellen')).toBe('Mama bellen')
    expect(appendSpoken('Mama bellen', ' morgen om 14u ')).toBe('Mama bellen morgen om 14u')
    expect(appendSpoken('Lijst\n', 'melk')).toBe('Lijst\nmelk')
    expect(appendSpoken('Iets', '  ')).toBe('Iets')
    expect(speechError('not-allowed')).toMatch(/microfoon/)
  })

  it('types what you say in Dutch and still guesses the kind', () => {
    render(<QuickCapture />)
    act(() => openCapture())
    fireEvent.click(screen.getByRole('button', { name: 'Inspreken' }))
    const r = FakeRecognition.last!
    expect(r).toMatchObject({ lang: 'nl-BE', continuous: true, interimResults: true, started: true })
    expect(screen.getByRole('button', { name: 'Stoppen' }).getAttribute('aria-pressed')).toBe('true')

    act(() => r.say('mama bellen', false))
    expect(screen.getByText('mama bellen')).toBeTruthy()
    act(() => r.say('mama bellen morgen om 14u', true))
    expect((screen.getByRole('textbox', { name: 'Wat wil je bewaren?' }) as HTMLTextAreaElement).value).toBe('Mama bellen morgen om 14u')
    expect(screen.getByRole('button', { name: 'Herinnering' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Stoppen' }))
    expect(r.started).toBe(false)
    expect(screen.getByRole('button', { name: 'Inspreken' })).toBeTruthy()
  })

  it('starts listening at once from the Spraaknotitie shortcut, and says why it fails', () => {
    render(<QuickCapture />)
    history.replaceState(null, '', '/snel?spraak=1')
    act(() => void openCaptureFromUrl())
    expect(captureState.getSnapshot()).toMatchObject({ open: true, dictate: true })
    const r = FakeRecognition.last!
    expect(r.started).toBe(true)
    act(() => r.onerror?.({ error: 'not-allowed' }))
    expect(screen.getByRole('alert').textContent).toMatch(/microfoon/)
  })

  it('has no button where the browser cannot listen', () => {
    delete w.webkitSpeechRecognition
    render(<QuickCapture />)
    act(() => openCapture())
    expect(screen.queryByRole('button', { name: 'Inspreken' })).toBeNull()
  })
})
