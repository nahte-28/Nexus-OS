import { describe, expect, it } from 'vitest'
import { guessCaptureKind, parseCapture, sharedText } from './capture'

// Tuesday 27 October 2026, 11:00.
const now = new Date(2026, 9, 27, 11, 0).getTime()
const when = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi).getTime()

describe('Snelle notitie', () => {
  it('keeps a note as it is', () => {
    expect(parseCapture('Idee voor project\nmet een sensor', 'note', now)).toEqual({ kind: 'note', title: 'Idee voor project', body: 'met een sensor', at: null, found: false })
  })

  it('finds Dutch days and times', () => {
    expect(parseCapture('Verslag labo 3 tegen vrijdag', 'deadline', now)).toMatchObject({ title: 'Verslag labo 3', at: when(2026, 10, 30, 23, 59), found: true })
    expect(parseCapture('Mama bellen morgen om 14u', 'reminder', now)).toMatchObject({ title: 'Mama bellen', at: when(2026, 10, 28, 14, 0) })
    expect(parseCapture('Tandarts 3/11 9:30', 'reminder', now)).toMatchObject({ title: 'Tandarts', at: when(2026, 11, 3, 9, 30) })
    expect(parseCapture('Oefeningen overmorgen 16u30', 'reminder', now)).toMatchObject({ title: 'Oefeningen', at: when(2026, 10, 29, 16, 30) })
    expect(parseCapture('Was ophangen vanavond', 'reminder', now)).toMatchObject({ title: 'Was ophangen', at: when(2026, 10, 27, 19, 0) })
    // Tuesday on a Tuesday is next week, unless the time is still ahead today.
    expect(parseCapture('Sporten dinsdag', 'reminder', now).at).toBe(when(2026, 11, 3, 9, 0))
    expect(parseCapture('Sporten dinsdag om 18u', 'reminder', now).at).toBe(when(2026, 10, 27, 18, 0))
    expect(parseCapture('Presentatie volgende maandag', 'deadline', now).at).toBe(when(2026, 11, 9, 23, 59))
    // A date that already passed this year is next year's.
    expect(parseCapture('Inschrijven 15/9', 'deadline', now).at).toBe(when(2027, 9, 15, 23, 59))
  })

  it('uses a default moment when the text has none', () => {
    expect(parseCapture('Boek terugbrengen', 'deadline', now)).toMatchObject({ at: when(2026, 10, 28, 23, 59), found: false })
    expect(parseCapture('Boek terugbrengen', 'reminder', now)).toMatchObject({ at: now + 60 * 60_000, found: false })
    expect(parseCapture('Bellen om 9u', 'reminder', now).at).toBe(when(2026, 10, 28, 9, 0))
  })

  it('guesses the kind and reads shared text', () => {
    expect(guessCaptureKind('Verslag indienen vrijdag', now)).toBe('deadline')
    expect(guessCaptureKind('Bellen morgen om 10u', now)).toBe('reminder')
    expect(guessCaptureKind('Zo zou het kunnen werken', now)).toBe('note')
    expect(sharedText(new URLSearchParams({ title: 'Artikel', text: 'https://a.be', url: 'https://a.be' }))).toBe('Artikel\nhttps://a.be')
  })
})
