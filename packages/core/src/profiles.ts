/**
 * NEXUS Profiles: a profile changes the theme, the visible apps, the dashboard widgets and how
 * loud notifications are, never open work. Pure logic, no storage or clocks of its own.
 */
import { CALENDAR_HOSTS, isCalendarEvent, type CalendarEvent } from './calendar'
import type { ThemeId } from './theme'
import type { AppId } from './windows'

export type ProfileId = 'school' | 'personal' | 'gaming' | 'developer'
/** Accent colours a profile can use instead of its theme's own; null keeps the theme's. */
export type AccentId = 'blue' | 'cyan' | 'violet' | 'green' | 'orange' | 'pink'
export const ACCENT_IDS: AccentId[] = ['blue', 'cyan', 'violet', 'green', 'orange', 'pink']

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
  /** Phone apps whose notifications still pop up while quiet, e.g. "Smartschool". */
  allowApps: string[]
  accent: AccentId | null
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
 * 'until-time' holds until [until]; 'until-manual' holds until the user switches again.
 */
export interface ProfileOverride {
  profile: ProfileId
  mode: 'until-change' | 'until-time' | 'until-manual'
  /** End of an 'until-time' choice, ms since epoch. */
  until?: number
  /** Whether the schedule window was open when the choice was made. */
  windowOpenAtStart: boolean
  setAt: number
}

export interface ProfilesState {
  profiles: Record<ProfileId, Profile>
  /** The profile outside the schedule window. */
  defaultProfile: ProfileId
  /**
   * The profile last picked by hand outside the schedule window; NEXUS returns to it when the
   * window closes, instead of the default. Cleared when the default is changed.
   */
  returnProfile: ProfileId | null
  schedule: ProfileSchedule
  override: ProfileOverride | null
  lessons: Lesson[]
  /** Where the KlasHub app opens. */
  klashubUrl: string
  /** The school calendar link ("Koppel agenda" on the intranet); empty when not linked. */
  calendarUrl: string
  /** Lessons from that link for the coming weeks, refreshed now and then. */
  calendarEvents: CalendarEvent[]
  calendarSyncedAt: number | null
  /** Version of the stored shape, so older copies can be upgraded. */
  schema: number
  /** Bumped on every change, so another device's older copy never wins. */
  revision: number
}

export const DEFAULT_KLASHUB_URL = 'https://klashub.vercel.app'

/** The address if it can open as the KlasHub app: https, and not a calendar link pasted in the wrong field. */
export function klashubLink(text: string): string | null {
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null
  if (CALENDAR_HOSTS.includes(url.hostname.toLowerCase()) || /\.ics$/i.test(url.pathname)) return null
  return url.href
}
export const PROFILES_SCHEMA = 5

export const PROFILE_IDS: ProfileId[] = ['school', 'personal', 'gaming', 'developer']

/** Always visible, so you can never lock yourself out of switching back. */
export const ALWAYS_VISIBLE_APPS: AppId[] = ['profiles', 'settings']

