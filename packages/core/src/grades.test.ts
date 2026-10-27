import { describe, expect, it } from 'vitest'
import { courseResult, formatMark, gradesOverview, mergeGrades, parseGradesState, type Course } from './grades'

const course = (over: Partial<Course> = {}): Course => ({
  id: 'c1',
  name: 'Elektronica',
  credits: 6,
  target: 10,
  parts: [
    { id: 'e', name: 'Examen', weight: 70, score: null, max: 20 },
    { id: 'l', name: 'Labo', weight: 30, score: 16, max: 20 },
  ],
  updatedAt: 1,
  deletedAt: null,
  ...over,
})

describe('Cijfers', () => {
  it('gives the mark so far and what the exam still needs', () => {
    // 30 % labo at 16/20 = 4,8 of the 10 points; the exam (70 %) needs 5,2/0,7 = 7,4/20.
    expect(courseResult(course())).toEqual({ score: 16, graded: 30, totalWeight: 100, needed: 7.4, status: 'open' })
    expect(courseResult(course({ target: 16 })).needed).toBe(16)
    expect(courseResult(course({ target: 20, parts: [{ id: 'l', name: 'Labo', weight: 50, score: 5, max: 20 }, { id: 'e', name: 'Examen', weight: 50, score: null, max: 20 }] })).status).toBe('impossible')
    expect(courseResult(course({ target: 4 })).status).toBe('safe')
  })

  it('reads marks out of another maximum and decides passed or failed', () => {
    const done = course({ parts: [{ id: 'e', name: 'Examen', weight: 70, score: 9, max: 20 }, { id: 'l', name: 'Labo', weight: 30, score: 45, max: 50 }] })
    // 0,7 × 9 + 0,3 × 18 = 11,7
    expect(courseResult(done)).toMatchObject({ score: 11.7, graded: 100, needed: null, status: 'passed' })
    expect(courseResult(course({ parts: [{ id: 'e', name: 'Examen', weight: 100, score: 8, max: 20 }] })).status).toBe('failed')
    expect(courseResult(course({ parts: [] })).status).toBe('empty')
  })

  it('averages over studiepunten and counts earned ones', () => {
    const passed = course({ id: 'a', credits: 6, parts: [{ id: 'x', name: 'Examen', weight: 100, score: 14, max: 20 }] })
    const failed = course({ id: 'b', credits: 3, parts: [{ id: 'x', name: 'Examen', weight: 100, score: 8, max: 20 }] })
    const open = course({ id: 'c', credits: 4, parts: [{ id: 'x', name: 'Examen', weight: 100, score: null, max: 20 }] })
    const gone = course({ id: 'd', credits: 9, deletedAt: 5, parts: [{ id: 'x', name: 'Examen', weight: 100, score: 20, max: 20 }] })
    // (14 × 6 + 8 × 3) / 9 = 12
    expect(gradesOverview({ courses: [passed, failed, open, gone], revision: 1 })).toEqual({ average: 12, earned: 6, credits: 13 })
    expect(formatMark(13.5)).toBe('13,5/20')
  })

  it('repairs stored copies and merges two devices course by course', () => {
    const repaired = parseGradesState({ courses: [{ ...course(), target: 30, parts: [{ id: 'x', name: 'Examen', weight: 50, score: 25, max: 20 }, { id: 'y', name: 'Fout', weight: 0 }] }, { name: 'zonder id' }], revision: 2 })
    expect(repaired.courses).toHaveLength(1)
    expect(repaired.courses[0]).toMatchObject({ target: 10, parts: [{ id: 'x', score: null }] })

    const pc = { courses: [course({ name: 'Elektronica (pc)', updatedAt: 5 }), course({ id: 'c2', updatedAt: 1 })], revision: 4 }
    const phone = { courses: [course({ name: 'Elektronica (gsm)', updatedAt: 3 }), course({ id: 'c2', deletedAt: 7, updatedAt: 7 }), course({ id: 'c3' })], revision: 6 }
    const merged = mergeGrades(pc, phone)
    expect(merged.revision).toBe(6)
    expect(merged.courses.map((c) => [c.id, c.name, c.deletedAt])).toEqual([
      ['c1', 'Elektronica (pc)', null],
      ['c2', 'Elektronica', 7],
      ['c3', 'Elektronica', null],
    ])
  })
})
