import type { SupabaseClient } from '@supabase/supabase-js'
import { TEAM_TASK_STATUS_LABELS, type TaskOutboxAction } from '@nexus/core'
import { flushOutbox, registerOutboxSender, sendOrQueue } from '../offline/outbox'
import { StudyGroups } from '../study/group'
import { Teams } from './teams'

/** What a team task change needs from the server: Teams for a project task, StudyGroups for a group deadline. */
export interface TaskActionApi {
  teams?: Pick<Teams, 'addTask' | 'updateTask'> | null
  groups?: Pick<StudyGroups, 'addTask' | 'setTaskDone'> | null
}

function need<T>(part: T | null | undefined): T {
  if (!part) throw new Error('Deze versie van NEXUS heeft geen verbinding met Supabase.')
  return part
}

/** Sends one change to a team task, now or later from the wachtrij. */
export async function runTaskAction(api: TaskActionApi, action: TaskOutboxAction): Promise<void> {
  switch (action.type) {
    case 'team.add':
      return need(api.teams).addTask({ id: action.projectId, groupId: action.groupId }, action.title, action.assignee, action.dueAt)
    case 'team.update':
      return need(api.teams).updateTask(action.taskId, action.change)
    case 'group.add':
      return need(api.groups).addTask(action.groupId, action.title, action.dueAt)
    case 'group.done':
      return need(api.groups).setTaskDone({ id: action.taskId, groupId: action.groupId }, action.done)
  }
}

/** A short Dutch line for the change while it waits, e.g. "Nieuwe taak: Verslag" or "Verslag → Bezig". */
export function describeTaskAction(action: TaskOutboxAction, title: string): string {
  switch (action.type) {
    case 'team.add':
    case 'group.add':
      return `Nieuwe taak: ${action.title.trim()}`
    case 'group.done':
      return action.done ? `${title} afgevinkt` : `${title} niet meer afgevinkt`
    case 'team.update': {
      const { status, assignee, dueAt } = action.change
      if (status !== undefined) return `${title} → ${TEAM_TASK_STATUS_LABELS[status]}`
      if (assignee !== undefined) return `${title}: andere persoon`
      if (dueAt !== undefined) return dueAt === null ? `${title}: geen datum meer` : `${title}: nieuwe datum`
      return title
    }
  }
}

/**
 * Makes the change now, or puts it in the wachtrij when there is no internet: resolves to
 * 'queued' then, so the screen skips its refresh. Changes in one team stay in the order made.
 */
export function changeTask(api: TaskActionApi, owner: string, groupId: string, action: TaskOutboxAction, title = ''): Promise<void | 'queued'> {
  return sendOrQueue('task', owner, groupId, describeTaskAction(action, title), () => runTaskAction(api, action), { action })
}

/** Sends waiting team task changes for whoever is signed in; once, from background.ts. */
export function startTaskOutbox(client: SupabaseClient | null): () => void {
  if (!client) return () => {}
  let me: string | null = null
  const api: TaskActionApi = { teams: new Teams(client), groups: new StudyGroups(client) }
  const stopOutbox = registerOutboxSender('task', {
    owner: () => me,
    send: (item) => (item.action ? runTaskAction(api, item.action) : Promise.resolve()),
  })
  const listen = (userId: string | null) => {
    me = userId
    if (userId) void flushOutbox()
  }
  void client.auth.getSession().then(({ data }) => listen(data.session?.user.id ?? null))
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    if ((session?.user.id ?? null) !== me) listen(session?.user.id ?? null)
  })
  return () => {
    stopOutbox()
    data.subscription.unsubscribe()
  }
}
