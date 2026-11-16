import { describe, expect, it } from 'vitest'
import { blockStart, blockSummary, daySlots, DEFAULT_BLOCK, parseBlockSettings, planExamBlock, type BlockSettings } from './examBlock'
import { mergeExams, parseExamsState, type Exam } from './exams'

// Monday 4 January 2027, noon.
const now = new Date(2027, 0, 4, 12).getTime()
const day = (d: number) => new Date(2027, 0, d).getTime()
const at = (d: number, h: number, m = 0) => new Date(2027, 0, d, h, m).getTime()
const exam = (id: string, d: number, hours: number, course = id): Exam => ({ id, course, at: at(d, 9), minutes: 120, location: '', studyHours: hours, deckId: null, appointmentId: null, createdAt: 1, updatedAt: 1, deletedAt: null })
const settings = (patch: Partial<BlockSettings> = {}): BlockSettings => ({ ...DEFAULT_BLOCK, ...patch })

describe('examBlock', () => {
  it('cuts a day into blocks with breaks, around lunch and what is busy', () => {
    const slots = daySlots(day(5), settings(), [{ start: at(5, 15), end: at(5, 16) }])
    expect(slots.map((s) => [new Date(s.start).toTimeString().slice(0, 5), new Date(s.end).toTimeString().slice(0, 5)])).toEqual([
      ['09:00', '10:30'],
      ['10:45', '12:15'],
      ['13:30', '15:00'],
      ['16:00', '17:30'],
    ])
    expect(daySlots(day(5), settings({ lunch: false, from: '09:00', to: '11:00', blockMinutes: 60 }), [])).toHaveLength(2)
  })

  it('studies the first exam first, keeps the day before each exam for herhaling and skips rest days', () => {
    const a = exam('a', 7, 7, 'Wiskunde')
    const b = exam('b', 11, 3, 'Elektronica')
    // Saturday 9 January is a rest day.
    const plan = planExamBlock([b, a], {}, [], settings({ restDays: [6] }), now)
    const kinds = plan.days.map((d) => [new Date(d.day).getDate(), d.kind])
    expect(kinds).toEqual([[5, 'study'], [6, 'study'], [7, 'exam'], [8, 'study'], [9, 'rest'], [10, 'study'], [11, 'exam']])
    const on = (d: number) => plan.days.find((x) => x.day === day(d))!
    // 5 Jan: Wiskunde; 6 Jan (day before): herhaling Wiskunde.
    expect(on(5).blocks.every((s) => s.course === 'Wiskunde' && s.kind === 'study')).toBe(true)
    expect(on(6).blocks.every((s) => s.course === 'Wiskunde' && s.kind === 'review')).toBe(true)
    // Elektronica needs 3 hours: two blocks on 8 Jan, the rest of that day is spare; 10 Jan is herhaling.
    expect(on(8).blocks.map((s) => s.course)).toEqual(['Elektronica', 'Elektronica'])
    expect(on(8).spare).toBe(240)
    expect(on(10).blocks.every((s) => s.kind === 'review' && s.course === 'Elektronica')).toBe(true)
    expect(plan.short).toEqual([])
    expect(blockSummary(plan)).toBe('4 studiedagen, 24 uur studeren tot je laatste examen.')
  })

  it('says what does not fit and uses the needs it gets', () => {
    const plan = planExamBlock([exam('a', 6, 50)], { a: 12 * 60 }, [], settings({ review: false }), now)
    expect(plan.perExam.a).toBe(420)
    expect(plan.short).toEqual([{ examId: 'a', course: 'a', minutes: 300 }])
    expect(planExamBlock([], {}, [], settings(), now)).toEqual({ days: [], short: [], perExam: {} })
  })

  it('starts tomorrow at the earliest', () => {
    expect(blockStart(settings({ start: '2026-12-01' }), now)).toBe(day(5))
    expect(blockStart(settings({ start: '2027-01-08' }), now)).toBe(day(8))
  })

  it('parses settings safely and merges them with the exams', () => {
    expect(parseBlockSettings({ from: '25:00', to: '08:00', blockMinutes: 7, restDays: [7, 7, 9, 1], start: 'gisteren' })).toEqual({ ...DEFAULT_BLOCK, restDays: [1, 7] })
    const a = parseExamsState({ exams: [], block: { from: '08:00', updatedAt: 5 } })
    const b = parseExamsState({ exams: [], block: { from: '10:00', updatedAt: 9 } })
    expect(mergeExams(a, b).block?.from).toBe('10:00')
    expect(mergeExams(b, a).block?.from).toBe('10:00')
    expect(parseExamsState({ exams: [] })).toEqual({ exams: [], revision: 0 })
  })
})
