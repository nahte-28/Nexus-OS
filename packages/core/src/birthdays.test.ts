import { describe, expect, it } from 'vitest'
import { birthdayDate, birthdayMonthDay, birthdayWhen, daysUntilBirthday, sortSystemMessages, upcomingFriendBirthdays, type SystemMessage } from './birthdays'
import { parseProfilesState, setAbout } from './profiles'

describe('verjaardagen', () => {
  it('keeps only day and month', () => {
    expect(birthdayMonthDay('2007-03-14')).toBe('03-14')
    expect(birthdayMonthDay('')).toBeNull()
    expect(birthdayMonthDay('2007-13-01')).toBeNull()
  })

  it('counts the days until the next birthday', () => {
    const now = new Date(2026, 10, 18, 15, 30)
    expect(daysUntilBirthday('11-18', now)).toBe(0)
    expect(daysUntilBirthday('11-19', now)).toBe(1)
    expect(daysUntilBirthday('11-17', now)).toBe(364)
    // 29 February is 28 February in a year without it.
    expect(daysUntilBirthday('02-29', new Date(2027, 1, 28))).toBe(0)
    expect(daysUntilBirthday('02-29', new Date(2028, 1, 28))).toBe(1)
  })

  it('sorts friends by how soon', () => {
    const now = new Date(2026, 10, 18)
    const list = upcomingFriendBirthdays(
      [
        { name: 'Remo', monthDay: '01-02' },
        { name: 'Bram', monthDay: '11-18' },
        { name: 'Fout', monthDay: '1-2' },
        { name: 'Anna', monthDay: '11-20' },
      ],
      now,
      60,
    )
    expect(list.map((b) => [b.name, b.days])).toEqual([
      ['Bram', 0],
      ['Anna', 2],
      ['Remo', 45],
    ])
  })

  it('says when in Dutch', () => {
    expect(birthdayDate('03-14')).toBe('14 maart')
    expect(birthdayWhen(0, '11-18')).toBe('Vandaag jarig 🎂')
    expect(birthdayWhen(1, '11-19')).toBe('Morgen jarig')
    expect(birthdayWhen(5, '11-23')).toBe('Over 5 dagen (23 november)')
    expect(birthdayWhen(40, '12-28')).toBe('28 december')
  })

  it('shares the birthday with friends unless you turn it off', () => {
    const state = parseProfilesState({})
    expect(state.about.shareBirthday).toBe(true)
    expect(setAbout(state, { shareBirthday: false }).about.shareBirthday).toBe(false)
  })

  it('shows unread messages from NEXUS first', () => {
    const m = (id: string, createdAt: number, readAt: number | null): SystemMessage => ({ id, kind: 'birthday', title: '', body: '', aboutUser: null, createdAt, readAt })
    expect(sortSystemMessages([m('a', 1, 5), m('b', 2, null), m('c', 3, 6)]).map((x) => x.id)).toEqual(['b', 'c', 'a'])
  })
})
