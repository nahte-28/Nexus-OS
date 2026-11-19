import { finishedRounds, parseTogether, type TogetherSession } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { friendError } from '../friends/friends'
import { readStorage, writeStorage } from '../state/storage'
import { focusStore, type FocusStore } from './timer'

export const TOGETHER_MIGRATION = 'supabase/migrations/20261114090000_study_together.sql'

/** A Dutch message for Samen studeren; 'setup:<file>' asks for the SQL. */
export function togetherError(error: { code?: string; message?: string } | null | undefined): string {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`
  if (/study_session|study_sessions_list|start_study_session|join_study_session|leave_study_session/i.test(text) && /42P01|42883|PGRST202|PGRST205|could not find the (table|function)|does not exist/i.test(text)) return `setup:${TOGETHER_MIGRATION}`
  if (/niet \(meer\)/i.test(text)) return 'Deze sessie is er niet meer.'
  if (/check/i.test(text) && /focus_minutes|break_minutes/i.test(text)) return 'Kies een focusblok van 5 tot 90 minuten en een pauze van 1 tot 30.'
  return friendError(error)
}

class TogetherError extends Error {}
const fail = (error: { code?: string; message?: string }): never => {
  throw new TogetherError(togetherError(error))
}

/** Samen studeren on Supabase: open sessions of you, your friends and your teammates. */
export class StudyTogether {
  constructor(private client: SupabaseClient) {}

  async signedIn(): Promise<boolean> {
    const { data } = await this.client.auth.getSession()
    return Boolean(data.session?.user)
  }

  async list(): Promise<TogetherSession[]> {
    const { data, error } = await this.client.rpc('study_sessions_list')
    if (error) fail(error)
    return parseTogether(data)
  }

  async start(title: string, focus: number, pause: number): Promise<string> {
    const { data, error } = await this.client.rpc('start_study_session', { p_title: title, p_focus: focus, p_break: pause })
    if (error) fail(error)
    return String(data)
  }

  async join(id: string): Promise<void> {
    const { error } = await this.client.rpc('join_study_session', { p_id: id })
    if (error) fail(error)
  }

  async leave(id: string): Promise<void> {
    const { error } = await this.client.rpc('leave_study_session', { p_id: id })
    if (error) fail(error)
  }
}

/** When you joined each session on this device, and which focus blocks are already in your log. */
const JOINED_KEY = 'nexus.together.joined'
const LOGGED_KEY = 'nexus.together.logged'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = readStorage(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function markJoined(id: string, at: number): void {
  const joined = readJson<Record<string, number>>(JOINED_KEY, {})
  if (joined[id]) return
  writeStorage(JOINED_KEY, JSON.stringify({ ...Object.fromEntries(Object.entries(joined).slice(-20)), [id]: at }))
}

/**
 * Every focus block of [session] that ended while you were in it goes in your focus log once, so
 * Studie and Inzichten count it like your own rounds.
 */
export function logTogether(session: TogetherSession, now: number, store: FocusStore = focusStore): number {
  if (!session.joined) return 0
  const from = readJson<Record<string, number>>(JOINED_KEY, {})[session.id] ?? now
  const logged = new Set(readJson<string[]>(LOGGED_KEY, []))
  let added = 0
  for (const r of finishedRounds(session, from, now)) {
    const key = `${session.id}#${r}`
    if (logged.has(key)) continue
    logged.add(key)
    store.addLog({ at: session.startedAt + ((r - 1) * (session.focus + session.break) + session.focus) * 60_000, minutes: session.focus, task: `Samen: ${session.title}` })
    added++
  }
  if (added > 0) writeStorage(LOGGED_KEY, JSON.stringify([...logged].slice(-200)))
  return added
}
