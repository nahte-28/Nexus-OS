import { describe, expect, it } from 'vitest'
import { addVisit, newMatch, parseDarts, undoVisit, type DartsMatch } from './darts'
import { dartValue, highFinishes, judgeProof, parsePhotoReading, photoVisit, withoutProof, withProof } from './dartsPhoto'

const ok = (m: DartsMatch | { error: string }): DartsMatch => {
  if ('error' in m) throw new Error(m.error)
  return m
}

/** Ethan finishes 121 in a 301 leg, Remo is on 241. */
function finished121(): DartsMatch {
  let m = ok(newMatch('p', ['Ethan', 'Remo'], { mode: 301, legsToWin: 2, doubleOut: true }, 0))
  m = ok(addVisit(m, 180, 1))
  m = ok(addVisit(m, 60, 1))
  return ok(addVisit(m, 121, 2, 3))
}

describe('checkout proof', () => {
  it('knows the high finishes, not those of the bot', () => {
    const m = finished121()
    expect(highFinishes(m)).toEqual([{ leg: 0, side: 0, finish: 121, darts: 3 }])
    expect(highFinishes({ ...m, bot: { side: 0, level: 'pro' } })).toEqual([])
  })

  it('reads the answer of NEXUS AI and judges it', () => {
    expect(dartValue('T20')).toBe(60)
    expect(dartValue('D14')).toBe(28)
    expect(dartValue('Bull')).toBe(50)
    expect(dartValue('T25')).toBeNull()
    const reading = parsePhotoReading('Hier: {"darts": ["t20", "S11", "d25"], "note": "Duidelijk"}')
    expect(reading).toEqual({ darts: ['T20', '11', 'Bull'], note: 'Duidelijk' })
    expect(judgeProof(reading!, 121, 3)).toBe('ok')
    expect(judgeProof({ darts: ['T20', 'T11', 'D14'], note: '' }, 121, 3)).toBe('ok')
    expect(judgeProof({ darts: ['T20', 'T20', '1'], note: '' }, 121, 3)).toBe('nok') // ends on a single
    expect(judgeProof({ darts: ['T20', 'T20', 'D1'], note: '' }, 121, 3)).toBe('nok') // 122
    expect(judgeProof({ darts: ['T20', 'T11', 'D14'], note: '' }, 121, 2)).toBe('nok') // three darts, two noted
    expect(judgeProof({ darts: [], note: 'Geen pijlen te zien' }, 121, 3)).toBe('unclear')
  })

  it('counts the visit on a photo', () => {
    expect(photoVisit({ darts: ['T20', '5', 'T20'], note: '' })).toEqual({ total: 125, darts: 3 })
    expect(photoVisit({ darts: ['T20', 'D20', 'Mis'], note: '' })).toEqual({ total: 100, darts: 2 })
    expect(photoVisit({ darts: [], note: '' })).toEqual({ total: 0, darts: 1 })
  })

  it('keeps the proof with the match, through a sync, and drops it on undo', () => {
    let m = withProof(finished121(), { leg: 0, at: 5, verdict: 'ok', darts: ['T20', 'T11', 'D14'] }, 5)
    const synced = parseDarts({ matches: [m] }).matches[0]
    expect(synced.proofs).toEqual([{ leg: 0, at: 5, verdict: 'ok', darts: ['T20', 'T11', 'D14'] }])
    expect(parseDarts({ matches: [{ ...m, proofs: [{ leg: 9, at: 1, verdict: 'ok' }] }] }).matches[0].proofs).toBeUndefined()
    expect(withoutProof(m, 0, 6).proofs).toBeUndefined()
    m = undoVisit(m, 7)
    expect(m.proofs).toBeUndefined()
  })
})
