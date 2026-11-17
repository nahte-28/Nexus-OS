import { duelLine, parseDuels, type CardDuel, type DuelQuestion } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { logEvent } from '../devtools/log'
import { eventBus } from '../events/bus'
import { friendError } from '../friends/friends'
import { showLocalNotification } from '../platform/notify'

/**
 * Leerkaarten-duel on Supabase: you challenge a friend with one of your decks as multiple choice.
 * The answers stay in the database until you played; it counts the score.
 */

export const DUELS_MIGRATION = 'supabase/migrations/20261117090000_card_duels.sql'
const POLL_MS = 10 * 60_000
const DEBOUNCE_MS = 1500

/** A Dutch message for Leerkaarten-duel; 'setup:<file>' asks for the SQL. */
export function duelError(error: { code?: string; message?: string } | null | undefined): string {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`
  if (/card_duel/i.test(text) && /42P01|42883|PGRST202|PGRST205|could not find the (table|function)|does not exist/i.test(text)) return `setup:${DUELS_MIGRATION}`
  if (/alleen een vriend/i.test(text)) return 'Je kunt alleen een vriend uitdagen.'
  if (/20 open/i.test(text)) return 'Je hebt al 20 open duels. Wacht tot je vrienden ze speelden.'
  if (/speelde het al|niet \(meer\)/i.test(text)) return 'Dit duel is er niet meer, of je speelde het al.'
  if (/4 antwoorden/i.test(text)) return 'Een duel heeft 1 tot 10 vragen met elk 4 antwoorden.'
  return friendError(error)
}

class DuelError extends Error {}
const fail = (error: { code?: string; message?: string }): never => {
  throw new DuelError(duelError(error))
}

export class CardDuels {
  constructor(private client: SupabaseClient) {}

  async list(): Promise<CardDuel[]> {
    const { data, error } = await this.client.rpc('card_duels_list')
    if (error) fail(error)
    return parseDuels(data)
  }

  async create(friend: string, deckName: string, questions: DuelQuestion[], answers: number[]): Promise<string> {
    const { data, error } = await this.client.rpc('card_duel_create', { p_friend: friend, p_deck: deckName, p_questions: questions, p_answers: answers })
    if (error) fail(error)
    return String(data)
  }

  async play(id: string, picks: number[], ms: number): Promise<number> {
    const { data, error } = await this.client.rpc('card_duel_play', { p_id: id, p_picks: picks, p_ms: Math.round(ms) })
    if (error) fail(error)
    return Number(data)
  }

  async decline(id: string): Promise<void> {
    const { error } = await this.client.rpc('card_duel_decline', { p_id: id })
    if (error) fail(error)
  }

  /** Calls [onChange] when one of your duels changes; returns the unsubscribe. */
  watch(onChange: () => void): () => void {
    const channel = this.client.channel(`card-duels-${Math.random().toString(36).slice(2)}`)
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'card_duels' }, () => onChange())
    channel.subscribe()
    return () => void this.client.removeChannel(channel)
  }
}

type Api = Pick<CardDuels, 'list' | 'create' | 'play' | 'decline'>

interface State {
  duels: CardDuel[] | null
  error: string | null
}

let state: State = { duels: null, error: null }
const listeners = new Set<() => void>()
let active: { api: Api; refresh: () => Promise<void> } | null = null
/** What we last saw of each duel, so a change notifies once. */
const seen = new Map<string, string>()

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

export const useDuels = (): State => useSyncExternalStore(store.subscribe, store.getSnapshot)
export const duelsApi = () => active

const stage = (d: CardDuel) => `${d.status}:${d.theirPlayed}`

/** Reads your duels; with [notify], a new challenge or a friend who played gives a notice. */
export async function syncDuels(api: Pick<CardDuels, 'list'>, notify: boolean, now = Date.now()): Promise<void> {
  const duels = await api.list()
  for (const d of duels) {
    const before = seen.get(d.id)
    seen.set(d.id, stage(d))
    if (!notify || before === stage(d)) continue
    const challenged = before === undefined && d.side === 1 && d.status === 'open' && d.myPicks === null
    const played = d.theirPlayed && d.myPicks !== null && before !== undefined && !before.endsWith(':true')
    if (!challenged && !played) continue
    const title = challenged ? `${d.otherName} daagt je uit voor een leerkaartenduel` : duelLine(d)
    const fresh = eventBus.publish({ id: `duel:${d.id}:${stage(d)}`, source: 'study_group', type: challenged ? 'duel.received' : 'duel.played', at: now, title, link: { app: 'flashcards' } })
    if (fresh) await showLocalNotification(title, challenged ? 'Open Leerkaarten om te spelen.' : 'Je ziet het in Leerkaarten.', `duel:${d.id}`)
  }
  set({ duels, error: null })
}

/** For tests. */
export function setDuelsApi(api: Api | null, duels: CardDuel[] | null = null) {
  active = api ? { api, refresh: async () => set({ duels: await api.list(), error: null }) } : null
  set({ duels, error: null })
}

/** Follows your duels while you are signed in and Vrienden is on: live, and every 10 minutes. */
export function startCardDuels(client: SupabaseClient | null, enabled: () => boolean): () => void {
  if (!client) return () => {}
  const api = new CardDuels(client)
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
      // The first list after opening only remembers what is there, so old duels do not notify again.
      await syncDuels(api, !first)
      first = false
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ ...state, error: message })
      if (!message.startsWith('setup:')) logEvent('sync', `Leerkaarten-duel: ${message}`, true)
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
      set({ duels: null, error: null })
    }
  }
  void client.auth.getSession().then(({ data }) => setSession(Boolean(data.session)))
  const { data } = client.auth.onAuthStateChange((_event, session) => setSession(Boolean(session)))
  const poll = setInterval(() => void run(), POLL_MS)
  return () => {
    clearTimeout(debounce)
    clearInterval(poll)
    stopWatch?.()
    data.subscription.unsubscribe()
  }
}
