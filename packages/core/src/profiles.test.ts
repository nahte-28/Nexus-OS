import { describe, expect, it } from 'vitest'
import {
  klashubLink,
  activeProfile,
  chooseProfile,
  defaultProfilesState,
  isWindowOpen,
  mergeFirstSync,
  moveItem,
  notificationPopsUp,
  newerState,
  nextLesson,
  parseProfilesState,
  profileApps,
  type ProfilesState,
} from './profiles'

const ZONE = 'Europe/Brussels'
/** Brussels wall-clock time on a given date (October 2026 is summer time, UTC+2). */
const at = (iso: string) => new Date(iso).getTime()
const state = (): ProfilesState => {
  const s = defaultProfilesState()
  s.schedule.timeZone = ZONE
  return s
}

describe('profile schedule', () => {
  // 2026-10-20 is a Tuesday.
  it('switches to School Mode at 08:30, not at 08:29', () => {
    expect(activeProfile(state(), at('2026-10-20T08:29:00+02:00'))).toEqual({ id: 'personal', reason: 'default' })
    expect(activeProfile(state(), at('2026-10-20T08:30:00+02:00'))).toEqual({ id: 'school', reason: 'schedule' })
  })

  it('switches back at 18:00 and stays off at the weekend', () => {
    expect(activeProfile(state(), at('2026-10-20T17:59:00+02:00')).id).toBe('school')
    expect(activeProfile(state(), at('2026-10-20T18:00:00+02:00')).id).toBe('personal')
    expect(activeProfile(state(), at('2026-10-24T10:00:00+02:00')).id).toBe('personal') // Saturday
  })

  it('works out the right profile when NEXUS reopens mid-morning', () => {
    expect(activeProfile(state(), at('2026-10-21T11:00:00+02:00')).id).toBe('school')
  })

  it('keeps the wall-clock times across the switch to winter time', () => {
    // 2026-10-26 (Monday) is after the change to UTC+1.
    expect(activeProfile(state(), at('2026-10-26T08:30:00+01:00')).id).toBe('school')
    expect(activeProfile(state(), at('2026-10-26T08:29:00+01:00')).id).toBe('personal')
  })

  it('handles windows that run past midnight', () => {
    const s = state()
    s.schedule = { ...s.schedule, days: [5], start: '22:00', end: '06:00' }
    expect(isWindowOpen(s.schedule, at('2026-10-23T23:00:00+02:00'))).toBe(true) // Friday night
    expect(isWindowOpen(s.schedule, at('2026-10-24T05:59:00+02:00'))).toBe(true) // Saturday early
    expect(isWindowOpen(s.schedule, at('2026-10-24T06:00:00+02:00'))).toBe(false)
  })

  it('does nothing when automation is off', () => {
    const s = state()
    s.schedule.enabled = false
    expect(activeProfile(s, at('2026-10-20T10:00:00+02:00')).id).toBe('personal')
  })
})

describe('manual override', () => {
  it('keeps a manual Gaming Mode until the schedule window closes', () => {
    const s = chooseProfile(state(), 'gaming', at('2026-10-20T09:00:00+02:00'))
    expect(activeProfile(s, at('2026-10-20T12:00:00+02:00'))).toEqual({ id: 'gaming', reason: 'override' })
    expect(activeProfile(s, at('2026-10-20T18:00:00+02:00'))).toEqual({ id: 'personal', reason: 'default' })
  })

  it('keeps an "until I switch back" choice across schedule changes', () => {
    const s = chooseProfile(state(), 'developer', at('2026-10-20T07:00:00+02:00'), 'until-manual')
    expect(activeProfile(s, at('2026-10-20T10:00:00+02:00')).id).toBe('developer')
    expect(activeProfile(s, at('2026-10-21T20:00:00+02:00')).id).toBe('developer')
  })

  it('clears the override when you pick what the schedule would pick', () => {
    const t = at('2026-10-20T10:00:00+02:00')
    const gaming = chooseProfile(state(), 'gaming', t)
    const back = chooseProfile(gaming, 'school', t)
    expect(back.override).toBeNull()
    expect(back.revision).toBe(2)
  })
})

