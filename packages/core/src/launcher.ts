/**
 * NEXUS Launcher (Next Frontier A): Zoeken overal grows into one entry to NEXUS. Besides search it
 * keeps what you opened recently and what you pinned (on this device), knows the settings pages,
 * and has a registry of safe commands: each says what it asks for and shows what it will do before
 * it runs. Commands never run code from a result and none of them deletes anything. Pure logic.
 */
import type { AppId } from './windows'
import { normalize, type SearchKind, type SearchResult } from './search'

/** Something the launcher can open again: a search result without its score. */
export interface LauncherRef {
  kind: SearchKind
  id: string
  title: string
  detail?: string
  app: AppId
}

export interface LauncherState {
  recent: Array<LauncherRef & { at: number }>
  pinned: LauncherRef[]
}

export const MAX_RECENT = 20
export const MAX_PINNED = 12
export const emptyLauncher = (): LauncherState => ({ recent: [], pinned: [] })

const KINDS: SearchKind[] = ['action', 'app', 'note', 'file', 'deadline', 'appointment', 'project', 'reminder', 'setting', 'command']
const same = (a: LauncherRef, b: LauncherRef) => a.kind === b.kind && a.id === b.id

function parseRef(raw: unknown): LauncherRef | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (!KINDS.includes(r.kind as SearchKind) || typeof r.id !== 'string' || typeof r.title !== 'string' || typeof r.app !== 'string') return null
  return { kind: r.kind as SearchKind, id: r.id.slice(0, 200), title: r.title.slice(0, 200), ...(typeof r.detail === 'string' ? { detail: r.detail.slice(0, 200) } : {}), app: r.app as AppId }
}

export function parseLauncher(raw: unknown): LauncherState {
  if (typeof raw !== 'object' || raw === null) return emptyLauncher()
  const v = raw as Record<string, unknown>
  const recent = (Array.isArray(v.recent) ? v.recent : []).flatMap((x) => {
    const ref = parseRef(x)
    const at = (x as { at?: unknown }).at
    return ref && typeof at === 'number' ? [{ ...ref, at }] : []
  })
  const pinned = (Array.isArray(v.pinned) ? v.pinned : []).flatMap((x) => {
    const ref = parseRef(x)
    return ref ? [ref] : []
  })
  return { recent: recent.sort((a, b) => b.at - a.at).slice(0, MAX_RECENT), pinned: pinned.slice(0, MAX_PINNED) }
}

const toRef = (r: LauncherRef | SearchResult): LauncherRef => ({ kind: r.kind, id: r.id, title: r.title, ...(r.detail ? { detail: r.detail } : {}), app: r.app })

/** Opened [r]: it goes on top of Recent, once. Commands are remembered too, apps as well. */
export function addRecent(s: LauncherState, r: LauncherRef | SearchResult, now: number): LauncherState {
  const ref = toRef(r)
  return { ...s, recent: [{ ...ref, at: now }, ...s.recent.filter((x) => !same(x, ref))].slice(0, MAX_RECENT) }
}

export const isPinned = (s: LauncherState, r: LauncherRef) => s.pinned.some((x) => same(x, r))

/** Pins or unpins [r]; at most MAX_PINNED, the oldest pin goes first. */
export function togglePin(s: LauncherState, r: LauncherRef | SearchResult): LauncherState {
  const ref = toRef(r)
  if (isPinned(s, ref)) return { ...s, pinned: s.pinned.filter((x) => !same(x, ref)) }
  return { ...s, pinned: [...s.pinned, ref].slice(-MAX_PINNED) }
}

// Settings pages ------------------------------------------------------------------------------------

/** The places where settings live, so "thema" or "back-up" finds them. */
export const SETTING_PAGES: Array<{ id: string; title: string; detail: string; app: AppId; words: string }> = [
  { id: 'settings', title: 'Instellingen', detail: 'Thema, back-up, nieuwe modules, rondleiding', app: 'settings', words: 'thema donker licht kleur' },
  { id: 'settings-backup', title: 'Back-up maken of terugzetten', detail: 'Instellingen › Back-up', app: 'settings', words: 'export import json' },
  { id: 'settings-modules', title: 'Nieuwe modules aan- of uitzetten', detail: 'Instellingen › Nieuwe modules', app: 'settings', words: 'feature flags beta launcher' },
  { id: 'account', title: 'Account en wachtwoord', detail: 'Account', app: 'account', words: 'aanmelden afmelden inloggen wachtwoord e-mail' },
  { id: 'account-database', title: 'Database-check', detail: 'Account › Database-check', app: 'account', words: 'sql supabase migratie' },
  { id: 'profiles', title: 'Profielen en lesrooster', detail: 'Profielen', app: 'profiles', words: 'school gaming persoonlijk developer rooster kalender' },
  { id: 'devices', title: 'Apparaten koppelen', detail: 'NEXUS Connect', app: 'devices', words: 'gsm horloge pc connect koppelen intrekken' },
]

// Commands ------------------------------------------------------------------------------------------

export type CommandInputType = 'text' | 'datetime' | 'choice'

