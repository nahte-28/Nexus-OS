/**
 * Wie is er online: friends and teammates see whether NEXUS is open on one of your devices, and an
 * optional short status. NEXUS pings while it is open and visible; you count as online for a few
 * minutes after the last ping. Pure logic: the labels and the order.
 */

export type PresenceState = 'available' | 'busy' | 'invisible'
/** What others see: invisible shows as offline. */
export type SeenState = 'available' | 'busy' | 'offline'

export const PRESENCE_NOTE_MAX = 60
/** NEXUS pings every minute while open; three missed pings and you are offline. */
export const PRESENCE_PING_MS = 60_000
export const PRESENCE_ONLINE_MS = 3 * 60_000

export interface PresenceEntry {
  userId: string
  state: SeenState
  note: string | null
  lastSeen: number | null
}

export type PresenceStatus = 'online' | 'busy' | 'offline'

/** Online or busy only while the last ping is recent; otherwise offline. */
export function presenceStatus(entry: PresenceEntry | undefined, now: number): PresenceStatus {
  if (!entry || entry.state === 'offline' || entry.lastSeen === null || now - entry.lastSeen > PRESENCE_ONLINE_MS) return 'offline'
  return entry.state === 'busy' ? 'busy' : 'online'
}

/** "Online", "Bezet", "Laatst gezien 5 min geleden", "Laatst gezien gisteren", "Offline". */
export function presenceLabel(entry: PresenceEntry | undefined, now: number): string {
  const status = presenceStatus(entry, now)
  if (status === 'online') return 'Online'
  if (status === 'busy') return 'Bezet'
  if (!entry?.lastSeen) return 'Offline'
  const minutes = Math.max(1, Math.floor((now - entry.lastSeen) / 60_000))
  if (minutes < 60) return `Laatst gezien ${minutes} min geleden`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Laatst gezien ${hours} uur geleden`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Laatst gezien gisteren'
  if (days < 7) return `Laatst gezien ${days} dagen geleden`
  return 'Offline'
}

/** One line, at most [PRESENCE_NOTE_MAX] characters; empty becomes null. */
export function cleanPresenceNote(raw: string): string | null {
  const note = raw.replace(/\s+/g, ' ').trim().slice(0, PRESENCE_NOTE_MAX).trim()
  return note || null
}

/** Online first, then busy, then offline; keeps the given order inside each group. */
export function byPresence<T extends { userId: string }>(list: T[], presence: Map<string, PresenceEntry>, now: number): T[] {
  const order: Record<PresenceStatus, number> = { online: 0, busy: 1, offline: 2 }
  return list
    .map((item, i) => ({ item, i, rank: order[presenceStatus(presence.get(item.userId), now)] }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.item)
}

/** How many of [userIds] are online or busy right now. */
export function onlineCount(userIds: string[], presence: Map<string, PresenceEntry>, now: number): number {
  return userIds.filter((id) => presenceStatus(presence.get(id), now) !== 'offline').length
}
