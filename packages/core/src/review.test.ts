import { describe, expect, it } from 'vitest'
import type { Appointment, Deadline } from './life'
import { isoWeek, mondayOf, reviewedWeek, reviewKey, reviewMoment, reviewNoteTitle, weekFacts } from './review'
import { STUDY_BLOCK_NOTE } from './study'

const at = (day: number, h = 12, m = 0) => new Date(2026, 10, day, h, m).getTime()
const deadline = (over: Partial<Deadline>): Deadline => ({
  kind: 'deadline', id: 'd', title: 'Verslag', dueAt: at(4, 23, 59), projectId: null, notes: '', doneAt: null, remind: [], target: 'phone', updatedAt: 1, deletedAt: null, ...over,
})
const appointment = (over: Partial<Appointment>): Appointment => ({
  kind: 'appointment', id: 'a', title: 'Tandarts', startAt: at(5, 16), endAt: at(5, 17), location: '', notes: '', remind: [], target: 'phone', updatedAt: 1, deletedAt: null, ...over,
})

describe('Weekoverzicht', () => {
  it('knows which week a review is about and when to make it', () => {
    // Sunday 8 November 2026, 19:30: the week of Monday 2 November.
    expect(reviewKey(reviewedWeek(at(8, 19, 30)))).toBe('2026-11-02')
    // Monday 9 November, 10:00: still that week (catch-up).
    expect(reviewKey(reviewedWeek(at(9, 10)))).toBe('2026-11-02')
    expect(reviewKey(mondayOf(at(8, 12)))).toBe('2026-11-02')
    expect(isoWeek(at(2))).toBe(45)
    expect(reviewNoteTitle(mondayOf(at(2)))).toBe('Weekoverzicht week 45')
    expect([at(8, 18, 59), at(8, 19), at(9, 11, 59), at(9, 12)].map(reviewMoment)).toEqual([false, true, true, false])
  })

  it('sums up the week and lists what is coming', () => {
    const facts = weekFacts({
      now: at(8, 19, 30),
      items: [
        deadline({ id: 'd1', title: 'Labo 3', dueAt: at(4, 23, 59), doneAt: at(4, 20) }),
        deadline({ id: 'd2', title: 'Taak wiskunde', dueAt: at(6, 23, 59) }),
        deadline({ id: 'd3', title: 'Project', dueAt: at(12, 23, 59) }),
        deadline({ id: 'd4', title: 'Examen', dueAt: at(25, 9) }),
        appointment({}),
        appointment({ id: 'b', title: 'Studeren: Project', startAt: at(10, 18), endAt: at(10, 19), notes: STUDY_BLOCK_NOTE }),
      ],
      calendarEvents: [],
      timetable: [{ id: 'l', day: 2, start: '08:30', end: '10:30', subject: 'Wiskunde' }],
      reminders: [],
      habits: { habits: [], revision: 0 },
      grades: { courses: [], revision: 0 },
      focus: [{ at: at(3, 20), minutes: 50 }, { at: at(5, 20), minutes: 25 }, { at: at(10, 20), minutes: 25 }],
    })
    expect(facts).toContain('- Lessen: 1')
    expect(facts).toContain('Focustijd met de Studie-timer: 1 u 15 min')
    expect(facts).toMatch(/Deadlines afgewerkt:\n- Labo 3\n/)
    expect(facts).toMatch(/Deadlines voorbij en nog open:\n- Taak wiskunde/)
    expect(facts).toMatch(/Afspraken:\n- Tandarts\n/)
    expect(facts).toMatch(/dinsdag 10 nov\.?: 1 les \(08:30–10:30\)/)
    expect(facts).toMatch(/Open deadlines tot het einde van volgende week:\n- Project, tegen/)
    expect(facts).toMatch(/Deadlines in de twee weken daarna:\n- Examen/)
    expect(facts).toContain('- Al geplande studieblokken: 1')
  })
})
