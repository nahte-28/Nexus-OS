import { classAgendaOn, classCopyId, DEFAULT_REMIND, emptyClassAgenda, planClassAgenda, toClassAgenda, type ClassAgendaState, type GroupTask, type StudyGroup } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { logEvent } from '../devtools/log'
import { lifeStore, type LifeStore } from '../life/store'
import { Teams } from '../teams/teams'
import { groupError, StudyGroups } from './group'

const KEY = 'nexus.classagenda'
const POLL_MS = 5 * 60_000
const DEBOUNCE_MS = 3000

interface Stored extends ClassAgendaState {
  user: string | null
}

let stored: Stored = read()
const listeners = new Set<() => void>()

function read(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { user?: unknown } | null
    return { user: typeof raw?.user === 'string' ? raw.user : null, ...toClassAgenda(raw) }
  } catch {
    return { user: null, ...emptyClassAgenda() }
  }
}

function write(next: Stored): void {
  stored = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Full or blocked storage: the klasagenda still works, it only forgets what it saw.
  }
  for (const l of listeners) l()
}

/** Your klasagenda choices on this device. */
export const classAgendaStore = {
  getSnapshot: (): ClassAgendaState => stored,
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  /** Switches the klasagenda of one team on or off; null follows the class again. */
  setGroup(groupId: string, on: boolean | null): void {
    const groups = { ...stored.groups }
    if (on === null) delete groups[groupId]
    else groups[groupId] = on
    write({ ...stored, groups })
    kick?.()
  },
  /** For tests. */
  reset(): void {
    write({ user: null, ...emptyClassAgenda() })
  },
}

export const useClassAgenda = () => useSyncExternalStore(classAgendaStore.subscribe, classAgendaStore.getSnapshot)
export const classAgendaFor = (state: ClassAgendaState, team: Pick<StudyGroup, 'id' | 'klas'>) => classAgendaOn(state, team)

let kick: (() => void) | null = null

interface TaskRow {
  id: string
  group_id: string
  created_by: string
  title: string
  due_at: number
}

/** One round: reads your teams and their group deadlines and brings your Agenda in line. */
export async function syncClassAgenda(client: SupabaseClient, life: LifeStore = lifeStore, now = Date.now()): Promise<void> {
  const { data: session } = await client.auth.getSession()
  const me = session.session?.user.id
  if (!me) return
  if (stored.user !== me) write({ user: me, groups: {}, seen: {} })
  await life.ready
  const groups = await new Teams(client, life).teams()
  const [tasks, done] = await Promise.all([
    client.from('study_group_tasks').select('id,group_id,created_by,title,due_at'),
    client.from('study_group_task_done').select('task_id').eq('user_id', me),
  ])
  const error = tasks.error ?? done.error
  if (error) throw new Error(groupError(error))
  const mine = new Set((done.data as Array<{ task_id: string }>).map((d) => d.task_id))
  const byGroup: Record<string, GroupTask[]> = Object.fromEntries(groups.map((g) => [g.id, []]))
  for (const t of tasks.data as TaskRow[]) byGroup[t.group_id]?.push({ id: t.id, groupId: t.group_id, createdBy: t.created_by, title: t.title, dueAt: Number(t.due_at), doneBy: mine.has(t.id) ? [me] : [] })
  const ids = [...new Set([...Object.values(byGroup).flat().map((t) => t.id), ...Object.keys(stored.seen)])]
  const copyIdOf = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await classCopyId(me, id)] as const)))
  const plan = planClassAgenda({ groups, tasks: byGroup, life: life.all(), me, copyIdOf, state: stored, now })

  for (const a of plan.add) await life.addDeadline({ title: a.title, dueAt: a.dueAt, projectId: null, notes: a.notes, remind: DEFAULT_REMIND, target: 'phone' }, now, { id: a.id, doneAt: a.done ? now : null, updatedAt: 1 })
  for (const u of plan.update) {
    const { id, ...patch } = u
    await life.updateDeadline(id, patch, now)
  }
  for (const id of plan.remove) await life.remove(id, now)
  const study = new StudyGroups(client, life)
  for (const m of plan.markTask) await study.setTaskDone(m.task, m.done)
  write({ ...stored, user: me, seen: plan.seen })
}

/**
 * Keeps the klasagenda up to date while NEXUS runs: after signing in, every few minutes, and soon
 * after you tick something off in the Agenda. Only while the Teams module is on.
 */
export function startClassAgenda(client: SupabaseClient | null, enabled: () => boolean, onFeatures: (l: () => void) => () => void, life: LifeStore = lifeStore): () => void {
  if (!client) return () => {}
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = false
  let again = false
  let quiet = false
  const run = async () => {
    if (!enabled()) return
    if (running) {
      again = true
      return
    }
    running = true
    try {
      await syncClassAgenda(client, life)
      quiet = false
    } catch (err) {
      // Without the group deadlines SQL step there is nothing to copy yet.
      if (!String(err).includes('setup:') && !quiet) logEvent('sync', `Klasagenda bijwerken mislukt: ${String(err)}`, true)
      quiet = true
    } finally {
      running = false
      if (again) {
        again = false
        schedule()
      }
    }
  }
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(() => void run(), DEBOUNCE_MS)
  }
  kick = schedule
  const poll = setInterval(() => void run(), POLL_MS)
  const unsubscribeLife = life.subscribe(schedule)
  const unsubscribeFeatures = onFeatures(schedule)
  const { data } = client.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') schedule()
    if (event === 'SIGNED_OUT') write({ user: null, groups: {}, seen: {} })
  })
  schedule()
  return () => {
    clearTimeout(timer)
    clearInterval(poll)
    kick = null
    unsubscribeLife()
    unsubscribeFeatures()
    data.subscription.unsubscribe()
  }
}
