import { describe, expect, it } from 'vitest'
import { nextExamNeed, type Course } from './grades'

const course = (parts: Course['parts'], target = 10): Course => ({ id: 'c', name: 'Wiskunde', credits: 6, target, parts, updatedAt: 1, deletedAt: null })
const part = (id: string, weight: number, score: number | null, max = 20) => ({ id, name: id, weight, score, max })

describe('nextExamNeed', () => {
  it('works out the next exam with two practice exams of 15 %', () => {
    const c = course([part('oef1', 15, 12), part('oef2', 15, null), part('examen', 70, null)])
    // Rest at 12/20: (1000 − 15·12 − 15·12) / 70 = 9,14 → rounded up to 9,2.
    expect(nextExamNeed(c, 'examen', 12)).toEqual({ needed: 9.2, neededRaw: 9.2, minimum: 7.5, status: 'open' })
    // The practice exam itself, with the final exam expected at 10/20.
    expect(nextExamNeed(c, 'oef2', 10)?.needed).toBe(8)
  })

  it('answers in the scale of the exam and spots safe and impossible', () => {
    const c = course([part('oef', 20, 18), part('examen', 80, null, 50)])
    expect(nextExamNeed(c, 'examen', 0)).toMatchObject({ needed: 8, neededRaw: 20, status: 'open' })
    expect(nextExamNeed(course([part('a', 60, 20), part('b', 40, null)], 8), 'b', 0)?.status).toBe('safe')
    expect(nextExamNeed(course([part('a', 60, 0), part('b', 40, null)]), 'b', 0)?.status).toBe('impossible')
    expect(nextExamNeed(c, 'oef', 10)).toBeNull()
  })
})
