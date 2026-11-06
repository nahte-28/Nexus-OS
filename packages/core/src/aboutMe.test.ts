import { describe, expect, it } from 'vitest'
import { applyRole, defaultProfilesState, mergeFirstSync, needsAbout, parseProfilesState, setAbout } from './profiles'

describe('about you and the School or Werk profile', () => {
  it('turns School into Werk without school apps, and back', () => {
    const start = defaultProfilesState()
    expect(needsAbout(start)).toBe(true)
    const work = applyRole(start, 'work')
    expect(work.profiles.school.name).toBe('Werk')
    expect(work.profiles.school.apps).not.toContain('klashub')
    expect(work.profiles.personal.apps).not.toContain('study')
    expect(work.profiles.personal.apps).toContain('finance')
    expect(work.profiles.school.widgets).not.toContain('next_class')
    expect(needsAbout(work)).toBe(false)
    const back = applyRole(work, 'student')
    expect(back.profiles.school.name).toBe('School')
    expect(back.profiles.school.apps).toContain('klashub')
    expect(back.profiles.personal.apps).toEqual(expect.arrayContaining(['study', 'grades', 'flashcards', 'klashub']))
  })

  it('keeps what you typed, trimmed, and survives parsing and a first sync', () => {
    let s = setAbout(applyRole(defaultProfilesState(), 'other'), { name: '  Jan ', place: 'Thuis', birthday: '1958-04-02' })
    expect(s.about).toEqual({ name: 'Jan', role: 'other', place: 'Thuis', birthday: '1958-04-02' })
    s = setAbout(s, { birthday: 'gisteren' })
    expect(s.about.birthday).toBe('')
    expect(parseProfilesState(JSON.parse(JSON.stringify(s))).about.name).toBe('Jan')
    expect(parseProfilesState({}).about).toEqual({ name: '', role: null, place: '', birthday: '' })
    const fresh = { ...defaultProfilesState(), revision: 5 }
    expect(mergeFirstSync({ ...s, revision: 1 }, fresh).about.name).toBe('Jan')
  })
})
