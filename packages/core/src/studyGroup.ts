/**
 * Studiegroep: a small group of friends who see each other's deadlines, exams and planned study
 * time. You choose per item what goes to the group; NEXUS keeps that copy up to date with your
 * Agenda and nothing else is shared. Pure logic; the web app talks to Supabase.
 */
import { EXAM_NOTE } from './exams'
import { STUDY_BLOCK_NOTE } from './study'
import type { LifeItem } from './life'

export type SharedKind = 'deadline' | 'exam' | 'study'

/** What one member shares with a group, as the group sees it. */
export interface SharedItem {
  groupId: string
  userId: string
  /** The id of the deadline or appointment in the owner's Agenda. */
  sourceId: string
  kind: SharedKind
  title: string
  at: number
  endAt: number | null
  done: boolean
}

export interface StudyGroup {
  id: string
  name: string
  inviteCode: string
  createdBy: string
}

export interface GroupMember {
  groupId: string
  userId: string
  displayName: string
}

export const GROUP_NAME_MAX = 60
export const DISPLAY_NAME_MAX = 40
export const GROUP_MEMBERS_MAX = 30
/** Shared items older than this drop off the group feed. */
export const SHARED_PAST_MS = 24 * 60 * 60_000

export const SHARED_KIND_LABELS: Record<SharedKind, string> = { deadline: 'Deadline', exam: 'Examen', study: 'Studeert' }

/** Invite codes are 8 letters and digits without look-alikes; spaces, dashes and case don't matter. */
export function normalizeInvite(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[\s-]/g, '')
  return /^[A-HJ-NP-Z2-9]{8}$/.test(code) ? code : null
}

export const formatInvite = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`

/** The part of the Agenda you may share, as it would look in the group; null for anything else. */
export function shareable(item: LifeItem, now: number): Omit<SharedItem, 'groupId' | 'userId'> | null {
  if (item.deletedAt !== null) return null
  if (item.kind === 'deadline') {
    if (item.dueAt < now - SHARED_PAST_MS) return null
    return { sourceId: item.id, kind: 'deadline', title: item.title, at: item.dueAt, endAt: null, done: item.doneAt !== null }
  }
  if (item.kind === 'appointment') {
    const kind = item.notes === EXAM_NOTE ? 'exam' : item.notes === STUDY_BLOCK_NOTE ? 'study' : null
    if (!kind || item.endAt < now - SHARED_PAST_MS) return null
    return { sourceId: item.id, kind, title: item.title, at: item.startAt, endAt: item.endAt, done: false }
  }
  return null
}

/** Everything you could share right now, soonest first. Ordinary appointments stay private. */
export function shareableItems(items: LifeItem[], now: number) {
  return items
    .map((i) => shareable(i, now))
    .filter((i): i is NonNullable<typeof i> => i !== null && !(i.kind === 'deadline' && i.done))
    .sort((a, b) => a.at - b.at)
}

/**
 * How to bring your shared copies in line with the Agenda: changed ones to write again, and the
 * ones whose source is gone (deleted, or long past) to take out of the group.
 */
export function reconcileShared(mine: SharedItem[], items: LifeItem[], now: number): { put: SharedItem[]; remove: SharedItem[] } {
  const byId = new Map(items.map((i) => [i.id, i]))
  const put: SharedItem[] = []
  const remove: SharedItem[] = []
  for (const s of mine) {
    const source = byId.get(s.sourceId)
    const current = source ? shareable(source, now) : null
    if (!current) {
      remove.push(s)
      continue
    }
    if (current.title !== s.title || current.at !== s.at || current.endAt !== s.endAt || current.done !== s.done || current.kind !== s.kind) {
      put.push({ ...s, ...current })
    }
  }
  return { put, remove }
}

export interface FeedDay {
  day: number
  entries: Array<SharedItem & { who: string; mine: boolean }>
}

/** The group's shared items from today on, per day, with who shared them. */
export function groupFeed(items: SharedItem[], members: GroupMember[], me: string, now: number): FeedDay[] {
  const names = new Map(members.map((m) => [m.userId, m.displayName]))
  const days = new Map<number, FeedDay>()
  for (const item of [...items].sort((a, b) => a.at - b.at || a.title.localeCompare(b.title))) {
    if ((item.endAt ?? item.at) < now - SHARED_PAST_MS) continue
    const d = new Date(item.at)
    d.setHours(0, 0, 0, 0)
    const day = d.getTime()
    if (!days.has(day)) days.set(day, { day, entries: [] })
    days.get(day)!.entries.push({ ...item, who: item.userId === me ? 'Jij' : (names.get(item.userId) ?? 'Oud lid'), mine: item.userId === me })
  }
  return [...days.values()]
}

/** Deadlines of others that are also in your Agenda (same title and time) need no "Overnemen". */
export function alreadyInAgenda(item: Pick<SharedItem, 'title' | 'at'>, items: LifeItem[]): boolean {
  const title = item.title.trim().toLowerCase()
  return items.some((i) => i.kind === 'deadline' && i.deletedAt === null && i.dueAt === item.at && i.title.trim().toLowerCase() === title)
}
