/**
 * NEXUS Profiles: a profile changes the theme, the visible apps, the dashboard widgets and how
 * loud notifications are, never open work. Pure logic, no storage or clocks of its own.
 */
import type { ThemeId } from './theme'
import type { AppId } from './windows'

export type ProfileId = 'school' | 'personal' | 'gaming' | 'developer'
export type WidgetId = 'next_class' | 'deadlines' | 'notes' | 'ai_study' | 'klashub' | 'devices' | 'notifications'

export interface Profile {
  id: ProfileId
  name: string
  description: string
  theme: ThemeId
  /** Apps shown in the sidebar, menus and app grid, in this order. Settings and Profiles always show. */
  apps: AppId[]
  widgets: WidgetId[]
  /** Only important NEXUS notifications pop up; the rest still lands in Meldingen. */
  quietNonEssential: boolean
}

/** One lesson in the timetable, for the "next class" widget. Day: 1 = Monday ... 7 = Sunday. */
export interface Lesson {
  id: string
  day: number
  start: string
  end: string
  subject: string
  room?: string
}

/** When School Mode switches on by itself. Days: 1 = Monday ... 7 = Sunday; times HH:MM local. */
export interface ProfileSchedule {
  enabled: boolean
  profile: ProfileId
  days: number[]
  start: string
  end: string
  /** IANA zone, e.g. Europe/Brussels; the device's zone when empty. */
  timeZone: string
}

/**
 * A manual choice. 'until-change' holds until the schedule window next opens or closes;
 * 'until-manual' holds until the user switches again.
 */
export interface ProfileOverride {
  profile: ProfileId
  mode: 'until-change' | 'until-manual'
  /** Whether the schedule window was open when the choice was made. */
  windowOpenAtStart: boolean
  setAt: number
}

export interface ProfilesState {
  profiles: Record<ProfileId, Profile>
  /** The profile outside the schedule window. */
  defaultProfile: ProfileId
  schedule: ProfileSchedule
  override: ProfileOverride | null
  lessons: Lesson[]
  /** Quick link for KlasHub, opened in the browser. */
  klashubUrl: string
  /** Bumped on every change, so another device's older copy never wins. */
  revision: number
}

export const PROFILE_IDS: ProfileId[] = ['school', 'personal', 'gaming', 'developer']

/** Always visible, so you can never lock yourself out of switching back. */
export const ALWAYS_VISIBLE_APPS: AppId[] = ['profiles', 'settings']

export const DEFAULT_PROFILES: Record<ProfileId, Profile> = {
  school: {
    id: 'school',
    name: 'School',
    description: 'Lessen, deadlines en studeren, met minder afleiding.',
    theme: 'focus',
    apps: ['notes', 'reminders', 'assistant', 'notifications', 'devices', 'account', 'about'],
    widgets: ['next_class', 'deadlines', 'klashub', 'ai_study', 'notes'],
    quietNonEssential: true,
  },
  personal: {
    id: 'personal',
    name: 'Persoonlijk',
    description: 'Alles van NEXUS, zoals je het gewend bent.',
    theme: 'focus',
    apps: ['notes', 'notifications', 'assistant', 'reminders', 'devices', 'account', 'about'],
    widgets: ['deadlines', 'notes', 'notifications', 'devices'],
    quietNonEssential: false,
  },
  gaming: {
    id: 'gaming',
    name: 'Gaming',
    description: 'Donker en rustig: alleen belangrijke meldingen komen erdoor.',
    theme: 'pulse',
    apps: ['notifications', 'assistant', 'devices', 'notes', 'account', 'about'],
    widgets: ['notifications', 'devices'],
    quietNonEssential: true,
  },
  developer: {
    id: 'developer',
    name: 'Developer',
    description: 'Met de ontwikkelaarstools en het logboek erbij.',
    theme: 'pulse',
    apps: ['developer', 'assistant', 'notes', 'notifications', 'reminders', 'devices', 'account', 'about'],
    widgets: ['deadlines', 'notes', 'devices'],
    quietNonEssential: false,
  },
}

export const DEFAULT_SCHEDULE: ProfileSchedule = {
  enabled: true,
  profile: 'school',
  days: [1, 2, 3, 4, 5],
  start: '08:30',
  end: '18:00',
  timeZone: '',
}

export function defaultProfilesState(): ProfilesState {
  return {
    profiles: structuredClone(DEFAULT_PROFILES),
    defaultProfile: 'personal',
    schedule: { ...DEFAULT_SCHEDULE },
    override: null,
    lessons: [],
    klashubUrl: '',
    revision: 0,
  }
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export function isTime(value: unknown): value is string {
  return typeof value === 'string' && TIME.test(value)
}

function minutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

/** Weekday (1 = Monday) and minutes since midnight of [at] on the wall clock of [timeZone]. */
export function localClock(at: number, timeZone?: string): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || undefined,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(at))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return { day: WEEKDAYS[get('weekday')] ?? 1, minutes: Number(get('hour')) * 60 + Number(get('minute')) }
}

