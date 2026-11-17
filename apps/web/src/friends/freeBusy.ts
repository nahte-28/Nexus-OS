import { busyBlocks, FREE_BUSY_DAYS, commonFreeSlots, parseFriendBusy, type BusyBlock, type FreeSlot, type FriendBusy } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { logEvent } from '../devtools/log'
import { dagstartInput } from '../life/dagstart'
import { lifeStore } from '../life/store'
import { profilesStore } from '../profiles/store'
import { friendError } from './friends'

/**
 * Samen vrij moment zoeken: this NEXUS shares with your friends when you are busy in the coming two
 * weeks (never what), and finds moments when you and the friends you pick are all free.
 */

export const FREE_BUSY_MIGRATION = 'supabase/migrations/20261116230000_free_busy.sql'
const DEBOUNCE_MS = 5000
/** Shared again at least this often, so the two weeks keep moving along. */
const REFRESH_MS = 6 * 60 * 60_000

/** A Dutch message for Samen vrij moment zoeken; 'setup:<file>' asks for the SQL. */
export function freeBusyError(error: { code?: string; message?: string } | null | undefined): string {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`
  if (/free_busy/i.test(text) && /42P01|42883|PGRST202|PGRST205|could not find the (table|function)|does not exist/i.test(text)) return `setup:${FREE_BUSY_MIGRATION}`
  return friendError(error)
}

class FreeBusyError extends Error {}
const fail = (error: { code?: string; message?: string }): never => {
  throw new FreeBusyError(freeBusyError(error))
}

export class FreeBusy {
  constructor(private client: SupabaseClient) {}

  async publish(blocks: BusyBlock[], until: number): Promise<void> {
    const { error } = await this.client.rpc('free_busy_publish', { p_blocks: blocks, p_until: new Date(until).toISOString() })
    if (error) fail(error)
  }

  async setShares(shares: boolean): Promise<void> {
    const { error } = await this.client.rpc('free_busy_share', { p_shares: shares })
    if (error) fail(error)
  }

  async shares(): Promise<boolean> {
    const { data, error } = await this.client.rpc('free_busy_mine')
    if (error) fail(error)
    return (data as { shares?: unknown } | null)?.shares !== false
  }

  async of(friends: string[]): Promise<FriendBusy[]> {
    const { data, error } = await this.client.rpc('free_busy_of', { p_friends: friends.slice(0, 20) })
    if (error) fail(error)
    return parseFriendBusy(data)
  }
}

interface State {
  /** Whether you share your busy times; null until known. */
  shares: boolean | null
  error: string | null
}

let state: State = { shares: null, error: null }
const listeners = new Set<() => void>()
let active: { api: FreeBusy; publish: () => Promise<void> } | null = null

function set(next: State) {
  state = next
  for (const fn of listeners) fn()
}

const store = {
  getSnapshot: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => void listeners.delete(fn)
  },
}

export const useFreeBusy = (): State => useSyncExternalStore(store.subscribe, store.getSnapshot)
export const freeBusyApi = () => active

/** Turns sharing your busy times on or off. */
export async function setFreeBusyShares(shares: boolean): Promise<void> {
  if (!active) throw new Error('Meld je aan om dit te kiezen.')
  await active.api.setShares(shares)
  set({ shares, error: null })
  if (shares) await active.publish()
}

/**
 * Moments in the coming week when you and [friends] are all free, as long as [minutes]. Your own
 * appointment [skip] does not count as busy. Friends who do not share are listed in [hidden].
 */
export async function findFreeMoments(friends: string[], minutes: number, skip?: string, now = Date.now()): Promise<{ slots: FreeSlot[]; hidden: string[] }> {
  if (!active) throw new Error('Meld je aan om een vrij moment te zoeken.')
  const others = await active.api.of(friends)
  const hidden = others.filter((f) => !f.shares).map((f) => f.name)
  const sharing = others.filter((f) => f.shares)
  const until = Math.min(Infinity, ...sharing.map((f) => f.until || Infinity))
  const mine = busyBlocks(dagstartInput(), now, 7, skip)
  return { slots: commonFreeSlots([mine, ...sharing.map((f) => f.blocks)], { minutes, from: now }, until), hidden }
}

/** Shares your busy times while you are signed in and Vrienden is on: on changes, and every 6 hours. */
export function startFreeBusy(client: SupabaseClient | null, enabled: () => boolean): () => void {
  if (!client) return () => {}
  const api = new FreeBusy(client)
  let signedIn = false
  let lastKey = ''
  let lastAt = 0
  let debounce: ReturnType<typeof setTimeout> | undefined
  const publish = async (force = false): Promise<void> => {
    if (!signedIn || !enabled()) return
    try {
      if (state.shares === null) set({ shares: await api.shares(), error: null })
      if (!state.shares) return
      const now = Date.now()
      const blocks = busyBlocks(dagstartInput(), now)
      const key = JSON.stringify(blocks)
      if (!force && key === lastKey && now - lastAt < REFRESH_MS) return
      await api.publish(blocks, now + FREE_BUSY_DAYS * 24 * 60 * 60_000)
      lastKey = key
      lastAt = now
      if (state.error) set({ ...state, error: null })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ ...state, error: message })
      if (!message.startsWith('setup:')) logEvent('sync', `Samen vrij moment: ${message}`, true)
    }
  }
  const soon = () => {
    clearTimeout(debounce)
    debounce = setTimeout(() => void publish(), DEBOUNCE_MS)
  }
  const setSession = (on: boolean) => {
    if (on === signedIn) return
    signedIn = on
    lastKey = ''
    if (on) {
      active = { api, publish: () => publish(true) }
      void publish()
    } else {
      active = null
      set({ shares: null, error: null })
    }
  }
  void client.auth.getSession().then(({ data }) => setSession(Boolean(data.session)))
  const { data } = client.auth.onAuthStateChange((_event, session) => setSession(Boolean(session)))
  const unLife = lifeStore.subscribe(soon)
  const unProfiles = profilesStore.subscribe(soon)
  const poll = setInterval(() => void publish(), 30 * 60_000)
  return () => {
    clearTimeout(debounce)
    clearInterval(poll)
    unLife()
    unProfiles()
    data.subscription.unsubscribe()
  }
}

/** For tests. */
export function setFreeBusyApi(api: FreeBusy | null, shares: boolean | null = null) {
  active = api ? { api, publish: async () => {} } : null
  set({ shares, error: null })
}