describe('sync and storage', () => {
  it('keeps the copy with the higher revision', () => {
    const a = { ...state(), revision: 3 }
    const b = { ...state(), revision: 5, defaultProfile: 'gaming' as const }
    expect(newerState(a, b)).toBe(b)
    expect(newerState(b, a)).toBe(b)
  })

  it('repairs broken or old stored data', () => {
    expect(parseProfilesState(null).defaultProfile).toBe('personal')
    const parsed = parseProfilesState({ schedule: { start: 'nope' }, defaultProfile: 'x', override: { profile: 'y' } })
    expect(parsed.schedule.start).toBe('08:30')
    expect(parsed.defaultProfile).toBe('personal')
    expect(parsed.override).toBeNull()
  })

  it('always shows Profiles and Settings', () => {
    const apps = profileApps({ ...state().profiles.gaming, apps: [] })
    expect(apps).toEqual(['profiles', 'settings'])
  })
})

describe('next lesson', () => {
  const lessons = [
    { id: '1', day: 2, start: '09:45', end: '10:35', subject: 'Networking' },
    { id: '2', day: 2, start: '13:00', end: '13:50', subject: 'Wiskunde' },
    { id: '3', day: 4, start: '08:30', end: '09:20', subject: 'Engels' },
  ]

  it('finds the next lesson today, then on later days', () => {
    expect(nextLesson(lessons, at('2026-10-20T08:00:00+02:00'), ZONE)?.lesson.subject).toBe('Networking')
    expect(nextLesson(lessons, at('2026-10-20T10:00:00+02:00'), ZONE)?.lesson.subject).toBe('Networking') // still running
    expect(nextLesson(lessons, at('2026-10-20T11:00:00+02:00'), ZONE)?.lesson.subject).toBe('Wiskunde')
    expect(nextLesson(lessons, at('2026-10-20T15:00:00+02:00'), ZONE)).toMatchObject({ lesson: { subject: 'Engels' }, inDays: 2 })
    expect(nextLesson([], at('2026-10-20T15:00:00+02:00'), ZONE)).toBeNull()
  })

  it('never opens a calendar link as KlasHub', () => {
    expect(klashubLink(' https://klashub.vercel.app ')).toBe('https://klashub.vercel.app/')
    expect(klashubLink('https://apih.ap.be/ical/abc.ics')).toBeNull()
    expect(klashubLink('https://example.com/rooster.ics')).toBeNull()
    expect(klashubLink('webcal://apih.ap.be/x')).toBeNull()
    expect(klashubLink('http://klashub.vercel.app')).toBeNull()
    const s = parseProfilesState({ klashubUrl: 'https://apih.ap.be/ical/abc.ics' })
    expect(s.klashubUrl).toBe('https://klashub.vercel.app')
  })

  it('adds KlasHub to copies stored before it existed', () => {
    const old = { profiles: { school: { apps: ['notes', 'reminders'] }, gaming: { apps: ['notes'] } }, revision: 3 }
    const s = parseProfilesState(old)
    expect(s.profiles.school.apps).toEqual(['klashub', 'agenda', 'study', 'grades', 'habits', 'flashcards', 'files', 'notes', 'reminders'])
    expect(s.profiles.gaming.apps).toEqual(['notes'])
    expect(s.klashubUrl).toBe('https://klashub.vercel.app')
    // Once upgraded, removing it sticks.
    const removed = parseProfilesState({ ...s, profiles: { ...s.profiles, school: { ...s.profiles.school, apps: ['notes'] } } })
    expect(removed.profiles.school.apps).toEqual(['notes'])
  })

  it('adds the Agenda app to copies stored before NEXUS Life, once', () => {
    const old = { schema: 2, profiles: { school: { apps: ['klashub', 'notes'] }, personal: { apps: ['notes'] }, gaming: { apps: ['notes'] } } }
    const s = parseProfilesState(old)
    expect(s.profiles.school.apps).toEqual(['klashub', 'agenda', 'study', 'grades', 'habits', 'flashcards', 'files', 'notes'])
    expect(s.profiles.personal.apps).toEqual(['agenda', 'study', 'grades', 'habits', 'flashcards', 'files', 'notes'])
    expect(s.profiles.gaming.apps).toEqual(['notes'])
    const removed = parseProfilesState({ ...s, profiles: { ...s.profiles, personal: { ...s.profiles.personal, apps: ['notes'] } } })
    expect(removed.profiles.personal.apps).toEqual(['notes'])
  })

  it('adds Studie after the Agenda in copies stored before it, once', () => {
    const s = parseProfilesState({ schema: 4, profiles: { school: { apps: ['klashub', 'agenda', 'notes'] }, personal: { apps: ['notes'] }, gaming: { apps: ['notes'] } } })
    expect(s.profiles.school.apps).toEqual(['klashub', 'agenda', 'study', 'grades', 'habits', 'flashcards', 'notes'])
    expect(s.profiles.personal.apps).toEqual(['study', 'grades', 'habits', 'flashcards', 'notes'])
    expect(s.profiles.gaming.apps).toEqual(['notes'])
    expect(parseProfilesState({ ...s, profiles: { ...s.profiles, school: { ...s.profiles.school, apps: ['notes'] } } }).profiles.school.apps).toEqual(['notes'])
  })

  it('keeps a calendar link from either side on the first sync of a device', () => {
    const browser = { ...defaultProfilesState(), calendarUrl: 'https://apih.ap.be/x.ics', revision: 4 }
    const phone = { ...defaultProfilesState(), defaultProfile: 'gaming' as const, revision: 9 }
    const merged = mergeFirstSync(phone, browser)
    expect(merged).toMatchObject({ defaultProfile: 'gaming', calendarUrl: 'https://apih.ap.be/x.ics', revision: 10 })
    // Nothing to add: the account copy stays as it is, so the device just adopts it.
    expect(mergeFirstSync({ ...defaultProfilesState(), revision: 1 }, browser)).toBe(browser)
  })

  it('returns to the profile picked before school, not the default', () => {
    // Monday 07:30: Gaming by hand, before the window opens.
    let s = chooseProfile(state(), 'gaming', at('2026-10-19T07:30:00+02:00'))
    expect(s.override).toBeNull()
    expect(activeProfile(s, at('2026-10-19T07:45:00+02:00'))).toEqual({ id: 'gaming', reason: 'return' })
    expect(activeProfile(s, at('2026-10-19T09:00:00+02:00')).id).toBe('school')
    expect(activeProfile(s, at('2026-10-19T18:00:00+02:00'))).toEqual({ id: 'gaming', reason: 'return' })
    // Picking the default again forgets it.
    s = chooseProfile(s, 'personal', at('2026-10-19T19:00:00+02:00'))
    expect(s.returnProfile).toBeNull()
    expect(activeProfile(s, at('2026-10-19T19:00:00+02:00'))).toEqual({ id: 'personal', reason: 'default' })
  })

  it('ends a timed choice at its end time', () => {
    const until = at('2026-10-19T10:00:00+02:00')
    const s = chooseProfile(state(), 'gaming', at('2026-10-19T09:00:00+02:00'), 'until-time', until)
    expect(activeProfile(s, at('2026-10-19T09:59:00+02:00'))).toEqual({ id: 'gaming', reason: 'override' })
    expect(activeProfile(s, until).id).toBe('school')
    expect(parseProfilesState(JSON.parse(JSON.stringify(s))).override).toMatchObject({ mode: 'until-time', until })
  })

  it('lets chosen apps through while quiet', () => {
    const school = { ...defaultProfilesState().profiles.school, allowApps: ['Smartschool'] }
    expect(notificationPopsUp(school, 'smartschool ')).toBe(true)
    expect(notificationPopsUp(school, 'WhatsApp')).toBe(false)
    expect(notificationPopsUp(defaultProfilesState().profiles.personal, 'WhatsApp')).toBe(true)
  })

  it('moves an app up or down', () => {
    expect(moveItem(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b'])
    expect(moveItem(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c'])
  })
})
