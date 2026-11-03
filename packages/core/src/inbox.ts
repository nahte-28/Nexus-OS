/**
 * NEXUS Universal Inbox (blueprint module 2): one place for what NEXUS reports, with read,
 * archive and snooze. Items come from the event bus (fase 0), pass a per-source rule and are
 * kept once per event id, also across devices. Inbox 2.0 adds rules per source (quiet, own
 * priority, archive after a while), snoozing to any moment, and per item on which device it
 * arrived and was read. Pure logic; the web app stores and syncs.
 */
import { toEvent, type EventPriority, type EventSource, type NexusEvent } from './events'

export interface InboxEntry extends NexusEvent {
  readAt: number | null
  archivedAt: number | null
  /** Hidden from the Inbox until then (Gepland). */
  snoozedUntil: number | null
  /** Last change to read/archive/snooze, for merging copies. */
  updatedAt: number
  /** Per device (its name): when the item arrived there and when it was read there. */
  delivery: InboxDelivery
}

export type InboxDelivery = Record<string, { seenAt: number; readAt?: number }>

/**
 * on: comes in as reported. quiet: comes in already read, so it never counts as new.
 * off: stays out. [priority] replaces the priority of the source; [archiveAfterDays] archives
 * items of the source by themselves once they are that old.
 */
export interface InboxRule {
  mode: 'on' | 'quiet' | 'off'
  priority: EventPriority | 'keep'
  archiveAfterDays: number | null
}

/** The rule per source; a missing source is on. A boolean is the switch of Inbox 1.0. */
export type InboxPolicy = Partial<Record<EventSource, boolean | InboxRule>>

export const DEFAULT_RULE: InboxRule = { mode: 'on', priority: 'keep', archiveAfterDays: null }
export const ARCHIVE_AFTER_DAYS = [1, 7, 30]

export function ruleFor(policy: InboxPolicy, source: EventSource): InboxRule {
  const r = policy[source]
  if (r === false) return { ...DEFAULT_RULE, mode: 'off' }
  if (typeof r !== 'object' || r === null) return DEFAULT_RULE
  return {
    mode: r.mode === 'quiet' || r.mode === 'off' ? r.mode : 'on',
    priority: r.priority === 'low' || r.priority === 'normal' || r.priority === 'high' ? r.priority : 'keep',
    archiveAfterDays: ARCHIVE_AFTER_DAYS.includes(r.archiveAfterDays as number) ? r.archiveAfterDays : null,
  }
}

export function parseInboxPolicy(raw: unknown): InboxPolicy {
  const out: InboxPolicy = {}
  if (typeof raw !== 'object' || raw === null) return out
  for (const { source } of INBOX_SOURCES) {
    const v = (raw as Record<string, unknown>)[source]
    if (v === undefined) continue
    const rule = ruleFor({ [source]: v } as InboxPolicy, source)
    if (JSON.stringify(rule) !== JSON.stringify(DEFAULT_RULE)) out[source] = rule
  }
  return out
}

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
  return !NOT_FOR_INBOX.has(event.type) && ruleFor(policy, event.source).mode !== 'off'
}

/**
 * Adds the events that are new and allowed, with the rule of their source applied; an id already
 * in the Inbox never comes twice. [device] is this device, which saw them arrive.
 */
export function ingest(items: InboxEntry[], events: NexusEvent[], policy: InboxPolicy, device?: string): InboxEntry[] {
  const known = new Set(items.map((i) => i.id))
  const added = events
    .filter((e) => !known.has(e.id) && allowedInInbox(e, policy) && (known.add(e.id), true))
    .map((e): InboxEntry => {
      const rule = ruleFor(policy, e.source)
      const quiet = rule.mode === 'quiet'
      return {
        ...e,
        priority: rule.priority === 'keep' ? e.priority : rule.priority,
        readAt: quiet ? e.at : null,
        archivedAt: null,
        snoozedUntil: null,
        updatedAt: e.at,
        delivery: device ? { [device]: { seenAt: e.at, ...(quiet ? { readAt: e.at } : {}) } } : {},
      }
    })
  if (added.length === 0) return items
  return trim([...added, ...items])
}

/** The items a rule archives by itself now: older than its days and not archived yet. */
export function dueForArchive(items: InboxEntry[], policy: InboxPolicy, now: number): string[] {
  return items
    .filter((i) => {
      if (i.archivedAt !== null) return false
      const days = ruleFor(policy, i.source).archiveAfterDays
      return days !== null && i.at <= now - days * 86_400_000
    })
    .map((i) => i.id)
}

/** At most this many devices per item, so a row stays small. */
export const MAX_DELIVERY_DEVICES = 12

const earliest = (a?: number, b?: number) => (a === undefined ? b : b === undefined ? a : Math.min(a, b))

/** Both delivery records together: per device the first arrival and the first read. */
export function mergeDelivery(a: InboxDelivery, b: InboxDelivery): InboxDelivery {
  const out: InboxDelivery = {}
  for (const name of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const seenAt = earliest(a[name]?.seenAt, b[name]?.seenAt) as number
    const readAt = earliest(a[name]?.readAt, b[name]?.readAt)
    out[name] = readAt === undefined ? { seenAt } : { seenAt, readAt }
  }
  const names = Object.keys(out)
  if (names.length <= MAX_DELIVERY_DEVICES) return out
  return Object.fromEntries(names.sort((x, y) => out[x].seenAt - out[y].seenAt).slice(0, MAX_DELIVERY_DEVICES).map((n) => [n, out[n]]))
}

/**
 * Notes that this device has the items (after syncing, or when it shows them). Returns the
 * same list when nothing is new. Delivery never changes updatedAt: it is not an edit.
 */
