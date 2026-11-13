import { mentionNotice, MENTIONS_MAX, TASK_COMMENT_MAX, type CommentTarget, type TaskComment } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logEvent } from '../devtools/log'
import { eventBus } from '../events/bus'
import { showLocalNotification } from '../platform/notify'
import { teamError } from './teams'

export const TASK_COMMENTS_MIGRATION = 'supabase/migrations/20261113120000_task_comments.sql'

/** A Dutch message for Opmerkingen; 'setup:<file>' asks for the SQL. */
export function commentError(error: { code?: string; message?: string } | null | undefined): string {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`
  if (/team_task_comments/i.test(text) && /42P01|PGRST205|could not find the table|does not exist/i.test(text)) return `setup:${TASK_COMMENTS_MIGRATION}`
  if (/too many task comments/i.test(text)) return 'Deze taak heeft al 200 opmerkingen.'
  if (/too many comments/i.test(text)) return 'Even rustig: je schreef net veel opmerkingen. Probeer het over een minuut opnieuw.'
  return teamError(error)
}

class CommentError extends Error {}
const fail = (error: { code?: string; message?: string }): never => {
  throw new CommentError(commentError(error))
}

interface CommentRow {
  id: string
  group_id: string
  project_task_id: string | null
  group_task_id: string | null
  user_id: string
  body: string
  mentions: string[] | null
  created_at: string
}
const COLUMNS = 'id,group_id,project_task_id,group_task_id,user_id,body,mentions,created_at'
const column = (t: CommentTarget) => (t.kind === 'project' ? 'project_task_id' : 'group_task_id')

export const toComment = (r: CommentRow): TaskComment => ({
  id: r.id,
  groupId: r.group_id,
  target: r.project_task_id ? { kind: 'project', taskId: r.project_task_id } : { kind: 'group', taskId: r.group_task_id ?? '' },
  userId: r.user_id,
  body: r.body,
  mentions: r.mentions ?? [],
  createdAt: Date.parse(r.created_at),
})

/** Opmerkingen on Supabase. Row level security keeps every read to the teams you are in. */
export class TaskComments {
  constructor(private client: SupabaseClient) {}

  async load(target: CommentTarget): Promise<TaskComment[]> {
    const { data, error } = await this.client.from('team_task_comments').select(COLUMNS).eq(column(target), target.taskId).order('created_at')
    if (error) fail(error)
    return (data as CommentRow[]).map(toComment)
  }

  /** Which tasks of a team have comments: only the task columns, for the counters. */
  async counted(groupId: string): Promise<Array<Pick<TaskComment, 'target'>>> {
    const { data, error } = await this.client.from('team_task_comments').select('project_task_id,group_task_id').eq('group_id', groupId)
    if (error) fail(error)
    return (data as Array<Pick<CommentRow, 'project_task_id' | 'group_task_id'>>).map((r) => ({ target: r.project_task_id ? { kind: 'project', taskId: r.project_task_id } : { kind: 'group', taskId: r.group_task_id ?? '' } }))
  }

  async add(groupId: string, target: CommentTarget, body: string, mentions: string[]): Promise<TaskComment> {
    const { data, error } = await this.client
      .from('team_task_comments')
      .insert({ group_id: groupId, [column(target)]: target.taskId, body: body.trim().slice(0, TASK_COMMENT_MAX), mentions: mentions.slice(0, MENTIONS_MAX) })
      .select(COLUMNS)
      .single()
    if (error) fail(error)
    return toComment(data as CommentRow)
  }

  /** Your own comment, or any as owner or admin. */
  async remove(id: string): Promise<void> {
    const { error } = await this.client.from('team_task_comments').delete().eq('id', id)
    if (error) fail(error)
  }

  /** New comments in one team (or all your teams without [groupId]); returns the unsubscribe. */
  watch(groupId: string | null, onComment: (c: TaskComment) => void): () => void {
    const channel = this.client.channel(`task-comments-${groupId ?? 'all'}-${Math.random().toString(36).slice(2)}`)
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_task_comments', ...(groupId ? { filter: `group_id=eq.${groupId}` } : {}) }, (payload: { new: CommentRow }) => onComment(toComment(payload.new)))
    channel.subscribe()
    return () => void this.client.removeChannel(channel)
  }
}

/**
 * A notice when someone mentions you in a comment, while NEXUS runs on this device, and an entry
 * in the Universal Inbox.
 */
export function startMentionNotices(client: SupabaseClient | null, enabled: () => boolean): () => void {
  if (!client) return () => {}
  const comments = new TaskComments(client)
  let me: string | null = null
  let stop: (() => void) | null = null

  const onComment = async (c: TaskComment) => {
    if (!enabled() || !me || c.userId === me || !c.mentions.includes(me)) return
    try {
      const table = c.target.kind === 'project' ? 'team_project_tasks' : 'study_group_tasks'
      const [task, sender] = await Promise.all([
        client.from(table).select('title').eq('id', c.target.taskId).maybeSingle(),
        client.from('study_group_members').select('display_name').eq('group_id', c.groupId).eq('user_id', c.userId).maybeSingle(),
      ])
      const notice = mentionNotice((sender.data as { display_name?: string } | null)?.display_name ?? 'Iemand', (task.data as { title?: string } | null)?.title ?? 'een taak', c.body)
      const fresh = eventBus.publish({
        id: `mention:${c.id}`,
        source: 'study_group',
        type: 'team.mention',
        at: c.createdAt,
        title: notice.title,
        body: notice.body,
        priority: 'high',
        link: { app: c.target.kind === 'project' ? 'teams' : 'study' },
        correlationId: `task:${c.target.taskId}`,
      })
      if (fresh) await showLocalNotification(notice.title, notice.body, `mention:${c.id}`)
    } catch (err) {
      logEvent('sync', `Opmerkingen: melding lukte niet: ${err instanceof Error ? err.message : err}`, true)
    }
  }

  const listen = (userId: string | null) => {
    me = userId
    stop?.()
    stop = userId ? comments.watch(null, (c) => void onComment(c)) : null
  }
  void client.auth.getSession().then(({ data }) => listen(data.session?.user.id ?? null))
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    if ((session?.user.id ?? null) !== me) listen(session?.user.id ?? null)
  })
  return () => {
    stop?.()
    data.subscription.unsubscribe()
  }
}