export const DEFAULT_PROFILES: Record<ProfileId, Profile> = {
  school: {
    id: 'school',
    name: 'School',
    description: 'Lessen, deadlines en studeren, met minder afleiding.',
    theme: 'focus',
    apps: ['klashub', 'agenda', 'study', 'files', 'notes', 'reminders', 'assistant', 'notifications', 'devices', 'account', 'about'],
    widgets: ['next_class', 'deadlines', 'klashub', 'ai_study', 'notes'],
    quietNonEssential: true,
    allowApps: [],
    accent: null,
  },
  personal: {
    id: 'personal',
    name: 'Persoonlijk',
    description: 'Alles van NEXUS, zoals je het gewend bent.',
    theme: 'focus',
    apps: ['agenda', 'notes', 'files', 'study', 'notifications', 'assistant', 'reminders', 'klashub', 'devices', 'account', 'about'],
    widgets: ['deadlines', 'notes', 'notifications', 'devices'],
    quietNonEssential: false,
    allowApps: [],
    accent: null,
  },
  gaming: {
    id: 'gaming',
    name: 'Gaming',
    description: 'Donker en rustig: alleen belangrijke meldingen komen erdoor.',
    theme: 'pulse',
    apps: ['notifications', 'assistant', 'devices', 'notes', 'account', 'about'],
    widgets: ['notifications', 'devices'],
    quietNonEssential: true,
    allowApps: [],
    accent: null,
  },
  developer: {
    id: 'developer',
    name: 'Developer',
    description: 'Met de ontwikkelaarstools en het logboek erbij.',
    theme: 'pulse',
    apps: ['developer', 'assistant', 'agenda', 'files', 'notes', 'notifications', 'reminders', 'devices', 'account', 'about'],
    widgets: ['deadlines', 'notes', 'devices'],
    quietNonEssential: false,
    allowApps: [],
    accent: null,
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
    returnProfile: null,
    schedule: { ...DEFAULT_SCHEDULE },
    override: null,
    lessons: [],
    klashubUrl: DEFAULT_KLASHUB_URL,
    calendarUrl: '',
    calendarEvents: [],
    calendarSyncedAt: null,
    schema: PROFILES_SCHEMA,
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

export type ActiveReason = 'override' | 'schedule' | 'return' | 'default'

/** The profile that applies at [at]; evaluated fresh every time, so reopening NEXUS is always right. */
export function activeProfile(state: ProfilesState, at: number): { id: ProfileId; reason: ActiveReason } {
  const open = isWindowOpen(state.schedule, at)
  const o = state.override
  if (o && overrideHolds(o, open, at)) return { id: o.profile, reason: 'override' }
  if (open) return { id: state.schedule.profile, reason: 'schedule' }
  if (state.returnProfile) return { id: state.returnProfile, reason: 'return' }
  return { id: state.defaultProfile, reason: 'default' }
}

function overrideHolds(o: ProfileOverride, open: boolean, at: number): boolean {
  if (o.mode === 'until-manual') return true
  if (o.mode === 'until-time') return typeof o.until === 'number' && at < o.until
  return o.windowOpenAtStart === open
}

/** The profile outside the schedule window: the last one picked by hand, else the default. */
export function profileOutsideSchedule(state: ProfilesState): ProfileId {
  return state.returnProfile ?? state.defaultProfile
}

/** The state after the user picks a profile by hand. */
export function chooseProfile(
  state: ProfilesState,
  profile: ProfileId,
  at: number,
  mode: ProfileOverride['mode'] = 'until-change',
  until?: number,
): ProfilesState {
  const open = isWindowOpen(state.schedule, at)
  // Outside the window the choice is remembered, so NEXUS comes back to it after school.
  const returnProfile = open || mode !== 'until-change' ? state.returnProfile : profile === state.defaultProfile ? null : profile
  const scheduled = open ? state.schedule.profile : (returnProfile ?? state.defaultProfile)
  // Choosing what the schedule would pick anyway clears the override instead of pinning it.
  const override: ProfileOverride | null =
    mode === 'until-change' && profile === scheduled
      ? null
      : { profile, mode, windowOpenAtStart: open, setAt: at, ...(mode === 'until-time' && until !== undefined ? { until } : {}) }
  return { ...state, override, returnProfile, revision: state.revision + 1 }
}

/**
 * The first time a device syncs, its own copy meets the one from the account. The newer one wins,
 * but a timetable or calendar link set up on only one of them is kept, so nothing typed in is lost.
 */
export function mergeFirstSync(local: ProfilesState, remote: ProfilesState): ProfilesState {
  const [base, other] = remote.revision >= local.revision ? [remote, local] : [local, remote]
  let merged = base
  if (!base.calendarUrl && other.calendarUrl) {
    merged = { ...merged, calendarUrl: other.calendarUrl, calendarEvents: other.calendarEvents, calendarSyncedAt: other.calendarSyncedAt }
  }
  if (base.lessons.length === 0 && other.lessons.length > 0) merged = { ...merged, lessons: other.lessons }
  if (merged === remote) return remote
  return { ...merged, revision: Math.max(local.revision, remote.revision) + 1 }
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
    if (p && typeof p === 'object') {
      const merged = { ...base.profiles[id], ...p, id }
      profiles[id] = {
        ...merged,
        allowApps: Array.isArray(merged.allowApps) ? merged.allowApps.filter((a) => typeof a === 'string').slice(0, 50) : [],
        accent: ACCENT_IDS.includes(merged.accent as AccentId) ? merged.accent : null,
      }
    }
  }
  // Copies from before KlasHub existed get it in the profiles that have it by default.
  if (typeof r.schema !== 'number' || r.schema < 2) {
    for (const id of PROFILE_IDS) {
      const apps = profiles[id].apps
      if (base.profiles[id].apps.includes('klashub') && Array.isArray(apps) && !apps.includes('klashub')) {
        profiles[id] = { ...profiles[id], apps: id === 'school' ? ['klashub', ...apps] : [...apps, 'klashub'] }
      }
    }
  }
  // Copies from before NEXUS Life get the Agenda app in the profiles that have it by default.
  if (typeof r.schema !== 'number' || r.schema < 3) {
    for (const id of PROFILE_IDS) {
      const apps = profiles[id].apps
      if (base.profiles[id].apps.includes('agenda') && Array.isArray(apps) && !apps.includes('agenda')) {
        const after = apps.indexOf('klashub')
        profiles[id] = { ...profiles[id], apps: id === 'school' && after >= 0 ? [...apps.slice(0, after + 1), 'agenda', ...apps.slice(after + 1)] : ['agenda', ...apps] }
      }
    }
  }
  // Copies from before Bestanden get it right after the Agenda (or first) where it is a default.
  if (typeof r.schema !== 'number' || r.schema < 4) {
    for (const id of PROFILE_IDS) {
      const apps = profiles[id].apps
      if (base.profiles[id].apps.includes('files') && Array.isArray(apps) && !apps.includes('files')) {
        const after = apps.indexOf('agenda')
        profiles[id] = { ...profiles[id], apps: [...apps.slice(0, after + 1), 'files', ...apps.slice(after + 1)] }
      }
    }
  }
  // Copies from before the Studieplanner get Studie right after the Agenda where it is a default.
  if (typeof r.schema !== 'number' || r.schema < 5) {
    for (const id of PROFILE_IDS) {
      const apps = profiles[id].apps
      if (base.profiles[id].apps.includes('study') && Array.isArray(apps) && !apps.includes('study')) {
        const after = apps.indexOf('agenda')
        profiles[id] = { ...profiles[id], apps: [...apps.slice(0, after + 1), 'study', ...apps.slice(after + 1)] }
      }
    }
  }
  const merged = { ...base.schedule, ...(typeof r.schedule === 'object' ? r.schedule : {}) }
  const schedule =
    isTime(merged.start) && isTime(merged.end) && Array.isArray(merged.days) && PROFILE_IDS.includes(merged.profile)
      ? merged
      : base.schedule
  return {
    profiles,
    defaultProfile: PROFILE_IDS.includes(r.defaultProfile as ProfileId) ? (r.defaultProfile as ProfileId) : base.defaultProfile,
    returnProfile: PROFILE_IDS.includes(r.returnProfile as ProfileId) ? (r.returnProfile as ProfileId) : null,
    schedule,
    override:
      r.override &&
      PROFILE_IDS.includes(r.override.profile) &&
      (r.override.mode === 'until-change' ||
        r.override.mode === 'until-manual' ||
        (r.override.mode === 'until-time' && typeof r.override.until === 'number'))
        ? r.override
        : null,
    lessons: Array.isArray(r.lessons) ? r.lessons.filter((l) => l && isTime(l.start) && isTime(l.end) && typeof l.subject === 'string') : [],
    klashubUrl: (typeof r.klashubUrl === 'string' && klashubLink(r.klashubUrl)) || DEFAULT_KLASHUB_URL,
    calendarUrl: typeof r.calendarUrl === 'string' ? r.calendarUrl : '',
    calendarEvents: Array.isArray(r.calendarEvents) ? r.calendarEvents.filter(isCalendarEvent) : [],
    calendarSyncedAt: typeof r.calendarSyncedAt === 'number' ? r.calendarSyncedAt : null,
    schema: PROFILES_SCHEMA,
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

/** Whether a phone notification from [appName] may pop up in [profile]. */
export function notificationPopsUp(profile: Profile, appName: string): boolean {
  if (!profile.quietNonEssential) return true
  const name = appName.trim().toLowerCase()
  return profile.allowApps.some((a) => a.trim().toLowerCase() === name)
}

/** Moves [item] one place up (-1) or down (+1) in [list]. */
export function moveItem<T>(list: T[], item: T, by: -1 | 1): T[] {
  const i = list.indexOf(item)
  const j = i + by
  if (i < 0 || j < 0 || j >= list.length) return list
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

/** The apps a profile shows, always including the ones you need to switch back. */
export function profileApps(profile: Profile): AppId[] {
  return [...profile.apps.filter((a) => !ALWAYS_VISIBLE_APPS.includes(a)), ...ALWAYS_VISIBLE_APPS]
}
