import {
  DEFAULT_REMIND,
  DISPLAY_NAME_MAX,
  GROUP_NAME_MAX,
  reconcileShared,
  shareable,
  type GroupMember,
  type GroupTask,
  type LifeItem,
  type SharedItem,
  type StudyGroup,
} from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logEvent } from '../devtools/log'
import { lifeStore, type LifeStore } from '../life/store'

export const GROUP_MIGRATION = 'supabase/migrations/20261028140000_study_groups.sql'
const SYNC_DEBOUNCE_MS = 3000

interface GroupRow {
  id: string
  name: string
  invite_code: string
  created_by: string
}
interface MemberRow {
  group_id: string
  user_id: string
  display_name: string
}
interface ItemRow {
  group_id: string
  user_id: string
  source_id: string
  kind: SharedItem['kind']
  title: string
  at: number
  end_at: number | null
  done: boolean
}

interface TaskRow {
  id: string
  group_id: string
  created_by: string
  title: string
  due_at: number
}
interface DoneRow {
  task_id: string
  user_id: string
}

const toGroup = (r: GroupRow): StudyGroup => ({ id: r.id, name: r.name, inviteCode: r.invite_code, createdBy: r.created_by })
const toMember = (r: MemberRow): GroupMember => ({ groupId: r.group_id, userId: r.user_id, displayName: r.display_name })
const toItem = (r: ItemRow): SharedItem => ({ groupId: r.group_id, userId: r.user_id, sourceId: r.source_id, kind: r.kind, title: r.title, at: Number(r.at), endAt: r.end_at === null ? null : Number(r.end_at), done: r.done })
const toRow = (i: SharedItem): ItemRow => ({ group_id: i.groupId, user_id: i.userId, source_id: i.sourceId, kind: i.kind, title: i.title.slice(0, 160), at: i.at, end_at: i.endAt, done: i.done })

