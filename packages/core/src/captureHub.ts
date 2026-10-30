/**
 * Snel vastleggen 2.0 (Quick Capture): what you save to sort out later (a link, an idea, a task),
 * templates for what you capture often, and a history of every capture. One document per account
 * (user_settings key 'captures'); every entry merges on its own, newest edit wins. Pure logic.
 */
import type { CaptureKind } from './capture'

/** What a capture "to sort later" looks like; guessed from the text. */
export type InboxKind = 'text' | 'link' | 'idea' | 'task'
export const INBOX_KIND_LABELS: Record<InboxKind, string> = { text: 'Tekst', link: 'Link', idea: 'Idee', task: 'Taak' }

/** Where a capture can end up. 'later' keeps it in Te sorteren. */
export type CaptureTarget = CaptureKind | 'later'
export const CAPTURE_TARGET_LABELS: Record<CaptureTarget, string> = { note: 'Notitie', deadline: 'Deadline', reminder: 'Herinnering', later: 'Later sorteren' }

export interface InboxCapture {
  id: string
  kind: InboxKind
  text: string
  createdAt: number
  /** Set when it was sorted into a note, deadline or reminder. */
  sortedTo: CaptureKind | null
  updatedAt: number
  deletedAt: number | null
}

export interface CaptureTemplate {
  id: string
  name: string
  text: string
  target: CaptureTarget
  updatedAt: number
  deletedAt: number | null
}

export interface CaptureLog {
  id: string
  at: number
  /** First line of what was saved, at most 120 characters. */
  title: string
  to: CaptureTarget
}

export interface CapturesState {
  inbox: InboxCapture[]
  templates: CaptureTemplate[]
  history: CaptureLog[]
  revision: number
}

export const MAX_CAPTURE_INBOX = 300
export const MAX_CAPTURE_TEMPLATES = 30
export const MAX_CAPTURE_HISTORY = 200
const MAX_TEXT = 4000
const MAX_NAME = 60
/** Sorted or deleted entries are kept this long so other devices learn about it, then dropped. */
const KEEP_MS = 30 * 24 * 60 * 60_000

export const DEFAULT_TEMPLATES: Array<Pick<CaptureTemplate, 'id' | 'name' | 'text' | 'target'>> = [
  { id: 'tpl-verslag', name: 'Verslag indienen', text: 'Verslag  indienen vrijdag', target: 'deadline' },
  { id: 'tpl-bellen', name: 'Iemand bellen', text: ' bellen morgen om 10u', target: 'reminder' },
  { id: 'tpl-idee', name: 'Idee', text: 'Idee: ', target: 'later' },
]

const TARGETS: CaptureTarget[] = ['note', 'deadline', 'reminder', 'later']
const KINDS: InboxKind[] = ['text', 'link', 'idea', 'task']

export const emptyCaptures = (): CapturesState => ({
  inbox: [],
  templates: DEFAULT_TEMPLATES.map((t) => ({ ...t, updatedAt: 0, deletedAt: null })),
  history: [],
  revision: 0,
})

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function parseCaptures(raw: unknown): CapturesState {
  if (typeof raw !== 'object' || raw === null) return emptyCaptures()
  const v = raw as Record<string, unknown>
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null && typeof i.id === 'string') : [])
  const inbox = list(v.inbox).flatMap((i): InboxCapture[] => {
    const createdAt = num(i.createdAt)
    if (createdAt === null) return []
    return [
      {
        id: i.id as string,
        kind: KINDS.includes(i.kind as InboxKind) ? (i.kind as InboxKind) : 'text',
        text: str(i.text, MAX_TEXT),
        createdAt,
        sortedTo: ['note', 'deadline', 'reminder'].includes(i.sortedTo as string) ? (i.sortedTo as CaptureKind) : null,
        updatedAt: num(i.updatedAt) ?? createdAt,
        deletedAt: num(i.deletedAt),
      },
    ]
  })
  const templates = Array.isArray(v.templates)
    ? list(v.templates).map((t) => ({
        id: t.id as string,
        name: str(t.name, MAX_NAME),
        text: str(t.text, MAX_TEXT),
        target: TARGETS.includes(t.target as CaptureTarget) ? (t.target as CaptureTarget) : 'note',
        updatedAt: num(t.updatedAt) ?? 0,
        deletedAt: num(t.deletedAt),
      }))
    : emptyCaptures().templates
  const history = list(v.history).flatMap((h): CaptureLog[] => {
    const at = num(h.at)
    return at === null || !TARGETS.includes(h.to as CaptureTarget) ? [] : [{ id: h.id as string, at, title: str(h.title, 120), to: h.to as CaptureTarget }]
  })
  return { inbox, templates, history, revision: num(v.revision) ?? 0 }
}

function mergeById<T extends { id: string; updatedAt: number }>(a: T[], b: T[]): T[] {
  const byId = new Map(a.map((x) => [x.id, x]))
  for (const x of b) {
    const mine = byId.get(x.id)
    if (!mine || x.updatedAt > mine.updatedAt) byId.set(x.id, x)
  }
  return [...byId.values()]
}

