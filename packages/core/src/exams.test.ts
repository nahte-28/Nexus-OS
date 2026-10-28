import { describe, expect, it } from 'vitest'
import { countdownLabel, emptyExams, examTasks, mergeExams, parseExamsState, studyDeadline, upcomingExams, type Exam } from './exams'

const now = new Date(2026, 10, 2, 12).getTime()
const exam = (id: string, at: number, patch: Partial<Exam> = {}): Exam => ({ id, course: 'Elektronica 1', at, minutes: 120, location: '', studyHours: 10, deckId: null, appointmentId: null, createdAt: 1, updatedAt: 1, deletedAt: null, ...patch })

describe('exams', () => {
  it('lists coming exams with a countdown and turns them into study tasks', () => {
    const jan = new Date(2027, 0, 12, 9).getTime()
    const s = { ...emptyExams(), exams: [exam('b', jan), exam('a', new Date(2026, 10, 3, 9).getTime(), { course: 'Wiskunde', studyHours: 1 }), exam('old', now - 86_400_000)] }
    expect(upcomingExams(s, now).map((e) => e.id)).toEqual(['a', 'b'])
    expect(countdownLabel(new Date(2026, 10, 3, 9).getTime(), now)).toBe('morgen')
    expect(countdownLabel(jan, now)).toBe('over 71 dagen')
    // Focus time on the course counts; studying ends the evening before.
    const tasks = examTasks(s, now, [{ minutes: 90, task: 'Elektronica 1: hoofdstuk 2' }, { minutes: 60, task: 'wiskunde' }])
    expect(tasks).toEqual([{ id: 'exam:b', title: 'Elektronica 1', dueAt: studyDeadline({ at: jan }), minutes: 510 }])
  })

  it('merges copies exam by exam and drops junk', () => {
    const a = { exams: [exam('x', now, { updatedAt: 5 })], revision: 1 }
    const b = { exams: [exam('x', now, { updatedAt: 9, course: 'Wiskunde' }), exam('y', now)], revision: 2 }
    expect(mergeExams(a, b).exams.map((e) => [e.id, e.course])).toEqual([['x', 'Wiskunde'], ['y', 'Elektronica 1']])
    expect(parseExamsState({ exams: [{ id: 'z' }, exam('ok', now, { studyHours: 999 })] }).exams.map((e) => [e.id, e.studyHours])).toEqual([['ok', 200]])
  })
})
