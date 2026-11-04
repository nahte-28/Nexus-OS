/**
 * NEXUS Profiles: a profile changes the theme, the visible apps, the dashboard widgets and how
 * loud notifications are, never open work. Pure logic, no storage or clocks of its own.
 */
import { parseLayout, type WidgetLayout } from './dashboardLayout'
import { CALENDAR_HOSTS, icsUrl, isCalendarEvent, MAX_EXTRA_CALENDARS, type CalendarEvent } from './calendar'
import type { ThemeId } from './theme'
import type { AppId } from './windows'
import { parseSwitches, type FeatureSwitches } from './features'

export type ProfileId = 'school' | 'personal' | 'gaming' | 'developer'
/** Accent colours a profile can use instead of its theme's own; null keeps the theme's. */
export type AccentId = 'blue' | 'cyan' | 'violet' | 'green' | 'orange' | 'pink'
export const ACCENT_IDS: AccentId[] = ['blue', 'cyan', 'violet', 'green', 'orange', 'pink']

export type WidgetId = 'next_class' | 'deadlines' | 'notes' | 'ai_study' | 'klashub' | 'devices' | 'notifications' | 'finance' | 'gaming'

export interface Profile {
  id: ProfileId
  name: string
  description: string
  theme: ThemeId
  /** Apps shown in the sidebar, menus and app grid, in this order. Settings and Profiles always show. */
  apps: AppId[]
  widgets: WidgetId[]
  /** Workspace Studio 2.0: width and height of each dashboard widget; missing means 1 by 1. */
  layout?: WidgetLayout
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
  /** Profiles 2.0: who chose it when not you in Profielen, e.g. "Flow Ochtend" or "Space Studeren". */
  by?: string
}

/**
 * Profiles 2.0: a profile while a lesson from the timetable or the school calendar runs, from
 * [leadMinutes] before it starts, and through breaks between lessons up to [bridgeMinutes].
 */
export interface AgendaRule {
  enabled: boolean
  profile: ProfileId
  leadMinutes: number
  bridgeMinutes: number
}

/** A class as NEXUS stores it, e.g. " 1it-3 " becomes 1IT3: 2 to 8 capitals and digits; null otherwise. */
export function normalizeKlas(raw: string): string | null {
  const k = raw.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
  return /^[0-9A-Z]{2,8}$/.test(k) ? k : null
}

export const DEFAULT_AGENDA: AgendaRule = { enabled: false, profile: 'school', leadMinutes: 10, bridgeMinutes: 60 }
export const AGENDA_LEAD_CHOICES = [0, 5, 10, 15, 30]
export const AGENDA_BRIDGE_CHOICES = [0, 15, 30, 60, 120]

export function parseAgendaRule(raw: unknown): AgendaRule {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_AGENDA }
  const r = raw as Partial<AgendaRule>
  return {
    enabled: r.enabled === true,
    profile: PROFILE_IDS.includes(r.profile as ProfileId) ? (r.profile as ProfileId) : DEFAULT_AGENDA.profile,
    leadMinutes: AGENDA_LEAD_CHOICES.includes(r.leadMinutes as number) ? (r.leadMinutes as number) : DEFAULT_AGENDA.leadMinutes,
    bridgeMinutes: AGENDA_BRIDGE_CHOICES.includes(r.bridgeMinutes as number) ? (r.bridgeMinutes as number) : DEFAULT_AGENDA.bridgeMinutes,
  }
}

/** Dagstart: a morning overview of the day on the phone, watch or this pc. Days: 1 = Monday ... 7 = Sunday. */
export interface DagstartSettings {
  enabled: boolean
  /** HH:MM, local time. */
  time: string
  days: number[]
  /** 'phone' also reaches the watch; 'this_device' only shows it on the device running NEXUS. */
  target: 'phone' | 'this_device'
  /** No notification on a day with nothing planned and no deadline coming up. */
  skipEmpty: boolean
}

export const DEFAULT_DAGSTART: DagstartSettings = { enabled: true, time: '07:30', days: [1, 2, 3, 4, 5, 6, 7], target: 'phone', skipEmpty: true }