export function mergeCaptures(a: CapturesState, b: CapturesState): CapturesState {
  const history = new Map([...a.history, ...b.history].map((h) => [h.id, h]))
  return {
    inbox: mergeById(a.inbox, b.inbox).sort((x, y) => y.createdAt - x.createdAt),
    templates: mergeById(a.templates, b.templates),
    history: [...history.values()].sort((x, y) => y.at - x.at).slice(0, MAX_CAPTURE_HISTORY),
    revision: Math.max(a.revision, b.revision),
  }
}

/** Idea or task by its first word, link when it holds a web address, else text. */
export function guessInboxKind(text: string): InboxKind {
  const t = text.trim()
  if (/^idee\b/i.test(t)) return 'idea'
  if (/^(taak|todo|to do)\b/i.test(t)) return 'task'
  return firstLink(t) ? 'link' : 'text'
}

/** The first web address in [text], for "Openen". Only http(s). */
export function firstLink(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"']+/i)
  return m ? m[0].replace(/[.,;:!?)]+$/, '') : null
}

const firstLine = (text: string) => (text.trim().split('\n')[0] ?? '').slice(0, 120)

/** Puts [text] in Te sorteren. */
export function addToInbox(state: CapturesState, text: string, id: string, now: number): CapturesState {
  const entry: InboxCapture = { id, kind: guessInboxKind(text), text: text.trim().slice(0, MAX_TEXT), createdAt: now, sortedTo: null, updatedAt: now, deletedAt: null }
  return logCapture({ ...state, inbox: [entry, ...state.inbox] }, text, 'later', `log-${id}`, now)
}

/** Remembers a capture in Geschiedenis. */
export function logCapture(state: CapturesState, text: string, to: CaptureTarget, id: string, now: number): CapturesState {
  if (state.history.some((h) => h.id === id)) return state
  return { ...state, history: [{ id, at: now, title: firstLine(text), to }, ...state.history].slice(0, MAX_CAPTURE_HISTORY) }
}

/** Marks an entry of Te sorteren as sorted into [to]. */
export function sortCapture(state: CapturesState, id: string, to: CaptureKind, now: number): CapturesState {
  const entry = state.inbox.find((i) => i.id === id)
  if (!entry) return state
  const next = { ...state, inbox: state.inbox.map((i) => (i.id === id ? { ...i, sortedTo: to, updatedAt: now } : i)) }
  return logCapture(next, entry.text, to, `sort-${id}`, now)
}

export function removeCapture(state: CapturesState, id: string, now: number): CapturesState {
  return { ...state, inbox: state.inbox.map((i) => (i.id === id ? { ...i, deletedAt: now, updatedAt: now } : i)) }
}

/** What still needs sorting, newest first. */
export const unsorted = (state: CapturesState) => state.inbox.filter((i) => i.deletedAt === null && i.sortedTo === null).sort((a, b) => b.createdAt - a.createdAt)

export const liveTemplates = (state: CapturesState) => state.templates.filter((t) => t.deletedAt === null).sort((a, b) => a.name.localeCompare(b.name, 'nl'))

export function saveTemplate(state: CapturesState, template: Pick<CaptureTemplate, 'id' | 'name' | 'text' | 'target'>, now: number): CapturesState | { error: string } {
  const name = template.name.trim().slice(0, MAX_NAME)
  if (!name) return { error: 'Geef het sjabloon een naam.' }
  if (!template.text.trim()) return { error: 'Een sjabloon heeft tekst nodig.' }
  const exists = state.templates.some((t) => t.id === template.id)
  if (!exists && liveTemplates(state).length >= MAX_CAPTURE_TEMPLATES) return { error: `Hoogstens ${MAX_CAPTURE_TEMPLATES} sjablonen.` }
  const entry: CaptureTemplate = { id: template.id, name, text: template.text.slice(0, MAX_TEXT), target: template.target, updatedAt: now, deletedAt: null }
  return { ...state, templates: exists ? state.templates.map((t) => (t.id === template.id ? entry : t)) : [...state.templates, entry] }
}

export function removeTemplate(state: CapturesState, id: string, now: number): CapturesState {
  return { ...state, templates: state.templates.map((t) => (t.id === id ? { ...t, deletedAt: now, updatedAt: now } : t)) }
}

/** Drops sorted and deleted entries after 30 days and keeps Te sorteren within its limit. */
export function tidyCaptures(state: CapturesState, now: number): CapturesState {
  const keep = state.inbox.filter((i) => (i.deletedAt === null && i.sortedTo === null) || now - i.updatedAt < KEEP_MS)
  const open = keep.filter((i) => i.deletedAt === null && i.sortedTo === null).sort((a, b) => b.createdAt - a.createdAt)
  const tooMany = new Set(open.slice(MAX_CAPTURE_INBOX).map((i) => i.id))
  const inbox = keep.filter((i) => !tooMany.has(i.id))
  return inbox.length === state.inbox.length ? state : { ...state, inbox }
}