/** A Dutch message for the Studie app; 'setup:<file>' asks for the SQL. */
export function groupError(error: { code?: string; message?: string } | null | undefined): string {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`
  if (/42P01|42883|PGRST202|PGRST205|could not find the (table|function)|does not exist/i.test(text)) return `setup:${GROUP_MIGRATION}`
  if (/too many group tasks/i.test(text)) return 'Deze groep heeft al 100 groepsdeadlines. Verwijder eerst oude.'
  if (/too many groups/i.test(text)) return 'Je kunt hoogstens 10 groepen maken.'
  if (/group full/i.test(text)) return 'Deze groep is vol: er kunnen 30 leden in.'
  if (/JWT|PGRST30|not signed in/i.test(text)) return 'Je sessie is verlopen. Meld je af en opnieuw aan.'
  if (/fetch|network/i.test(text)) return 'Geen verbinding. Probeer het zo opnieuw.'
  return error?.message || 'Er ging iets mis met de studiegroep.'
}

class GroupError extends Error {}
const fail = (error: { code?: string; message?: string }): never => {
  throw new GroupError(groupError(error))
}

/** A suggestion for your name in the group: the part of your e-mail address before the @. */
export function suggestedName(email: string | undefined): string {
  return (email?.split('@')[0] ?? '').replace(/[._]+/g, ' ').trim().slice(0, DISPLAY_NAME_MAX)
}

/** Studiegroep on Supabase. Row level security keeps every read to your own groups. */
export class StudyGroups {
  constructor(
    private client: SupabaseClient,
    private life: LifeStore = lifeStore,
  ) {}

  async me(): Promise<{ id: string; email: string | undefined } | null> {
    const { data } = await this.client.auth.getSession()
    const user = data.session?.user
    return user ? { id: user.id, email: user.email } : null
  }

  async groups(): Promise<StudyGroup[]> {
    const { data, error } = await this.client.from('study_groups').select('id,name,invite_code,created_by').order('created_at')
    if (error) fail(error)
    return (data as GroupRow[]).map(toGroup)
  }

  async create(name: string, displayName: string): Promise<StudyGroup> {
    const { data, error } = await this.client.rpc('create_study_group', { p_name: name.trim().slice(0, GROUP_NAME_MAX), p_display_name: displayName.trim().slice(0, DISPLAY_NAME_MAX) })
    if (error) fail(error)
    return toGroup(data as GroupRow)
  }

  /** Null when no group has this code. */
  async join(code: string, displayName: string): Promise<StudyGroup | null> {
    const { data, error } = await this.client.rpc('join_study_group', { p_code: code, p_display_name: displayName.trim().slice(0, DISPLAY_NAME_MAX) })
    if (error) fail(error)
    const row = data as GroupRow | null
    return row?.id ? toGroup(row) : null
  }

  /** Leaves the group; what you shared there goes with you. */
  async leave(groupId: string): Promise<void> {
    const me = await this.me()
    if (!me) return
    const { error } = await this.client.from('study_group_members').delete().eq('group_id', groupId).eq('user_id', me.id)
    if (error) fail(error)
  }

  async load(groupId: string): Promise<{ members: GroupMember[]; items: SharedItem[]; tasks: GroupTask[] }> {
    const [members, items, tasks, done] = await Promise.all([
      this.client.from('study_group_members').select('group_id,user_id,display_name').eq('group_id', groupId).order('joined_at'),
      this.client.from('study_group_items').select('group_id,user_id,source_id,kind,title,at,end_at,done').eq('group_id', groupId),
      this.client.from('study_group_tasks').select('id,group_id,created_by,title,due_at').eq('group_id', groupId),
      this.client.from('study_group_task_done').select('task_id,user_id').eq('group_id', groupId),
    ])
    if (members.error) fail(members.error)
    if (items.error) fail(items.error)
    // Group deadlines came with a later SQL step; without it the rest of the group still works.
    const taskError = tasks.error ?? done.error
    if (taskError && !groupError(taskError).startsWith('setup:')) fail(taskError)
    const doneBy = new Map<string, string[]>()
    for (const d of taskError ? [] : (done.data as DoneRow[])) doneBy.set(d.task_id, [...(doneBy.get(d.task_id) ?? []), d.user_id])
    return {
      members: (members.data as MemberRow[]).map(toMember),
      items: (items.data as ItemRow[]).map(toItem),
      tasks: taskError ? [] : (tasks.data as TaskRow[]).map((t) => ({ id: t.id, groupId: t.group_id, createdBy: t.created_by, title: t.title, dueAt: Number(t.due_at), doneBy: doneBy.get(t.id) ?? [] })),
    }
  }

  async addTask(groupId: string, title: string, dueAt: number): Promise<void> {
    const { error } = await this.client.from('study_group_tasks').insert({ group_id: groupId, title: title.trim().slice(0, 160), due_at: dueAt })
    if (error) fail(error)
  }

  /** Only the member who added it can remove a group deadline. */
  async removeTask(taskId: string): Promise<void> {
    const { error } = await this.client.from('study_group_tasks').delete().eq('id', taskId)
    if (error) fail(error)
  }

  /** Ticks a group deadline off (or on again) for you alone. */
  async setTaskDone(task: GroupTask, done: boolean): Promise<void> {
    const me = await this.me()
    if (!me) return
    const { error } = done
      ? await this.client.from('study_group_task_done').upsert({ task_id: task.id, group_id: task.groupId, user_id: me.id }, { onConflict: 'task_id,user_id' })
      : await this.client.from('study_group_task_done').delete().eq('task_id', task.id).eq('user_id', me.id)
    if (error) fail(error)
  }

  /** Calls [onChange] when anything in the group changes; returns the way to stop listening. */
  watch(groupId: string, onChange: () => void): () => void {
    let channel = this.client.channel(`study-group-${groupId}`)
    for (const table of ['study_group_items', 'study_group_members', 'study_group_tasks', 'study_group_task_done']) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `group_id=eq.${groupId}` }, onChange)
    }
    channel.subscribe()
    return () => void this.client.removeChannel(channel)
  }

  /** Shares a deadline, exam or study block from your Agenda with the group. */
  async share(groupId: string, sourceId: string, now = Date.now()): Promise<void> {
    const me = await this.me()
    const source = this.life.getSnapshot().find((i) => i.id === sourceId)
    const fields = source ? shareable(source, now) : null
    if (!me || !fields) return
    const { error } = await this.client.from('study_group_items').upsert(toRow({ ...fields, groupId, userId: me.id }), { onConflict: 'group_id,user_id,source_id' })
    if (error) fail(error)
  }

  async unshare(groupId: string, sourceId: string): Promise<void> {
    const me = await this.me()
    if (!me) return
    const { error } = await this.client.from('study_group_items').delete().eq('group_id', groupId).eq('user_id', me.id).eq('source_id', sourceId)
    if (error) fail(error)
  }

  /** Brings what you share, in every group, in line with your Agenda. */
  async syncMine(items: LifeItem[] = this.life.getSnapshot(), now = Date.now()): Promise<void> {
    const me = await this.me()
    if (!me) return
    const { data, error } = await this.client.from('study_group_items').select('group_id,user_id,source_id,kind,title,at,end_at,done').eq('user_id', me.id)
    if (error) fail(error)
    const { put, remove } = reconcileShared((data as ItemRow[]).map(toItem), items, now)
    if (put.length > 0) {
      const { error: e } = await this.client.from('study_group_items').upsert(put.map(toRow), { onConflict: 'group_id,user_id,source_id' })
      if (e) fail(e)
    }
    for (const r of remove) {
      const { error: e } = await this.client.from('study_group_items').delete().eq('group_id', r.groupId).eq('user_id', me.id).eq('source_id', r.sourceId)
      if (e) fail(e)
    }
  }

  /** Puts a groupmate's deadline (or a group deadline) in your own Agenda, with the usual reminders. */
  takeOver(item: Pick<SharedItem, 'title' | 'at'>): Promise<string> {
    return this.life.addDeadline({ title: item.title, dueAt: item.at, projectId: null, notes: 'Overgenomen uit je studiegroep.', remind: DEFAULT_REMIND, target: 'phone' })
  }
}

/** Keeps your shared copies up to date while NEXUS runs, also when the Studie app is closed. */
export function startGroupSync(client: SupabaseClient | null, life: LifeStore = lifeStore): () => void {
  if (!client) return () => {}
  const groups = new StudyGroups(client, life)
  let timer: ReturnType<typeof setTimeout> | undefined
  let quiet = false
  const run = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      void groups.syncMine().then(
        () => (quiet = false),
        (err: unknown) => {
          // Without the migration nothing is shared yet, so there is nothing to keep up to date.
          if (String(err).includes('setup:') || quiet) return
          quiet = true
          logEvent('sync', `Studiegroep bijwerken mislukt: ${String(err)}`, true)
        },
      )
    }, SYNC_DEBOUNCE_MS)
  }
  const unsubscribe = life.subscribe(run)
  const { data } = client.auth.onAuthStateChange((event) => event === 'SIGNED_IN' && run())
  return () => {
    clearTimeout(timer)
    unsubscribe()
    data.subscription.unsubscribe()
  }
}
