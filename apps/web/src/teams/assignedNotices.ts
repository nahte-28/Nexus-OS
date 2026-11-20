import type { SupabaseClient } from '@supabase/supabase-js'
import { eventBus } from '../events/bus'
import { logEvent } from '../devtools/log'
import { showLocalNotification } from '../platform/notify'

interface AssignedRow {
  id: string
  project_id: string
  group_id: string
  title: string
  status: string
  assignee: string | null
  updated_by: string | null
}

/** "Nieuwe teamtaak voor jou": the same words as the push of 20261120090000_task_assigned_push.sql. */
export function assignedNotice(by: string, title: string, project: string): { title: string; body: string } {
  return { title: 'Nieuwe teamtaak voor jou', body: `${by} zette "${title}" (${project}) op jouw naam.` }
}

/**
 * While NEXUS runs: a notice when a teammate puts a task on your name. Your phones get the same
 * one by web push (same tag), so a phone shows it once.
 */
export function startAssignedNotices(client: SupabaseClient | null, enabled: () => boolean): () => void {
  if (!client) return () => {}
  let me: string | null = null
  let known = new Set<string>()
  let channel: ReturnType<SupabaseClient['channel']> | null = null

  const onRow = async (row: AssignedRow) => {
    if (!me || row.assignee !== me || known.has(row.id)) return
    known.add(row.id)
    if (!enabled() || row.status === 'done' || !row.updated_by || row.updated_by === me) return
    try {
      const [project, by] = await Promise.all([
        client.from('team_projects').select('name').eq('id', row.project_id).maybeSingle(),
        client.from('study_group_members').select('display_name').eq('group_id', row.group_id).eq('user_id', row.updated_by).maybeSingle(),
      ])
      const notice = assignedNotice((by.data as { display_name?: string } | null)?.display_name ?? 'Iemand', row.title, (project.data as { name?: string } | null)?.name ?? 'een teamproject')
      const fresh = eventBus.publish({
        id: `team-task:${row.id}:${me}`,
        source: 'study_group',
        type: 'team.assigned',
        at: Date.now(),
        title: notice.title,
        body: notice.body,
        priority: 'high',
        link: { app: 'teams' },
        correlationId: `task:${row.id}`,
      })
      if (fresh) await showLocalNotification(notice.title, notice.body, `team-task:${row.id}`)
    } catch (err) {
      logEvent('sync', `Teams: melding voor een nieuwe taak lukte niet: ${err instanceof Error ? err.message : err}`, true)
    }
  }

  const listen = async (userId: string | null) => {
    me = userId
    if (channel) void client.removeChannel(channel)
    channel = null
    if (!userId) return
    // What is already on your name gives no notice.
    const { data } = await client.from('team_project_tasks').select('id').eq('assignee', userId)
    if (me !== userId) return
    known = new Set(((data ?? []) as { id: string }[]).map((r) => r.id))
    channel = client
      .channel(`team-assigned-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_project_tasks', filter: `assignee=eq.${userId}` }, (payload) => {
        if (payload.new && typeof payload.new === 'object' && 'id' in payload.new) void onRow(payload.new as AssignedRow)
      })
      .subscribe()
  }
  void client.auth.getSession().then(({ data }) => listen(data.session?.user.id ?? null))
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    if ((session?.user.id ?? null) !== me) void listen(session?.user.id ?? null)
  })
  return () => {
    if (channel) void client.removeChannel(channel)
    data.subscription.unsubscribe()
  }
}