export function markSeen(items: InboxEntry[], device: string, now: number): InboxEntry[] {
  let changed = false
  const next = items.map((i) => {
    if (i.delivery[device]) return i
    changed = true
    return { ...i, delivery: mergeDelivery(i.delivery, { [device]: { seenAt: now } }) }
  })
  return changed ? next : items
}

/** Returned from snoozing: it was snoozed, the moment passed and it is still in the Inbox. */
export const backFromSnooze = (i: InboxEntry, now: number) => i.snoozedUntil !== null && i.snoozedUntil <= now && i.archivedAt === null

/** When an item counts as new in the list: an item back from snoozing comes back on top. */
export const shownAt = (i: InboxEntry, now: number) => (backFromSnooze(i, now) ? Math.max(i.at, i.snoozedUntil as number) : i.at)

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
  const list = items.filter((i) => {
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
  if (view === 'scheduled') return list.sort((a, b) => (a.snoozedUntil ?? 0) - (b.snoozedUntil ?? 0))
  return view === 'archive' ? list : list.sort((a, b) => shownAt(b, now) - shownAt(a, now) || a.id.localeCompare(b.id))
}

export function unreadCount(items: InboxEntry[], now: number): number {
  return inboxView(items, 'inbox', now, { unreadOnly: true }).length
}

type Change = { read?: boolean; archived?: boolean; snoozedUntil?: number | null }

/**
 * Changes the given items at once (bulk archive, snooze, mark read). Snoozing makes an item
 * unread again, so it comes back as new. [device] is where it was read.
 */
export function changeItems(items: InboxEntry[], ids: string[], change: Change, now: number, device?: string): InboxEntry[] {
  const pick = new Set(ids)
  return items.map((i) => {
    if (!pick.has(i.id)) return i
    const next = { ...i, updatedAt: now }
    if (change.snoozedUntil !== undefined) {
      next.snoozedUntil = change.snoozedUntil
      if (change.snoozedUntil !== null && change.snoozedUntil > now) next.readAt = null
    }
    if (change.read !== undefined) next.readAt = change.read ? (i.readAt ?? now) : null
    if (change.archived !== undefined) next.archivedAt = change.archived ? (i.archivedAt ?? now) : null
    if (change.read && device && !i.delivery[device]?.readAt) next.delivery = mergeDelivery(i.delivery, { [device]: { seenAt: now, readAt: now } })
    return next
  })
}

/** Both copies of the Inbox together: per item the newest change wins; deliveries add up. */
export function mergeInbox(a: InboxEntry[], b: InboxEntry[]): InboxEntry[] {
  const byId = new Map<string, InboxEntry>()
  for (const i of [...a, ...b]) {
    const old = byId.get(i.id)
    if (!old) byId.set(i.id, i)
    else {
      const win = i.updatedAt > old.updatedAt ? i : old
      const delivery = mergeDelivery(old.delivery, i.delivery)
      byId.set(i.id, sameDelivery(delivery, win.delivery) ? win : { ...win, delivery })
    }
  }
  return trim([...byId.values()])
}

export const sameDelivery = (a: InboxDelivery, b: InboxDelivery) => JSON.stringify(mergeDelivery(a, {})) === JSON.stringify(mergeDelivery(b, {}))

function parseDelivery(raw: unknown): InboxDelivery {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const out: InboxDelivery = {}
  for (const [name, v] of Object.entries(raw)) {
    if (typeof v !== 'object' || v === null || name.length === 0 || name.length > 80) continue
    const { seenAt, readAt } = v as Record<string, unknown>
    if (typeof seenAt !== 'number' || !Number.isFinite(seenAt)) continue
    out[name] = typeof readAt === 'number' && Number.isFinite(readAt) ? { seenAt, readAt } : { seenAt }
  }
  return mergeDelivery(out, {})
}

export function toInboxEntry(raw: unknown): InboxEntry | null {
  const event = toEvent(raw)
  if (!event) return null
  const r = raw as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  return {
    ...event,
    readAt: num(r.readAt),
    archivedAt: num(r.archivedAt),
    snoozedUntil: num(r.snoozedUntil),
    updatedAt: num(r.updatedAt) ?? event.at,
    delivery: parseDelivery(r.delivery),
  }
}

/** "Over 1 uur", "Vanavond 19:00", "Morgen 08:00" and "Maandag 08:00", as moments. */
export function snoozeTimes(now: number): Array<{ label: string; until: number }> {
  const evening = new Date(now)
  evening.setHours(19, 0, 0, 0)
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(8, 0, 0, 0)
  const nextWeek = new Date(now)
  nextWeek.setDate(nextWeek.getDate() + ((8 - nextWeek.getDay()) % 7 || 7))
  nextWeek.setHours(8, 0, 0, 0)
  return [
    { label: 'Over 1 uur', until: now + 3_600_000 },
    // Only while there is more than an hour left until then.
    ...(evening.getTime() - now > 3_600_000 ? [{ label: 'Vanavond 19:00', until: evening.getTime() }] : []),
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
        correlationId: `deadline:${d.id}`,
      }
    })
}

/** The rules as one synced document (user_settings key 'inbox'); the last change wins. */
export interface InboxRulesState {
  rules: InboxPolicy
  updatedAt: number
  revision: number
}

export function parseInboxRules(raw: unknown): InboxRulesState {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  return { rules: parseInboxPolicy(r.rules), updatedAt: num(r.updatedAt), revision: num(r.revision) }
}

export const mergeInboxRules = (a: InboxRulesState, b: InboxRulesState): InboxRulesState => (b.updatedAt > a.updatedAt ? b : a)