export interface CommandInput {
  name: string
  label: string
  type: CommandInputType
  required: boolean
  /** For 'choice'. */
  choices?: Array<{ value: string; label: string }>
  max?: number
}

export interface LauncherCommand {
  id: string
  label: string
  category: string
  /** The app the command belongs to: only shown while that app is visible in the profile. */
  app: AppId
  inputs: CommandInput[]
  /** Needs an account (sync); shown greyed out otherwise. */
  needsAccount?: boolean
}

export type CommandValues = Record<string, string>

const PROFILE_CHOICES = [
  { value: 'school', label: 'School / Werk' },
  { value: 'personal', label: 'Persoonlijk' },
  { value: 'gaming', label: 'Gaming' },
  { value: 'developer', label: 'Developer' },
]

/** The command registry. Every command adds or switches something; none deletes or sends anything away. */
export const LAUNCHER_COMMANDS: LauncherCommand[] = [
  { id: 'note.new', label: 'Nieuwe notitie', category: 'Notities', app: 'notes', inputs: [{ name: 'title', label: 'Titel', type: 'text', required: false, max: 200 }] },
  {
    id: 'reminder.new',
    label: 'Herinnering zetten',
    category: 'Herinneringen',
    app: 'reminders',
    inputs: [
      { name: 'title', label: 'Waaraan?', type: 'text', required: true, max: 120 },
      { name: 'at', label: 'Wanneer', type: 'datetime', required: true },
    ],
  },
  {
    id: 'deadline.new',
    label: 'Deadline toevoegen',
    category: 'Agenda',
    app: 'agenda',
    inputs: [
      { name: 'title', label: 'Titel', type: 'text', required: true, max: 160 },
      { name: 'dueAt', label: 'Tegen', type: 'datetime', required: true },
    ],
  },
  { id: 'profile.switch', label: 'Profiel wisselen', category: 'Profielen', app: 'profiles', inputs: [{ name: 'profile', label: 'Profiel', type: 'choice', required: true, choices: PROFILE_CHOICES }] },
  { id: 'focus.start', label: 'Focus starten', category: 'Studie', app: 'study', inputs: [] },
  { id: 'gaming.start', label: 'Gaming starten', category: 'Gaming', app: 'gaming', inputs: [] },
]

const clock = (t: number) => new Date(t).toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Checks the values; returns the problem in Dutch or null. */
export function checkCommand(c: LauncherCommand, values: CommandValues, now: number): string | null {
  for (const input of c.inputs) {
    const v = (values[input.name] ?? '').trim()
    if (!v) {
      if (input.required) return `Vul "${input.label}" in.`
      continue
    }
    if (input.max && v.length > input.max) return `"${input.label}" is te lang (hoogstens ${input.max} tekens).`
    if (input.type === 'datetime') {
      const t = Date.parse(v)
      if (!Number.isFinite(t)) return `"${input.label}" is geen geldig moment.`
      if (t < now - 60_000) return `"${input.label}" ligt in het verleden.`
    }
    if (input.type === 'choice' && !input.choices?.some((x) => x.value === v)) return `Kies een geldige waarde voor "${input.label}".`
  }
  return null
}

/** What the command will do, in one sentence, shown before you confirm. */
export function previewCommand(c: LauncherCommand, values: CommandValues): string {
  const v = (name: string) => (values[name] ?? '').trim()
  const at = (name: string) => (Date.parse(v(name)) ? clock(Date.parse(v(name))) : '…')
  switch (c.id) {
    case 'note.new':
      return v('title') ? `Maakt de notitie "${v('title')}" en opent ze.` : 'Maakt een lege notitie en opent ze.'
    case 'reminder.new':
      return `Zet een herinnering "${v('title') || '…'}" op ${at('at')}, ook op je gsm en horloge.`
    case 'deadline.new':
      return `Voegt de deadline "${v('title') || '…'}" toe tegen ${at('dueAt')}, met de gewone meldingen vooraf.`
    case 'profile.switch': {
      const label = PROFILE_CHOICES.find((p) => p.value === v('profile'))?.label ?? '…'
      return `Zet het profiel ${label} aan tot je zelf wisselt.`
    }
    case 'focus.start':
      return 'Start een focusronde in Studie.'
    case 'gaming.start':
      return 'Start de Gaming-timer voor je laatste game en zet het profiel Gaming aan.'
    default:
      return c.label
  }
}

/** Commands and settings pages that match [query], as search results. */
export function launcherResults(query: string, commands: LauncherCommand[], settings = SETTING_PAGES): SearchResult[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []
  const match = (text: string) => {
    const t = normalize(text)
    let total = 0
    for (const term of terms) {
      if (!t.includes(term)) return 0
      total += t.startsWith(term) ? 3 : 2
    }
    return total
  }
  const out: SearchResult[] = []
  for (const c of commands) {
    const value = match(`${c.label} ${c.category}`)
    if (value) out.push({ kind: 'command', id: c.id, title: c.label, detail: c.category, app: c.app, score: value + 1 })
  }
  for (const p of settings) {
    const value = match(`${p.title} ${p.detail} ${p.words}`)
    if (value) out.push({ kind: 'setting', id: p.id, title: p.title, detail: p.detail, app: p.app, score: value })
  }
  return out
}