/**
 * Whether the schedule window is open at [at]. An end before the start runs past midnight,
 * e.g. 22:00-06:00 on Friday covers Friday night into Saturday morning.
 */
export function isWindowOpen(schedule: ProfileSchedule, at: number): boolean {
  if (!schedule.enabled || !isTime(schedule.start) || !isTime(schedule.end)) return false
  const { day, minutes: now } = localClock(at, schedule.timeZone)
  const start = minutes(schedule.start)
  const end = minutes(schedule.end)
  if (start === end) return false
  if (start < end) return schedule.days.includes(day) && now >= start && now < end
  const yesterday = day === 1 ? 7 : day - 1
  return (schedule.days.includes(day) && now >= start) || (schedule.days.includes(yesterday) && now < end)
}

export type ActiveReason = 'override' | 'schedule' | 'default'

/** The profile that applies at [at]; evaluated fresh every time, so reopening NEXUS is always right. */
export function activeProfile(state: ProfilesState, at: number): { id: ProfileId; reason: ActiveReason } {
  const open = isWindowOpen(state.schedule, at)
  const o = state.override
  if (o && (o.mode === 'until-manual' || o.windowOpenAtStart === open)) return { id: o.profile, reason: 'override' }
  if (open) return { id: state.schedule.profile, reason: 'schedule' }
  return { id: state.defaultProfile, reason: 'default' }
}

/** The state after the user picks a profile by hand. */
export function chooseProfile(
  state: ProfilesState,
  profile: ProfileId,
  at: number,
  mode: ProfileOverride['mode'] = 'until-change',
): ProfilesState {
  const open = isWindowOpen(state.schedule, at)
  const scheduled = open ? state.schedule.profile : state.defaultProfile
  // Choosing what the schedule would pick anyway clears the override instead of pinning it.
  const override = mode === 'until-change' && profile === scheduled ? null : { profile, mode, windowOpenAtStart: open, setAt: at }
  return { ...state, override, revision: state.revision + 1 }
}

/** Keeps the newer of two copies (from this device and another one) without ping-pong. */
export function newerState(a: ProfilesState, b: ProfilesState): ProfilesState {
  return b.revision > a.revision ? b : a
}

/** Repairs a stored copy: unknown fields fall back to the defaults, so old versions keep working. */
export function parseProfilesState(raw: unknown): ProfilesState {
  const base = defaultProfilesState()
  if (typeof raw !== 'object' || raw === null) return base
  const r = raw as Partial<ProfilesState>
  const profiles = { ...base.profiles }
  for (const id of PROFILE_IDS) {
    const p = r.profiles?.[id]
    if (p && typeof p === 'object') profiles[id] = { ...base.profiles[id], ...p, id }
  }
  const merged = { ...base.schedule, ...(typeof r.schedule === 'object' ? r.schedule : {}) }
  const schedule =
    isTime(merged.start) && isTime(merged.end) && Array.isArray(merged.days) && PROFILE_IDS.includes(merged.profile)
      ? merged
      : base.schedule
  return {
    profiles,
    defaultProfile: PROFILE_IDS.includes(r.defaultProfile as ProfileId) ? (r.defaultProfile as ProfileId) : base.defaultProfile,
    schedule,
    override:
      r.override && PROFILE_IDS.includes(r.override.profile) && (r.override.mode === 'until-change' || r.override.mode === 'until-manual')
        ? r.override
        : null,
    lessons: Array.isArray(r.lessons) ? r.lessons.filter((l) => l && isTime(l.start) && isTime(l.end) && typeof l.subject === 'string') : [],
    klashubUrl: typeof r.klashubUrl === 'string' ? r.klashubUrl : '',
    revision: typeof r.revision === 'number' ? r.revision : 0,
  }
}

/** The next lesson from [at] on (today later, or the coming days), with when it starts. */
export function nextLesson(lessons: Lesson[], at: number, timeZone?: string): { lesson: Lesson; inDays: number } | null {
  if (lessons.length === 0) return null
  const { day, minutes: now } = localClock(at, timeZone)
  let best: { lesson: Lesson; inDays: number; key: number } | null = null
  for (const lesson of lessons) {
    let inDays = (lesson.day - day + 7) % 7
    // Today's lesson that already ended comes back next week.
    if (inDays === 0 && minutes(lesson.end) <= now) inDays = 7
    const key = inDays * 1440 + minutes(lesson.start)
    if (!best || key < best.key) best = { lesson, inDays, key }
  }
  return best && { lesson: best.lesson, inDays: best.inDays }
}

/** The apps a profile shows, always including the ones you need to switch back. */
export function profileApps(profile: Profile): AppId[] {
  return [...profile.apps.filter((a) => !ALWAYS_VISIBLE_APPS.includes(a)), ...ALWAYS_VISIBLE_APPS]
}
