import {
  DEFAULT_APPOINTMENT_REMIND,
  inviteCopyId,
  openInvites,
  parseInvites,
  planHostChanges,
  planInviteCopies,
  type Appointment,
  type AppointmentInvite,
} from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { logEvent } from '../devtools/log'
import { eventBus } from '../events/bus'
import { friendError } from '../friends/friends'
import { lifeStore, type LifeStore } from '../life/store'
import { showLocalNotification } from '../platform/notify'

export const INVITES_MIGRATION = 'supabase/migrations/20261116180000_appointment_invites.sql'

/** A Dutch message for Afspraak met vrienden; 'setup:<file>' asks for the SQL. */
export function inviteError(error: { code?: string; message?: string } | null | undefined): string {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`
  if (/appointment_invite/i.test(text) && /42P01|42883|PGRST202|PGRST205|could not find the (table|function)|does not exist/i.test(text)) return `setup:${INVITES_MIGRATION}`
  if (/alleen een vriend/i.test(text)) return 'Je kunt alleen een vriend uitnodigen.'
  if (/hoogstens 20/i.test(text)) return 'Je kunt hoogstens 20 vrienden uitnodigen voor één afspraak.'
  if (/200 open/i.test(text)) return 'Je hebt al 200 open uitnodigingen.'
  if (/niet \(meer\)/i.test(text)) return 'Deze uitnodiging is er niet meer.'
  if (/titel, een begin/i.test(text)) return 'Een afspraak heeft een titel, een begin en een einde nodig.'
  return friendError(error)
}

class InviteError extends Error {}
const fail = (error: { code?: string; message?: string }): never => {
  throw new InviteError(inviteError(error))
}
const iso = (t: number) => new Date(t).toISOString()

/** Afspraak met vrienden on Supabase: invites go only through the SQL functions. */
export class AppointmentInvites {
  constructor(private client: SupabaseClient) {}

  async list(): Promise<AppointmentInvite[]> {
    const { data, error } = await this.client.rpc('appointment_invites_list')
    if (error) fail(error)
    return parseInvites(data)
  }

  async invite(friend: string, a: Pick<Appointment, 'id' | 'title' | 'startAt' | 'endAt' | 'location' | 'notes'>): Promise<string> {
    const { data, error } = await this.client.rpc('appointment_invite', { p_friend: friend, p_item: a.id, p_title: a.title, p_start: iso(a.startAt), p_end: iso(a.endAt), p_location: a.location, p_notes: a.notes.slice(0, 1000) })
    if (error) fail(error)
    return String(data)
  }

  async update(item: string, d: { title: string; startAt: number; endAt: number; location: string; notes: string }): Promise<number> {
    const { data, error } = await this.client.rpc('appointment_invite_update', { p_item: item, p_title: d.title, p_start: iso(d.startAt), p_end: iso(d.endAt), p_location: d.location, p_notes: d.notes })
    if (error) fail(error)
    return Number(data)
  }

  /** Takes the invite back for one friend, or for everyone when [friend] is null. */
  async cancel(item: string, friend: string | null): Promise<void> {
    const { error } = await this.client.rpc('appointment_invite_cancel', { p_item: item, p_friend: friend })
    if (error) fail(error)
  }

  async answer(id: string, accept: boolean): Promise<void> {
    const { error } = await this.client.rpc('appointment_invite_answer', { p_id: id, p_accept: accept })
    if (error) fail(error)
  }

  /** Calls [onChange] when one of your invites changes (row level security applies). */
  watch(onChange: () => void): () => void {
    const channel = this.client.channel(`appointment-invites-${Math.random().toString(36).slice(2)}`)
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'appointment_invites' }, () => onChange())
    channel.subscribe()
    return () => void this.client.removeChannel(channel)
  }
}

/** What this device knows of your invites; null until the first list (or without an account). */
interface InvitesState {
  invites: AppointmentInvite[] | null
  /** Your copies in the Agenda, by their id: the invite they come from. */
  copies: Record<string, AppointmentInvite>
  error: string | null
}

let state: InvitesState = { invites: null, copies: {}, error: null }
const listeners = new Set<() => void>()
const set = (next: InvitesState) => {
  state = next
  for (const l of listeners) l()
}

export const invitesStore = {
  getSnapshot: () => state,
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
export const useInvites = () => useSyncExternalStore(invitesStore.subscribe, invitesStore.getSnapshot)
/** For tests. */
export const setInvitesState = (next: Partial<InvitesState>) => set({ ...state, ...next })

export interface InvitesApi {
  api: Pick<AppointmentInvites, 'invite' | 'cancel' | 'answer'>
  refresh: () => Promise<void>
}
let active: InvitesApi | null = null
/** The connection while signed in, for the buttons in the Agenda. */
export const invitesApi = () => active
/** For tests. */
export const setInvitesApi = (next: InvitesApi | null) => {
  active = next
}

/** The invites you already got a notice for, so a new list does not notify again. */
const seen = new Set<string>()

/** One round: reads your invites, keeps your copies in line and sends your own changes. */
export async function syncInvites(api: AppointmentInvites, life: LifeStore = lifeStore, now = Date.now(), notify = true): Promise<AppointmentInvite[]> {
  await life.ready
  let invites = await api.list()
  const host = planHostChanges(invites, life.all())
  for (const u of host.update) {
    const { item, ...details } = u
    await api.update(item, details)
  }
  for (const item of host.cancel) await api.cancel(item, null)
  if (host.update.length || host.cancel.length) invites = await api.list()

  const copyIdOf = Object.fromEntries(await Promise.all(invites.filter((i) => i.side === 'guest').map(async (i) => [i.id, await inviteCopyId(i.id)] as const)))
  const plan = planInviteCopies(invites, life.all(), copyIdOf)
  for (const a of plan.add) await life.addAppointment({ ...a.copy, remind: DEFAULT_APPOINTMENT_REMIND, target: 'phone', repeat: null }, now, { id: a.id })
  for (const u of plan.update) await life.updateAppointment(u.id, u.patch, now)
  for (const id of plan.remove) await life.remove(id, now)
  for (const id of plan.decline) await api.answer(id, false)
  if (plan.decline.length) invites = await api.list()

  for (const inv of invites) {
    const key = `${inv.id}:${inv.status}`
    if (seen.has(key)) continue
    seen.add(key)
    if (!notify) continue
    const incoming = inv.side === 'guest' && inv.status === 'invited' && openInvites([inv], now).length > 0
    const answered = inv.side === 'host' && (inv.status === 'accepted' || inv.status === 'declined') && inv.endAt > now
    if (!incoming && !answered) continue
    const title = incoming ? `${inv.otherName} nodigt je uit: ${inv.title}` : `${inv.otherName} ${inv.status === 'accepted' ? 'komt naar' : 'komt niet naar'} ${inv.title}`
    const fresh = eventBus.publish({ id: `invite:${key}`, source: 'study_group', type: incoming ? 'invite.received' : 'invite.answered', at: now, title, link: inv.side === 'host' ? { app: 'agenda', id: inv.hostItem } : { app: 'agenda' } })
    if (fresh) await showLocalNotification(title, incoming ? 'Open de Agenda om te antwoorden.' : 'Je ziet het bij de afspraak in de Agenda.', `invite:${inv.id}`)
  }
  const copies: Record<string, AppointmentInvite> = {}
  for (const inv of invites) if (inv.side === 'guest' && inv.status === 'accepted' && copyIdOf[inv.id]) copies[copyIdOf[inv.id]] = inv
  set({ invites, copies, error: null })
  return invites
}

const POLL_MS = 15 * 60_000
const DEBOUNCE_MS = 3000

/**
 * Keeps your invites up to date while NEXUS runs, with an account and Vrienden on: live when an
 * invite changes, soon after you change your Agenda, and every 15 minutes as a safety net.
 */
export function startAppointmentInvites(client: SupabaseClient | null, enabled: () => boolean, life: LifeStore = lifeStore): () => void {
  if (!client) return () => {}
  const api = new AppointmentInvites(client)
  let signedIn = false
  let first = true
  let running = false
  let again = false
  let debounce: ReturnType<typeof setTimeout> | undefined
  let stopWatch: (() => void) | null = null
  const run = async (): Promise<void> => {
    if (!signedIn || !enabled()) return
    if (running) {
      again = true
      return
    }
    running = true
    try {
      // The first list after opening only remembers what is there, so old invites do not all notify again.
      await syncInvites(api, life, Date.now(), !first)
      first = false
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ ...state, error: message })
      if (!message.startsWith('setup:')) logEvent('sync', `Afspraak met vrienden: ${message}`, true)
    } finally {
      running = false
      if (again) {
        again = false
        void run()
      }
    }
  }
  const soon = () => {
    clearTimeout(debounce)
    debounce = setTimeout(() => void run(), DEBOUNCE_MS)
  }
  const setSession = (on: boolean) => {
    if (on === signedIn) return
    signedIn = on
    stopWatch?.()
    stopWatch = null
    if (on) {
      active = { api, refresh: run }
      stopWatch = api.watch(soon)
      void run()
    } else {
      active = null
      first = true
      seen.clear()
      set({ invites: null, copies: {}, error: null })
    }
  }
  void client.auth.getSession().then(({ data }) => setSession(Boolean(data.session)))
  const { data } = client.auth.onAuthStateChange((_event, session) => setSession(Boolean(session)))
  const unLife = life.subscribe(soon)
  const poll = setInterval(() => void run(), POLL_MS)
  return () => {
    clearTimeout(debounce)
    clearInterval(poll)
    unLife()
    stopWatch?.()
    data.subscription.unsubscribe()
  }
}
