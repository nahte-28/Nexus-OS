/**
 * Zoeken overal: one search over apps, notes, files, the agenda and reminders. Pure logic; the
 * search window gathers the sources and opens what you pick.
 */
import type { AppId } from './windows'
import { noteTitle, type Note } from './notes'
import type { FileMeta } from './files'
import type { LifeItem } from './life'
import type { Reminder } from './reminders'

export type SearchKind = 'action' | 'app' | 'note' | 'file' | 'deadline' | 'appointment' | 'project' | 'reminder' | 'message' | 'setting' | 'command'

export const SEARCH_KIND_LABELS: Record<SearchKind, string> = {
  action: 'Acties',
  app: 'Apps',
  note: 'Notities',
  file: 'Bestanden',
  deadline: 'Deadlines',
  appointment: 'Afspraken',
  project: 'Projecten',
  reminder: 'Herinneringen',
  message: 'Berichten',
  setting: 'Instellingen',
  command: 'Opdrachten',
}

export interface SearchResult {
  kind: SearchKind
  /** The item's own id; for an app its AppId. */
  id: string
  title: string
  detail?: string
  /** The app that opens it. */
  app: AppId
  score: number
}

export interface SearchSources {
  apps: Array<{ id: AppId; title: string }>
  notes: Note[]
  files: FileMeta[]
  life: LifeItem[]
  reminders: Reminder[]
  /** Shortcuts such as "Transactie toevoegen"; the id tells the app what to open. */
  actions?: Array<{ id: string; title: string; app: AppId }>
}

/** Lower case without accents, so "e" finds "é". */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const words = (query: string) => normalize(query).split(/\s+/).filter(Boolean)

/** How well [title] and [body] match all [terms]; 0 when one term is missing. */
function score(terms: string[], title: string, body = ''): number {
  const t = normalize(title)
  const b = normalize(body)
  let total = 0
  for (const term of terms) {
    if (t.startsWith(term)) total += 6
    else if (new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t)) total += 4
    else if (t.includes(term)) total += 3
    else if (b.includes(term)) total += 1
    else return 0
  }
  return total
}

const shortDate = (t: number) => new Date(t).toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** A bit of the text around the first match, for notes. */
function snippet(body: string, term: string): string | undefined {
  const at = normalize(body).indexOf(term)
  if (at < 0) return undefined
  const start = Math.max(0, at - 30)
  return `${start > 0 ? '…' : ''}${body.slice(start, at + 60).replace(/\s+/g, ' ').trim()}…`
}

/** Everything that matches every word of [query], best first; at most [limit]. */
export function searchAll(query: string, s: SearchSources, now = Date.now(), limit = 40): SearchResult[] {
  const terms = words(query)
  if (terms.length === 0) return []
  const out: SearchResult[] = []
  const add = (r: Omit<SearchResult, 'score'>, value: number) => value > 0 && out.push({ ...r, score: value })

  for (const a of s.apps) {
    const value = score(terms, a.title)
    add({ kind: 'app', id: a.id, title: a.title, app: a.id }, value && value + 2)
  }
  for (const a of s.actions ?? []) {
    const value = score(terms, a.title)
    add({ kind: 'action', id: a.id, title: a.title, app: a.app }, value && value + 1)
  }
  for (const n of s.notes) {
    if (n.deletedAt !== null) continue
    const value = score(terms, noteTitle(n), n.body)
    add({ kind: 'note', id: n.id, title: noteTitle(n), detail: snippet(n.body, terms[0]), app: 'notes' }, value)
  }
  for (const f of s.files) add({ kind: 'file', id: f.id, title: f.name, app: 'files' }, score(terms, f.name))
  const projects = new Map(s.life.filter((i) => i.kind === 'project').map((p) => [p.id, p.kind === 'project' ? p.name : '']))
  for (const i of s.life) {
    if (i.deletedAt !== null) continue
    if (i.kind === 'deadline') {
      const project = i.projectId ? projects.get(i.projectId) : undefined
      // Open deadlines come before done ones.
      const value = score(terms, i.title, `${i.notes} ${project ?? ''}`)
      add({ kind: 'deadline', id: i.id, title: i.title, detail: `${i.doneAt !== null ? 'Klaar · ' : ''}${shortDate(i.dueAt)}${project ? ` · ${project}` : ''}`, app: 'agenda' }, value && value + (i.doneAt === null ? 1 : 0))
    } else if (i.kind === 'appointment') {
      const value = score(terms, i.title, `${i.location} ${i.notes}`)
      add({ kind: 'appointment', id: i.id, title: i.title, detail: [shortDate(i.startAt), i.location].filter(Boolean).join(' · '), app: 'agenda' }, value && value + (i.endAt >= now ? 1 : 0))
    } else {
      add({ kind: 'project', id: i.id, title: i.name, app: 'agenda' }, score(terms, i.name))
    }
  }
  for (const r of s.reminders) add({ kind: 'reminder', id: r.id, title: r.title, detail: shortDate(r.at), app: 'reminders' }, score(terms, r.title, r.text ?? ''))

  return out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'nl')).slice(0, limit)
}

/** A teamchat message or privébericht to search; [text] is already opened on this device. */
export interface SearchableMessage {
  id: string
  kind: 'team' | 'dm'
  /** The team, or the friend you write with. */
  where: string
  /** What opens it: 'chat:<team id>' or 'dm:<friend id>'. */
  open: string
  /** Who wrote it, for the line under the result. */
  from: string
  text: string
  at: number
}

/** Messages that match every word of [query], newest first among equals; at most [limit]. */
export function messageResults(query: string, messages: SearchableMessage[], limit = 8): SearchResult[] {
  const terms = words(query)
  if (terms.length === 0) return []
  return messages
    .map((m) => ({ m, value: score(terms, '', m.text) }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value || b.m.at - a.m.at)
    .slice(0, limit)
    .map(({ m, value }) => ({
      kind: 'message' as const,
      // Unique per message; the app reads the part before the last ':' ([m.open]).
      id: `${m.open}:${m.id}`,
      title: `${m.where}: ${snippet(m.text, terms[0]) ?? m.text.slice(0, 80)}`,
      detail: `${m.from} · ${shortDate(m.at)}`,
      app: m.kind === 'team' ? ('teams' as const) : ('friends' as const),
      score: value,
    }))
}

/** What a found message opens: the team chat or the conversation with a friend; null for anything else. */
export function parseMessageOpen(id: string | null): { kind: 'chat' | 'dm'; id: string } | null {
  const m = id ? /^(chat|dm):([^:]+)/.exec(id) : null
  return m ? { kind: m[1] as 'chat' | 'dm', id: m[2] } : null
}
