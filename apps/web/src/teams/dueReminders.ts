import type { SupabaseClient } from '@supabase/supabase-js'
import { TEAM_TASK_REMIND_MS, teamTaskReminders } from '@nexus/core'
import type { ConnectEngine } from '../connect/engine'
import { logEvent } from '../devtools/log'
import { showLocalNotification } from '../platform/notify'
import { readStorage, writeStorage } from '../state/storage'
import { Teams } from './teams'

const SENT_KEY = 'nexus.teams.remindedTasks'
const CHECK_MS = 15 * 60_000
const KEEP = 200

export interface ReminderEffects {
  local(title: string, text: string, ref: string): Promise<unknown>
  phones(title: string, text: string, ref: string): Promise<unknown>
}

function sentRefs(): string[] {
  try {
    const raw = JSON.parse(readStorage(SENT_KEY) ?? '[]') as unknown
    return Array.isArray(raw) ? raw.filter((r): r is string => typeof r === 'string') : []
  } catch {
    return []
  }
}

/**
 * Reminds you of team tasks on your name that are due within a day: here, and on your phone and
 * watch. Each task and deadline once; every device keeps its own list, the phone shows one (same ref).
 */
export async function remindDueTeamTasks(teams: Pick<Teams, 'myDueTasks'>, me: string, effects: ReminderEffects, now = Date.now()): Promise<number> {
  const { tasks, projects } = await teams.myDueTasks(me, now + TEAM_TASK_REMIND_MS)
  const sent = sentRefs()
  const due = teamTaskReminders(tasks, me, now, new Set(sent), (id) => projects.get(id) ?? '')
  if (due.length === 0) return 0
  writeStorage(SENT_KEY, JSON.stringify([...sent, ...due.map((d) => d.ref)].slice(-KEEP)))
  for (const r of due) {
    await effects.local(r.title, r.text, r.ref).catch(() => {})
    await effects.phones(r.title, r.text, r.ref).catch((err) => logEvent('reminders', `Teamtaak naar gsm versturen mislukt: ${err instanceof Error ? err.message : err}`, true))
  }
  logEvent('reminders', `${due.length} herinnering${due.length === 1 ? '' : 'en'} voor teamtaken`)
  return due.length
}

/** Checks every 15 minutes while NEXUS runs and you are signed in; one tab does it (Web Locks). */
export function startTeamTaskReminders(client: SupabaseClient | null, connect: Pick<ConnectEngine, 'notifyPhones'>, enabled: () => boolean): () => void {
  if (!client) return () => {}
  const teams = new Teams(client)
  const effects: ReminderEffects = {
    local: (title, text, ref) => showLocalNotification(title, text, ref),
    phones: (title, text, ref) => connect.notifyPhones(title, text, ref),
  }
  let stopped = false
  let timer: ReturnType<typeof setInterval> | undefined
  let release: (() => void) | undefined
  const tick = async () => {
    if (!enabled() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return
    const me = await teams.me()
    if (me) await remindDueTeamTasks(teams, me.id, effects).catch(() => {})
  }
  const run = () => {
    void tick()
    timer = setInterval(() => void tick(), CHECK_MS)
  }
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (locks) {
    void locks.request('nexus-team-reminders', () => {
      if (stopped) return
      run()
      return new Promise<void>((resolve) => (release = resolve))
    })
  } else {
    run()
  }
  return () => {
    stopped = true
    clearInterval(timer)
    release?.()
  }
}
