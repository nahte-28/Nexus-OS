import { parseOnlineGames, replayOnline, type OnlineGame } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { friendError } from '../friends/friends'
import { dartsStore } from './store'

export const ONLINE_MIGRATION = 'supabase/migrations/20261116150000_darts_online.sql'

/** A Dutch message for Darts online; 'setup:<file>' asks for the SQL. */
export function onlineError(error: { code?: string; message?: string } | null | undefined): string {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`
  if (/darts_online/i.test(text) && /42P01|42883|PGRST202|PGRST205|could not find the (table|function)|does not exist/i.test(text)) return `setup:${ONLINE_MIGRATION}`
  if (/alleen een vriend/i.test(text)) return 'Je kunt alleen een vriend uitdagen.'
  if (/10 open/i.test(text)) return 'Je hebt al 10 open online matchen. Rond er eerst een af.'
  if (/intussen veranderd|40001/i.test(text)) return 'De stand veranderde intussen. Kijk opnieuw en probeer nog eens.'
  if (/niet \(meer\)/i.test(text)) return 'Deze match is er niet meer.'
  if (/0 tot 180/i.test(text)) return 'Een beurt is 0 tot 180.'
  return friendError(error)
}

class OnlineError extends Error {}
const fail = (error: { code?: string; message?: string }): never => {
  throw new OnlineError(onlineError(error))
}

/** Darts online on Supabase: your matches against friends, live. */
export class DartsOnline {
  constructor(private client: SupabaseClient) {}

  async signedIn(): Promise<boolean> {
    const { data } = await this.client.auth.getSession()
    return Boolean(data.session?.user)
  }

  async list(): Promise<OnlineGame[]> {
    const { data, error } = await this.client.rpc('darts_online_list')
    if (error) fail(error)
    return parseOnlineGames(data)
  }

  async invite(friend: string, options: { mode: number; legsToWin: number; setsToWin: number; doubleOut: boolean }): Promise<string> {
    const { data, error } = await this.client.rpc('darts_online_invite', { p_friend: friend, p_mode: options.mode, p_legs: options.legsToWin, p_sets: options.setsToWin, p_double_out: options.doubleOut })
    if (error) fail(error)
    return String(data)
  }

  async answer(id: string, accept: boolean): Promise<void> {
    const { error } = await this.client.rpc('darts_online_answer', { p_id: id, p_accept: accept })
    if (error) fail(error)
  }

  /** Your visit after [seq] visits; refused when the other player threw in the meantime. */
  async throwVisit(id: string, seq: number, score: number, darts: number, doubles?: number): Promise<void> {
    const { error } = await this.client.rpc('darts_online_throw', { p_id: id, p_seq: seq, p_score: score, p_darts: darts, p_doubles: doubles ?? null })
    if (error) fail(error)
  }

  async undo(id: string, seq: number): Promise<void> {
    const { error } = await this.client.rpc('darts_online_undo', { p_id: id, p_seq: seq })
    if (error) fail(error)
  }

  async end(id: string, status: 'done' | 'stopped'): Promise<void> {
    const { error } = await this.client.rpc('darts_online_end', { p_id: id, p_status: status })
    if (error) fail(error)
  }

  /** Calls [onChange] when one of your matches changes (row level security applies); returns the unsubscribe. */
  watch(onChange: () => void): () => void {
    const channel = this.client.channel(`darts-online-${Math.random().toString(36).slice(2)}`)
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'darts_online' }, () => onChange())
    channel.subscribe()
    return () => void this.client.removeChannel(channel)
  }
}

/**
 * A finished online match goes in your own Darts history under your own name, once (saving it
 * again replaces it), so Geschiedenis and Statistieken count it.
 */
export function saveOnlineToHistory(game: OnlineGame): boolean {
  if (game.status !== 'done' && game.status !== 'stopped') return false
  const state = dartsStore.getSnapshot()
  const match = replayOnline(game, state.settings.me)
  if (match.legs.every((l) => l.visits.length === 0)) return false
  const old = state.matches.find((m) => m.id === match.id)
  if (old && old.updatedAt >= match.updatedAt) return false
  dartsStore.update((s) => ({ ...s, matches: [match, ...s.matches.filter((m) => m.id !== match.id)] }))
  return true
}
