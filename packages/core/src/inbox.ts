/**
 * NEXUS Universal Inbox (blueprint module 2): one place for what NEXUS reports, with read,
 * archive and snooze. Items come from the event bus (fase 0), pass a per-source policy and are
 * kept once per event id, also across devices. Pure logic; the web app stores and syncs.
 */
import { toEvent, type EventPriority, type EventSource, type NexusEvent } from './events'

export interface InboxEntry extends NexusEvent {
  readAt: number | null
  archivedAt: number | null
  /** Hidden from the Inbox until then (Gepland). */
  snoozedUntil: number | null
  /** Last change to read/archive/snooze, for merging copies. */
  updatedAt: number
}

/** Which sources may put something in the Inbox; all on unless switched off. */
export type InboxPolicy = Partial<Record<EventSource, boolean>>

export const INBOX_SOURCES: Array<{ source: EventSource; title: string }> = [
  { source: 'deadline', title: 'Deadlines' },
  { source: 'flow', title: 'Flow Studio' },
  { source: 'update', title: 'Updates' },
  { source: 'device', title: 'Apparaten' },
  { source: 'study_group', title: 'Studiegroep' },
  { source: 'bridge', title: 'Bridge' },
  { source: 'suggestion', title: 'Voorstellen' },
  { source: 'system', title: 'NEXUS' },
]

/** Event types that only matter in the moment and never go in the Inbox. */
const NOT_FOR_INBOX = new Set(['space.opened'])

export const INBOX_MAX = 500

export function allowedInInbox(event: NexusEvent, policy: InboxPolicy): boolean {
  return !NOT_FOR_INBOX.has(event.type) && policy[event.source] !== false
}

/** Adds the events that are new and allowed; an id already in the Inbox never comes twice. */
export function ingest(items: InboxEntry[], events: NexusEvent[], policy: InboxPolicy): InboxEntry[] {
  const known = new Set(items.map((i) => i.id))
  const added = events
    .filter((e) => !known.has(e.id) && allowedInInbox(e, policy) && (known.add(e.id), true))
    .map((e): InboxEntry => ({ ...e, readAt: null, archivedAt: null, snoozedUntil: null, updatedAt: e.at }))
  if (added.length === 0) return items
  return trim([...added, ...items])
}

function trim(items: InboxEntry[]): InboxEntry[] {
  if (items.length <= INBOX_MAX) return sortItems(items)
  // Drop the oldest archived first, then the oldest of the rest.
  const sorted = sortItems(items)
  const keep = sorted.filter((i) => i.archivedAt === null)
  const archived = sorted.filter((i) => i.archivedAt !== null)
  return sortItems([...keep, ...archived].slice(0, INBOX_MAX))
}

const sortItems = (items: InboxEntry[]) => [...items].sort((a, b) => b.at - a.at || a.id.localeCompare(b.id))

export type InboxView = 'inbox' | 'priority' | 'scheduled' | 'archive'

export interface InboxFilter {
  source?: EventSource | null
  priority?: EventPriority | null
  unreadOnly?: boolean
  deviceId?: string | null
}

const isSnoozed = (i: InboxEntry, now: number) => i.snoozedUntil !== null && i.snoozedUntil > now

export function inboxView(items: InboxEntry[], view: InboxView, now: number, filter: InboxFilter = {}): InboxEntry[] {
  return items.filter((i) => {
    const inView =
      view === 'archive'
        ? i.archivedAt !== null
        : view === 'scheduled'
          ? i.archivedAt === null && isSnoozed(i, now)
          : i.archivedAt === null && !isSnoozed(i, now) && (view === 'inbox' || i.priority === 'high')
    if (!inView) return false
    if (filter.source && i.source !== filter.source) return false
    if (filter.priority && i.priority !== filter.priority) return false
    if (filter.unreadOnly && i.readAt !== null) return false
    if (filter.deviceId && i.deviceId !== filter.deviceId) return false
    return true
  })
}

export function unreadCount(items: InboxEntry[], now: number): number {
  return inboxView(items, 'inbox', now, { unreadOnly: true }).length
}

type Change = { read?: boolean; archived?: boolean; snoozedUntil?: number | null }

/** Changes the given items at once (bulk archive, snooze, mark read). */
export function changeItems(items: InboxEntry[], ids: string[], change: Change, now: number): InboxEntry[] {
  const pick = new Set(ids)
  return items.map((i) => {
    if (!pick.has(i.id)) return i
    const next = { ...i, updatedAt: now }
    if (change.read !== undefined) next.readAt = change.read ? (i.readAt ?? now) : null
    if (change.archived !== undefined) next.archivedAt = change.archived ? (i.archivedAt ?? now) : null
    if (change.snoozedUntil !== undefined) next.snoozedUntil = change.snoozedUntil
    return next
  })
}

/** Both copies of the Inbox together: per item the newest change wins. */
export function mergeInbox(a: InboxEntry[], b: InboxEntry[]): InboxEntry[] {
  const byId = new Map<string, InboxEntry>()
  for (const i of [...a, ...b]) {
    const old = byId.get(i.id)
    if (!old || i.updatedAt > old.updatedAt) byId.set(i.id, i)
  }
  return trim([...byId.values()])
}

export function toInboxEntry(raw: unknown): InboxEntry | null {
  const event = toEvent(raw)
  if (!event) return null
  const r = raw as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  return { ...event, readAt: num(r.readAt), archivedAt: num(r.archivedAt), snoozedUntil: num(r.snoozedUntil), updatedAt: num(r.updatedAt) ?? event.at }
}

/** "Morgen 08:00" and "Over 1 uur", as moments. */
export function snoozeTimes(now: number): Array<{ label: string; until: number }> {
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(8, 0, 0, 0)
  const nextWeek = new Date(now)
  nextWeek.setDate(nextWeek.getDate() + ((8 - nextWeek.getDay()) % 7 || 7))
  nextWeek.setHours(8, 0, 0, 0)
  return [
    { label: 'Over 1 uur', until: now + 3_600_000 },
    { label: 'Morgen 08:00', until: tomorrow.getTime() },
    { label: 'Maandag 08:00', until: nextWeek.getTime() },
  ]
}

/** The deadline events to publish: due within a day (once per due time) or overdue. */
export function deadlineEvents(deadlines: Array<{ id: string; title: string; dueAt: number }>, now: number): Array<Omit<NexusEvent, 'version'>> {
  const DAY = 86_400_000
  return deadlines
    .filter((d) => d.dueAt - now <= DAY && d.dueAt > now - DAY)
    .map((d) => {
      const overdue = d.dueAt <= now
      return {
        id: `deadline:${d.id}@${d.dueAt}${overdue ? ':over' : ''}`,
        source: 'deadline' as const,
        type: overdue ? 'deadline.overdue' : 'deadline.soon',
        at: overdue ? d.dueAt : Math.max(d.dueAt - DAY, now - DAY),
        title: overdue ? `Deadline verstreken: ${d.title}` : `Deadline binnen een dag: ${d.title}`,
        priority: 'high' as const,
        link: { app: 'agenda' as const, id: d.id },
      }
    })
}
