/**
 * Afspraak met vrienden: you invite friends to one of your appointments. The invite on the server
 * holds a copy of the details; a friend who accepts gets their own copy in their Agenda, which
 * follows when you change or cancel the appointment. Pure logic: what to change in the Agenda.
 */
import { uuidFromHex } from './classAgenda'
import type { Appointment, AppointmentDraft, LifeItem } from './life'

export type InviteStatus = 'invited' | 'accepted' | 'declined' | 'cancelled'
export const INVITE_STATUSES: InviteStatus[] = ['invited', 'accepted', 'declined', 'cancelled']

export interface AppointmentInvite {
  id: string
  /** host: you invited; guest: you were invited. */
  side: 'host' | 'guest'
  /** The appointment's id in the host's Agenda. */
  hostItem: string
  /** The other person: the friend you invited, or who invited you. */
  other: string
  otherName: string
  title: string
  startAt: number
  endAt: number
  location: string
  notes: string
  status: InviteStatus
  updatedAt: number
}

export const INVITE_NOTES_MAX = 1000
export const INVITE_MAX_FRIENDS = 20

const time = (v: unknown) => (typeof v === 'string' ? Date.parse(v) : typeof v === 'number' ? v : NaN)
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')

export function parseInvite(raw: unknown): AppointmentInvite | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const startAt = time(r.startAt)
  const endAt = time(r.endAt)
  if (typeof r.id !== 'string' || (r.side !== 'host' && r.side !== 'guest') || typeof r.hostItem !== 'string' || typeof r.other !== 'string') return null
  if (!INVITE_STATUSES.includes(r.status as InviteStatus) || !Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt < startAt) return null
  const title = text(r.title, 160).trim()
  if (!title) return null
  const updatedAt = time(r.updatedAt)
  return {
    id: r.id,
    side: r.side,
    hostItem: r.hostItem,
    other: r.other,
    otherName: text(r.otherName, 40).trim() || 'Iemand',
    title,
    startAt,
    endAt,
    location: text(r.location, 200),
    notes: text(r.notes, INVITE_NOTES_MAX),
    status: r.status as InviteStatus,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
  }
}

export function parseInvites(raw: unknown): AppointmentInvite[] {
  return (Array.isArray(raw) ? raw : []).map(parseInvite).filter((i): i is AppointmentInvite => i !== null)
}

/** The id of your copy of an invite in your Agenda: the same on every device. */
export async function inviteCopyId(inviteId: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`nexus-uitnodiging|${inviteId}`)))
  return uuidFromHex([...bytes].map((b) => b.toString(16).padStart(2, '0')).join(''))
}

/** The first line of the notes of your copy, so you see who invited you. */
export const inviteFrom = (name: string) => `Uitnodiging van ${name}.`

/** What your copy of an accepted invite looks like in your Agenda. */
export function inviteCopy(invite: AppointmentInvite): Pick<AppointmentDraft, 'title' | 'startAt' | 'endAt' | 'location' | 'notes'> {
  return {
    title: invite.title,
    startAt: invite.startAt,
    endAt: invite.endAt,
    location: invite.location,
    notes: invite.notes ? `${inviteFrom(invite.otherName)}\n${invite.notes}` : inviteFrom(invite.otherName),
  }
}

/** What an invite sends of your appointment: the details, without your reminders. */
export function inviteDetails(a: Pick<Appointment, 'title' | 'startAt' | 'endAt' | 'location' | 'notes'>) {
  return { title: a.title.trim().slice(0, 160), startAt: a.startAt, endAt: a.endAt, location: a.location.slice(0, 200), notes: a.notes.slice(0, INVITE_NOTES_MAX) }
}

type Details = ReturnType<typeof inviteDetails>
const same = (a: Details, b: Details) => a.title === b.title && a.startAt === b.startAt && a.endAt === b.endAt && a.location === b.location && a.notes === b.notes

/** Only a single appointment can be shared; a series cannot (yet). */
export const canInvite = (a: Pick<Appointment, 'repeat'>) => !a.repeat

export interface CopyPlan {
  add: Array<{ id: string; invite: string; copy: ReturnType<typeof inviteCopy> }>
  update: Array<{ id: string; patch: ReturnType<typeof inviteCopy> }>
  remove: string[]
  /** Invites you accepted but whose copy you deleted from your Agenda: answered as declined. */
  decline: string[]
}

/**
 * Brings your copies in line with the invites you got: an accepted one is in your Agenda with the
 * host's latest details, any other one is not. Deleting your copy declines the invite.
 */
export function planInviteCopies(invites: AppointmentInvite[], life: LifeItem[], copyIdOf: Record<string, string>): CopyPlan {
  const records = new Map(life.map((i) => [i.id, i]))
  const plan: CopyPlan = { add: [], update: [], remove: [], decline: [] }
  for (const inv of invites) {
    if (inv.side !== 'guest') continue
    const id = copyIdOf[inv.id]
    if (!id) continue
    const copy = records.get(id)
    const want = inviteCopy(inv)
    if (inv.status !== 'accepted') {
      if (copy && copy.deletedAt === null) plan.remove.push(id)
      continue
    }
    if (!copy || (copy.deletedAt !== null && copy.deletedAt <= inv.updatedAt)) {
      plan.add.push({ id, invite: inv.id, copy: want })
    } else if (copy.deletedAt !== null) {
      plan.decline.push(inv.id)
    } else if (copy.kind === 'appointment' && !same(inviteDetails(copy), inviteDetails(want))) {
      plan.update.push({ id, patch: want })
    }
  }
  return plan
}

export interface HostPlan {
  update: Array<{ item: string } & Details>
  /** Your appointments that are gone: their invites are taken back. */
  cancel: string[]
}

/** Your own appointments with invites: changed ones send their new details, deleted ones cancel. */
export function planHostChanges(invites: AppointmentInvite[], life: LifeItem[]): HostPlan {
  const records = new Map(life.map((i) => [i.id, i]))
  const plan: HostPlan = { update: [], cancel: [] }
  const byItem = new Map<string, AppointmentInvite[]>()
  for (const inv of invites) if (inv.side === 'host' && inv.status !== 'cancelled') byItem.set(inv.hostItem, [...(byItem.get(inv.hostItem) ?? []), inv])
  for (const [item, list] of byItem) {
    const a = records.get(item)
    // Not on this device yet (still syncing): leave it.
    if (!a) continue
    if (a.deletedAt !== null || a.kind !== 'appointment' || !canInvite(a)) {
      plan.cancel.push(item)
      continue
    }
    const details = inviteDetails(a)
    if (list.some((inv) => !same(inviteDetails(inv), details))) plan.update.push({ item, ...details })
  }
  return plan
}

/** The invites you sent for one of your appointments, by friend. */
export const invitesFor = (invites: AppointmentInvite[], item: string) => invites.filter((i) => i.side === 'host' && i.hostItem === item)

/** Invites that wait for your answer and are not over yet, soonest first. */
export const openInvites = (invites: AppointmentInvite[], now: number) =>
  invites.filter((i) => i.side === 'guest' && i.status === 'invited' && i.endAt > now).sort((a, b) => a.startAt - b.startAt)

export const INVITE_STATUS_LABELS: Record<InviteStatus, string> = { invited: 'uitgenodigd', accepted: 'komt', declined: 'komt niet', cancelled: 'ingetrokken' }
