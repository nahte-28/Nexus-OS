import { GAME_NAME_MAX, GAME_PLAN_NOTE_MAX, type GameAnswer, type GamingState, type TeamGameAnswer, type TeamGamePlan, type TeamPlaying } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logEvent } from '../devtools/log'
import { teamError } from '../teams/teams'
import { gamingStore } from './store'

export const TEAM_GAMING_MIGRATION = 'supabase/migrations/20261103090000_team_gaming.sql'

/** A Dutch message for Gaming › Vrienden; 'setup:<file>' asks for the SQL. */
export function friendsError(error: { code?: string; message?: string } | null | undefined): string {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`
  if (/team_playing|team_game_plans|team_game_rsvp/i.test(text) && /42P01|PGRST205|could not find the table|does not exist/i.test(text)) return `setup:${TEAM_GAMING_MIGRATION}`
  if (/too many game plans/i.test(text)) return 'Dit team heeft al 50 geplande sessies. Verwijder eerst een oude.'
  return teamError(error)
}

class FriendsError extends Error {}
const fail = (error: { code?: string; message?: string }): never => {
  throw new FriendsError(friendsError(error))
}

interface PlayingRow {
  group_id: string
  user_id: string
  game: string
  started_at: number
}
interface PlanRow {
  id: string
  group_id: string
  game: string
  starts_at: number
  note: string
  created_by: string
}
interface AnswerRow {
  plan_id: string
  user_id: string
  answer: GameAnswer
}

export interface FriendsData {
  playing: TeamPlaying[]
  plans: TeamGamePlan[]
  answers: TeamGameAnswer[]
}

/** Gamevrienden on Supabase: who is playing in your teams and the sessions you plan together. */
export class GamingFriends {
  constructor(private client: SupabaseClient) {}

  async load(groupIds: string[]): Promise<FriendsData> {
    if (groupIds.length === 0) return { playing: [], plans: [], answers: [] }
    const [playing, plans, answers] = await Promise.all([
      this.client.from('team_playing').select('group_id,user_id,game,started_at').in('group_id', groupIds),
      this.client.from('team_game_plans').select('id,group_id,game,starts_at,note,created_by').in('group_id', groupIds).order('starts_at'),
      this.client.from('team_game_rsvp').select('plan_id,user_id,answer').in('group_id', groupIds),
    ])
    for (const r of [playing, plans, answers]) if (r.error) fail(r.error)
    return {
      playing: (playing.data as PlayingRow[]).map((r) => ({ groupId: r.group_id, userId: r.user_id, game: r.game, startedAt: Number(r.started_at) })),
      plans: (plans.data as PlanRow[]).map((r) => ({ id: r.id, groupId: r.group_id, game: r.game, startsAt: Number(r.starts_at), note: r.note, createdBy: r.created_by })),
      answers: (answers.data as AnswerRow[]).map((r) => ({ planId: r.plan_id, userId: r.user_id, answer: r.answer })),
    }
  }

  /** Shows [game] as playing since [startedAt] in these teams, and nothing in the others you are in. */
  async publish(share: string[], playing: { game: string; startedAt: number } | null, me: string): Promise<void> {
    const remove = this.client.from('team_playing').delete().eq('user_id', me)
    const { error } = playing && share.length > 0 ? await remove.not('group_id', 'in', `(${share.join(',')})`) : await remove
    if (error) fail(error)
    if (!playing || share.length === 0) return
    const rows = share.map((group_id) => ({ group_id, user_id: me, game: playing.game.slice(0, GAME_NAME_MAX), started_at: playing.startedAt }))
    const up = await this.client.from('team_playing').upsert(rows, { onConflict: 'group_id,user_id' })
    if (up.error) fail(up.error)
  }

  async addPlan(groupId: string, game: string, startsAt: number, note: string): Promise<void> {
    const { error } = await this.client
      .from('team_game_plans')
      .insert({ group_id: groupId, game: game.trim().slice(0, GAME_NAME_MAX), starts_at: startsAt, note: note.trim().slice(0, GAME_PLAN_NOTE_MAX) })
    if (error) fail(error)
  }

  async removePlan(planId: string): Promise<void> {
    const { error } = await this.client.from('team_game_plans').delete().eq('id', planId)
    if (error) fail(error)
  }

  /** Your answer on a plan; null takes it back. */
  async answer(plan: TeamGamePlan, answer: GameAnswer | null, me: string): Promise<void> {
    const { error } = answer
      ? await this.client.from('team_game_rsvp').upsert({ plan_id: plan.id, group_id: plan.groupId, user_id: me, answer, updated_at: new Date().toISOString() }, { onConflict: 'plan_id,user_id' })
      : await this.client.from('team_game_rsvp').delete().eq('plan_id', plan.id).eq('user_id', me)
    if (error) fail(error)
  }

  /** Live changes in these tables (row level security applies); returns the unsubscribe. */
  watch(onChange: () => void): () => void {
    const channel = this.client.channel(`gaming-friends-${Math.random().toString(36).slice(2)}`)
    for (const table of ['team_playing', 'team_game_plans', 'team_game_rsvp']) channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange)
    channel.subscribe()
    return () => void this.client.removeChannel(channel)
  }
}

/** What the teams you share with should see: the running timer, or nothing. */
export function sharedPlaying(s: GamingState): { share: string[]; playing: { game: string; startedAt: number } | null } {
  const game = s.active ? s.games.find((g) => g.id === s.active!.gameId) : undefined
  return { share: s.settings.shareTeams, playing: s.active ? { game: game?.name || 'Gaming', startedAt: s.active.startedAt } : null }
}

/**
 * Keeps your "speelt nu" in your teams in step with the Gaming timer while NEXUS runs: after every
 * change of the timer or of the teams you share with. Only what changed is sent.
 */
export function startFriendsSharing(client: SupabaseClient | null, enabled: () => boolean, store = gamingStore): () => void {
  if (!client) return () => {}
  const api = new GamingFriends(client)
  let last: string | null = null
  let busy = false
  let again = false
  const sync = async () => {
    if (!enabled()) return
    if (busy) {
      again = true
      return
    }
    const wanted = sharedPlaying(store.getSnapshot())
    const key = JSON.stringify(wanted)
    // Nothing shared and nothing to clear: no need to bother the database.
    if (key === last || (last === null && wanted.share.length === 0)) return
    busy = true
    try {
      const { data } = await client.auth.getSession()
      const me = data.session?.user.id
      if (!me) return
      await api.publish(wanted.share, wanted.playing, me)
      last = key
    } catch (err) {
      logEvent('sync', `Gamevrienden: delen lukte niet: ${err instanceof Error ? err.message : err}`, true)
    } finally {
      busy = false
      if (again) {
        again = false
        void sync()
      }
    }
  }
  void sync()
  return store.subscribe(() => void sync())
}