export function parseDagstart(raw: unknown): DagstartSettings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_DAGSTART, days: [...DEFAULT_DAGSTART.days] }
  const r = raw as Partial<DagstartSettings>
  const days = Array.isArray(r.days) ? [...new Set(r.days.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort() : DEFAULT_DAGSTART.days
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_DAGSTART.enabled,
    time: isTime(r.time) ? r.time : DEFAULT_DAGSTART.time,
    days: [...days],
    target: r.target === 'this_device' ? 'this_device' : 'phone',
    skipEmpty: typeof r.skipEmpty === 'boolean' ? r.skipEmpty : DEFAULT_DAGSTART.skipEmpty,
  }
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
  /** A Google Agenda iCal address; its events show in the Agenda and count as busy. Empty when not linked. */
  googleUrl: string
  googleEvents: CalendarEvent[]
  googleSyncedAt: number | null
  /** Other calendar links (Outlook, iCloud, a club, ...): their events show in the Agenda like Google ones. */
  extraCalendars: ExtraCalendar[]
  /** What each of those links gave last time, by calendar id; fetched anew on every device. */
  extraEvents: Record<string, { events: CalendarEvent[]; syncedAt: number }>
  dagstart: DagstartSettings
  /** Profiles 2.0: the profile while lessons run. */
  agenda: AgendaRule
  /** Your class, e.g. 1IT3; Teams shows the teams open to it. Empty when not set. */
  klas: string
  /** Instellingen › Nieuwe modules: your switches, the same on every device. */
  features: FeatureSwitches
  /** Klasagenda: your choice per team (on or off); a team without a choice follows its class. */
  classAgenda: Record<string, boolean>
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
export const PROFILES_SCHEMA = 13

export const PROFILE_IDS: ProfileId[] = ['school', 'personal', 'gaming', 'developer']

/** Always visible, so you can never lock yourself out of switching back, and help is always at hand. */
export const ALWAYS_VISIBLE_APPS: AppId[] = ['profiles', 'settings', 'help']

export const DEFAULT_PROFILES: Record<ProfileId, Profile> = {
  school: {
    id: 'school',
    name: 'School',
    description: 'Lessen, deadlines en studeren, met minder afleiding.',
    theme: 'focus',
    apps: ['klashub', 'agenda', 'study', 'grades', 'habits', 'flashcards', 'insights', 'files', 'notes', 'reminders', 'assistant', 'notifications', 'devices', 'account', 'about'],
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
    apps: ['agenda', 'notes', 'files', 'study', 'grades', 'habits', 'journal', 'flashcards', 'insights', 'finance', 'notifications', 'assistant', 'reminders', 'klashub', 'devices', 'account', 'about'],
    widgets: ['deadlines', 'notes', 'finance', 'notifications', 'devices'],
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
    widgets: ['gaming', 'notifications', 'devices'],
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
    googleUrl: '',
    googleEvents: [],
    googleSyncedAt: null,
    extraCalendars: [],
    extraEvents: {},
    dagstart: parseDagstart(null),
    agenda: { ...DEFAULT_AGENDA },
    klas: '',
    features: {},
    classAgenda: {},
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

export type ActiveReason = 'override' | 'schedule' | 'agenda' | 'return' | 'default'

/** One lesson as a span of time, from the school calendar or the weekly timetable. */
export interface LessonBlock {
  start: number
  end: number
  subject: string
  room?: string
}

/**
 * The lessons around [at] (yesterday to tomorrow), sorted: the school calendar's lessons, and
 * the weekly timetable placed on those days.
 */
export function lessonBlocks(state: Pick<ProfilesState, 'calendarEvents' | 'lessons' | 'schedule'>, at: number): LessonBlock[] {
  const from = at - 86_400_000
  const to = at + 86_400_000
  const out: LessonBlock[] = state.calendarEvents.filter((e) => e.end > from && e.start < to).map((e) => ({ start: e.start, end: e.end, subject: e.subject, ...(e.room ? { room: e.room } : {}) }))
  const { day, minutes: now } = localClock(at, state.schedule.timeZone)
  for (const offset of [-1, 0, 1]) {
    const d = ((day - 1 + offset + 7) % 7) + 1
    for (const l of state.lessons) {
      if (l.day !== d) continue
      // Minutes from now, so the device's zone or the schedule's zone gives the same moment.
      const start = at + (offset * 1440 + minutes(l.start) - now) * 60_000
      const end = at + (offset * 1440 + minutes(l.end) - now) * 60_000
      if (end <= start) continue
      // A lesson the school calendar already has is not counted twice.
      if (out.some((e) => Math.abs(e.start - start) < 60_000 && e.subject.toLowerCase() === l.subject.toLowerCase())) continue
      out.push({ start, end, subject: l.subject, ...(l.room ? { room: l.room } : {}) })
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

export type AgendaPhase = { kind: 'before' | 'during'; lesson: LessonBlock } | { kind: 'between'; previous: LessonBlock; next: LessonBlock }

/** Whether the agenda rule holds at [at], and why: before a lesson, during one, or in a break. */
export function agendaPhase(state: Pick<ProfilesState, 'calendarEvents' | 'lessons' | 'schedule' | 'agenda'>, at: number): AgendaPhase | null {
  const rule = state.agenda
  if (!rule?.enabled) return null
  const blocks = lessonBlocks(state, at)
  const during = blocks.find((b) => b.start <= at && at < b.end)
  if (during) return { kind: 'during', lesson: during }
  const soon = blocks.find((b) => b.start > at && b.start - rule.leadMinutes * 60_000 <= at)
  if (soon) return { kind: 'before', lesson: soon }
  if (rule.bridgeMinutes > 0) {
    const previous = [...blocks].reverse().find((b) => b.end <= at)
    const next = blocks.find((b) => b.start > at)
    if (previous && next && next.start - previous.end <= rule.bridgeMinutes * 60_000) return { kind: 'between', previous, next }
  }
  return null
}

/** Either automatic window: the hours of School Mode or the agenda rule. */
function autoOpen(state: ProfilesState, at: number): boolean {
  return isWindowOpen(state.schedule, at) || agendaPhase(state, at) !== null
}

/** The profile that applies at [at]; evaluated fresh every time, so reopening NEXUS is always right. */
export function activeProfile(state: ProfilesState, at: number): { id: ProfileId; reason: ActiveReason } {
  const hours = isWindowOpen(state.schedule, at)
  const agenda = !hours && agendaPhase(state, at) !== null
  const o = state.override
  if (o && overrideHolds(o, hours || agenda, at)) return { id: o.profile, reason: 'override' }
  if (hours) return { id: state.schedule.profile, reason: 'schedule' }
  if (agenda) return { id: state.agenda.profile, reason: 'agenda' }
  if (state.returnProfile) return { id: state.returnProfile, reason: 'return' }
  return { id: state.defaultProfile, reason: 'default' }
}

const DAY_SHORT = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']

/** "ma–vr" for consecutive days, else "ma, wo, vr". */
export function daysLabel(days: number[]): string {
  const sorted = [...new Set(days)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b)
  if (sorted.length === 0) return 'geen dagen'
  if (sorted.length === 7) return 'elke dag'
  const consecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1)
  if (consecutive && sorted.length > 2) return `${DAY_SHORT[sorted[0] - 1]}–${DAY_SHORT[sorted[sorted.length - 1] - 1]}`
  return sorted.map((d) => DAY_SHORT[d - 1]).join(', ')
}

/** HH:MM of a moment in the schedule's zone. */
function clockText(at: number, timeZone?: string): string {
  const m = localClock(at, timeZone).minutes
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Profiles 2.0: why the active profile is active, in one sentence. */
export function explainActive(state: ProfilesState, at: number, reason: ActiveReason = activeProfile(state, at).reason): string {
  const s = state.schedule
  if (reason === 'schedule') return `Automatisch actief, ${daysLabel(s.days)} ${s.start}–${s.end}`
  if (reason === 'agenda') {
    const phase = agendaPhase(state, at)
    const t = (x: number) => clockText(x, s.timeZone)
    if (phase?.kind === 'during') return `Les ${phase.lesson.subject}, ${t(phase.lesson.start)}–${t(phase.lesson.end)}${phase.lesson.room ? ` in ${phase.lesson.room}` : ''}`
    if (phase?.kind === 'before') return `Les ${phase.lesson.subject} begint om ${t(phase.lesson.start)}`
    if (phase?.kind === 'between') return `Pauze tussen ${phase.previous.subject} en ${phase.next.subject} (${t(phase.next.start)})`
    return 'Volgens je lesrooster'
  }
  if (reason === 'override') {
    const o = state.override
    const who = o?.by ? `Gekozen door ${o.by}` : 'Met de hand gekozen'
    if (o?.mode === 'until-manual') return `${who}, tot je terugschakelt`
    if (o?.mode === 'until-time' && o.until) return `${who}, tot ${clockText(o.until, s.timeZone)}`
    return `${who}, tot het schema wisselt`
  }
  if (reason === 'return') return 'Je laatst gekozen profiel buiten het schema'
  return 'Je standaardprofiel'
}

/** Profiles 2.0: one switch of the active profile, and why. Kept on the device. */
export interface ProfileChange {
  at: number
  profile: ProfileId
  /** The profile before, null for the first entry. */
  from: ProfileId | null
  reason: ActiveReason
  why: string
}

export const MAX_PROFILE_HISTORY = 100

/** Adds a change when the profile or its reason differs from the newest entry. */
export function addProfileChange(list: ProfileChange[], change: ProfileChange): ProfileChange[] {
  const last = list[0]
  if (last && last.profile === change.profile && last.reason === change.reason && last.why === change.why) return list
  return [change, ...list].slice(0, MAX_PROFILE_HISTORY)
}

export function parseProfileHistory(raw: unknown): ProfileChange[] {
  if (!Array.isArray(raw)) return []
  const reasons: ActiveReason[] = ['override', 'schedule', 'agenda', 'return', 'default']
  return raw
    .filter(
      (c): c is ProfileChange =>
        typeof c === 'object' &&
        c !== null &&
        typeof c.at === 'number' &&
        PROFILE_IDS.includes(c.profile) &&
        (c.from === null || PROFILE_IDS.includes(c.from)) &&
        reasons.includes(c.reason) &&
        typeof c.why === 'string',
    )
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_PROFILE_HISTORY)
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
  by?: string,
): ProfilesState {
  const open = autoOpen(state, at)
  // Outside the window the choice is remembered, so NEXUS comes back to it after school.
  const returnProfile = open || mode !== 'until-change' ? state.returnProfile : profile === state.defaultProfile ? null : profile
  const scheduled = open ? activeProfile({ ...state, override: null }, at).id : (returnProfile ?? state.defaultProfile)
  // Choosing what the schedule would pick anyway clears the override instead of pinning it.
  const override: ProfileOverride | null =
    mode === 'until-change' && profile === scheduled
      ? null
      : { profile, mode, windowOpenAtStart: open, setAt: at, ...(mode === 'until-time' && until !== undefined ? { until } : {}), ...(by ? { by: by.slice(0, 60) } : {}) }
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
  if (!base.googleUrl && other.googleUrl) {
    merged = { ...merged, googleUrl: other.googleUrl, googleEvents: other.googleEvents, googleSyncedAt: other.googleSyncedAt }
  }
  if (base.lessons.length === 0 && other.lessons.length > 0) merged = { ...merged, lessons: other.lessons }
  // A calendar link added on only one of the two devices so far is kept.
  const extra = other.extraCalendars.filter((c) => !base.extraCalendars.some((b) => b.id === c.id || b.url === c.url))
  if (extra.length > 0) merged = { ...merged, extraCalendars: [...base.extraCalendars, ...extra].slice(0, MAX_EXTRA_CALENDARS) }
  // Switches set on only one of the two devices so far are kept; where both chose, the newer copy wins.
  const features = { ...other.features, ...base.features }
  if (Object.keys(features).length !== Object.keys(base.features).length) merged = { ...merged, features }
  const classAgenda = { ...other.classAgenda, ...base.classAgenda }
  if (Object.keys(classAgenda).length !== Object.keys(base.classAgenda).length) merged = { ...merged, classAgenda }
  if (merged === remote) return remote
  return { ...merged, revision: Math.max(local.revision, remote.revision) + 1 }
}

/** Another calendar link with its own name. */
export interface ExtraCalendar {
  id: string
  name: string
  url: string
}

function parseExtraCalendars(raw: unknown): ExtraCalendar[] {
  if (!Array.isArray(raw)) return []
  const out: ExtraCalendar[] = []
  for (const c of raw as Array<Partial<ExtraCalendar> | null>) {
    if (!c || typeof c.id !== 'string' || c.id.length > 64 || typeof c.name !== 'string' || typeof c.url !== 'string') continue
    const url = icsUrl(c.url)
    if (url && !out.some((o) => o.id === c.id)) out.push({ id: c.id, name: c.name.trim().slice(0, 40) || 'Agenda', url })
  }
  return out.slice(0, MAX_EXTRA_CALENDARS)
}

function parseExtraEvents(raw: unknown): ProfilesState['extraEvents'] {
  const out: ProfilesState['extraEvents'] = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, MAX_EXTRA_CALENDARS)) {
    const e = v as { events?: unknown; syncedAt?: unknown } | null
    if (e && Array.isArray(e.events) && typeof e.syncedAt === 'number') out[k] = { events: e.events.filter(isCalendarEvent), syncedAt: e.syncedAt }
  }
  return out
}

/**
 * Every event from a linked calendar besides the lessons: Google Agenda and the other links. An
 * event without a place shows the name of its calendar instead.
 */
export function linkedEvents(state: Pick<ProfilesState, 'googleEvents' | 'extraCalendars' | 'extraEvents'>): CalendarEvent[] {
  if (state.extraCalendars.length === 0) return state.googleEvents
  const out = [...state.googleEvents]
  for (const c of state.extraCalendars) for (const e of state.extraEvents[c.id]?.events ?? []) out.push(e.room ? e : { ...e, room: c.name })
  return out
}

/** On/off choices keyed by id (team ids), at most 200. */
function parseChoices(raw: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 200)) if (typeof v === 'boolean' && k.length <= 64) out[k] = v
  return out
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
        layout: parseLayout(merged.layout),
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
  // Copies from before Cijfers get it right after Studie where it is a default.
  if (typeof r.schema !== 'number' || r.schema < 6) {
    for (const id of PROFILE_IDS) {
      const apps = profiles[id].apps
      if (base.profiles[id].apps.includes('grades') && Array.isArray(apps) && !apps.includes('grades')) {
        const after = apps.indexOf('study')
        profiles[id] = { ...profiles[id], apps: [...apps.slice(0, after + 1), 'grades', ...apps.slice(after + 1)] }
      }
    }
  }
  // Copies from before Gewoontes get it right after Cijfers (or Studie) where it is a default.
  if (typeof r.schema !== 'number' || r.schema < 7) {
    for (const id of PROFILE_IDS) {
      const apps = profiles[id].apps
      if (base.profiles[id].apps.includes('habits') && Array.isArray(apps) && !apps.includes('habits')) {
        const after = apps.includes('grades') ? apps.indexOf('grades') : apps.indexOf('study')
        profiles[id] = { ...profiles[id], apps: [...apps.slice(0, after + 1), 'habits', ...apps.slice(after + 1)] }
      }
    }
  }
  // Copies from before Leerkaarten get it right after Gewoontes (or Studie) where it is a default.
  if (typeof r.schema !== 'number' || r.schema < 8) {
    for (const id of PROFILE_IDS) {
      const apps = profiles[id].apps
      if (base.profiles[id].apps.includes('flashcards') && Array.isArray(apps) && !apps.includes('flashcards')) {
        const after = apps.includes('habits') ? apps.indexOf('habits') : apps.indexOf('study')
        profiles[id] = { ...profiles[id], apps: [...apps.slice(0, after + 1), 'flashcards', ...apps.slice(after + 1)] }
      }
    }
  }
  // Copies from before Inzichten get it right after Leerkaarten (or Studie) where it is a default.
  if (typeof r.schema !== 'number' || r.schema < 9) {
    for (const id of PROFILE_IDS) {
      const apps = profiles[id].apps
      if (base.profiles[id].apps.includes('insights') && Array.isArray(apps) && !apps.includes('insights')) {
        const after = apps.includes('flashcards') ? apps.indexOf('flashcards') : apps.indexOf('study')
        profiles[id] = { ...profiles[id], apps: [...apps.slice(0, after + 1), 'insights', ...apps.slice(after + 1)] }
      }
    }
  }
  // Copies from before Financiën get it where Budget was, or right after Inzichten, and its card after
  // Notities, where they are a default (Persoonlijk). Budget (schema 10) became Financiën.
  if (typeof r.schema !== 'number' || r.schema < 11) {
    for (const id of PROFILE_IDS) {
      const { apps, widgets } = profiles[id]
      const list = Array.isArray(apps) ? (apps as string[]) : null
      if (list?.includes('budget')) {
        profiles[id] = { ...profiles[id], apps: (list.includes('finance') ? list.filter((a) => a !== 'budget') : list.map((a) => (a === 'budget' ? 'finance' : a))) as AppId[] }
      } else if (base.profiles[id].apps.includes('finance') && list && !list.includes('finance')) {
        const after = list.includes('insights') ? list.indexOf('insights') : list.length - 1
        profiles[id] = { ...profiles[id], apps: [...list.slice(0, after + 1), 'finance', ...list.slice(after + 1)] as AppId[] }
      }
      if (base.profiles[id].widgets.includes('finance') && Array.isArray(widgets) && !widgets.includes('finance')) {
        const after = widgets.includes('notes') ? widgets.indexOf('notes') : widgets.length - 1
        profiles[id] = { ...profiles[id], widgets: [...widgets.slice(0, after + 1), 'finance', ...widgets.slice(after + 1)] }
      }
    }
  }
  // Copies from before the Dagboek get it right after Gewoontes where it is a default (Persoonlijk).
  if (typeof r.schema !== 'number' || r.schema < 12) {
    for (const id of PROFILE_IDS) {
      const apps = profiles[id].apps
      if (base.profiles[id].apps.includes('journal') && Array.isArray(apps) && !apps.includes('journal')) {
        const after = apps.includes('habits') ? apps.indexOf('habits') : apps.length - 1
        profiles[id] = { ...profiles[id], apps: [...apps.slice(0, after + 1), 'journal', ...apps.slice(after + 1)] }
      }
    }
  }
  // Copies from before the Gaming widget get it first on the Gaming dashboard.
  if (typeof r.schema !== 'number' || r.schema < 13) {
    const widgets = profiles.gaming.widgets
    if (Array.isArray(widgets) && !widgets.includes('gaming')) profiles.gaming = { ...profiles.gaming, widgets: ['gaming', ...widgets] }
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
    googleUrl: typeof r.googleUrl === 'string' ? r.googleUrl : '',
    googleEvents: Array.isArray(r.googleEvents) ? r.googleEvents.filter(isCalendarEvent) : [],
    googleSyncedAt: typeof r.googleSyncedAt === 'number' ? r.googleSyncedAt : null,
    extraCalendars: parseExtraCalendars(r.extraCalendars),
    extraEvents: parseExtraEvents(r.extraEvents),
    dagstart: parseDagstart(r.dagstart),
    agenda: parseAgendaRule(r.agenda),
    klas: typeof r.klas === 'string' ? (normalizeKlas(r.klas) ?? '') : '',
    features: parseSwitches(r.features),
    classAgenda: parseChoices(r.classAgenda),
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
