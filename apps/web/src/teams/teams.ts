import {
  DEFAULT_REMIND,
  DISPLAY_NAME_MAX,
  GROUP_NAME_MAX,
  TEAM_PROJECT_NAME_MAX,
  TEAM_TASK_TITLE_MAX,
  type StudyGroup,
  type TeamInvite,
  type TeamMember,
  type TeamProject,
  type TeamProjectTask,
  type TeamRole,
  type TeamTaskStatus,
} from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { lifeStore, type LifeStore } from '../life/store'
import { groupError } from '../study/group'

export const TEAMS_MIGRATION = 'supabase/migrations/20261030150000_teams.sql'

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
  role: TeamRole
}
interface InviteRow {
  id: string
  group_id: string
  code: string
  role: TeamInvite['role']
  expires_at: string
  max_uses: number | null
  uses: number
  created_by: string
}
interface ProjectRow {
  id: string
  group_id: string
  name: string
  created_by: string
}
interface TaskRow {
  id: string
  project_id: string
  group_id: string
  title: string
  status: TeamTaskStatus
  assignee: string | null
  due_at: number | null
  created_by: string
  updated_by: string
  updated_at: string
}

const toGroup = (r: GroupRow): StudyGroup => ({ id: r.id, name: r.name, inviteCode: r.invite_code, createdBy: r.created_by })
const toMember = (r: MemberRow): TeamMember => ({ groupId: r.group_id, userId: r.user_id, displayName: r.display_name, role: r.role })
const toInvite = (r: InviteRow): TeamInvite => ({ id: r.id, groupId: r.group_id, code: r.code, role: r.role, expiresAt: Date.parse(r.expires_at), maxUses: r.max_uses, uses: r.uses, createdBy: r.created_by })
const toProject = (r: ProjectRow): TeamProject => ({ id: r.id, groupId: r.group_id, name: r.name, createdBy: r.created_by })
const toTask = (r: TaskRow): TeamProjectTask => ({
  id: r.id,
  projectId: r.project_id,
  groupId: r.group_id,
  title: r.title,
  status: r.status,
  assignee: r.assignee,
  dueAt: r.due_at === null ? null : Number(r.due_at),
  createdBy: r.created_by,
  updatedBy: r.updated_by,
  updatedAt: Date.parse(r.updated_at),
})

const MEMBER_COLUMNS = 'group_id,user_id,display_name,role'
const TASK_COLUMNS = 'id,project_id,group_id,title,status,assignee,due_at,created_by,updated_by,updated_at'

/** A Dutch message for the Teams app; 'setup:<file>' asks for the SQL. */
export function teamError(error: { code?: string; message?: string } | null | undefined): string {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`
  // A missing role column, invitation table or function: the Teams step is not run yet.
  if (/42P01|42703|42883|PGRST202|PGRST204|PGRST205|could not find the (table|function)|does not exist/i.test(text)) return `setup:${TEAMS_MIGRATION}`
  if (/invite expired/i.test(text)) return 'Deze uitnodiging is vervallen. Vraag een nieuwe.'
  if (/invite used up/i.test(text)) return 'Deze uitnodiging is al zo vaak gebruikt als mocht. Vraag een nieuwe.'
  if (/too many invites/i.test(text)) return 'Dit team heeft al 20 uitnodigingen. Trek er eerst een in.'
  if (/too many team projects/i.test(text)) return 'Dit team heeft al 30 projecten. Verwijder eerst een oud.'
  if (/too many project tasks/i.test(text)) return 'Dit project heeft al 300 taken.'
  return groupError(error)
}

class TeamError extends Error {}
const fail = (error: { code?: string; message?: string }): never => {
  throw new TeamError(teamError(error))
}

/** Teams on Supabase: the study groups with roles, invitations and shared projects. */
export class Teams {
  constructor(
    private client: SupabaseClient,
    private life: LifeStore = lifeStore,
  ) {}

  async me(): Promise<{ id: string; email: string | undefined } | null> {
    const { data } = await this.client.auth.getSession()
    const user = data.session?.user
    return user ? { id: user.id, email: user.email } : null
  }

  async teams(): Promise<StudyGroup[]> {
    const { data, error } = await this.client.from('study_groups').select('id,name,invite_code,created_by').order('created_at')
    if (error) fail(error)
    return (data as GroupRow[]).map(toGroup)
  }

  async create(name: string, displayName: string): Promise<StudyGroup> {
    const { data, error } = await this.client.rpc('create_study_group', { p_name: name.trim().slice(0, GROUP_NAME_MAX), p_display_name: displayName.trim().slice(0, DISPLAY_NAME_MAX) })
    if (error) fail(error)
    return toGroup(data as GroupRow)
  }

  /** Joins with an invitation (10 characters) or a group's permanent code (8); null when unknown. */
  async join(code: { code: string; kind: 'invite' | 'group' }, displayName: string): Promise<StudyGroup | null> {
    const fn = code.kind === 'invite' ? 'join_team' : 'join_study_group'
    const { data, error } = await this.client.rpc(fn, { p_code: code.code, p_display_name: displayName.trim().slice(0, DISPLAY_NAME_MAX) })
    if (error) fail(error)
    const row = data as GroupRow | null
    return row?.id ? toGroup(row) : null
  }

  async load(groupId: string, manage: boolean): Promise<{ members: TeamMember[]; invites: TeamInvite[]; projects: TeamProject[]; tasks: TeamProjectTask[] }> {
    const [members, projects, tasks, invites] = await Promise.all([
      this.client.from('study_group_members').select(MEMBER_COLUMNS).eq('group_id', groupId).order('joined_at'),
      this.client.from('team_projects').select('id,group_id,name,created_by').eq('group_id', groupId).order('created_at'),
      this.client.from('team_project_tasks').select(TASK_COLUMNS).eq('group_id', groupId),
      manage ? this.client.from('team_invites').select('id,group_id,code,role,expires_at,max_uses,uses,created_by').eq('group_id', groupId).order('created_at') : Promise.resolve({ data: [], error: null }),
    ])
    for (const r of [members, projects, tasks, invites]) if (r.error) fail(r.error)
    return {
      members: (members.data as MemberRow[]).map(toMember),
      invites: (invites.data as InviteRow[]).map(toInvite),
      projects: (projects.data as ProjectRow[]).map(toProject),
      tasks: (tasks.data as TaskRow[]).map(toTask),
    }
  }

  async rename(groupId: string, name: string): Promise<void> {
    const { error } = await this.client.from('study_groups').update({ name: name.trim().slice(0, GROUP_NAME_MAX) }).eq('id', groupId)
    if (error) fail(error)
  }

  /** Only the owner; everything in the team goes with it. */
  async remove(groupId: string): Promise<void> {
    const { error } = await this.client.from('study_groups').delete().eq('id', groupId)
    if (error) fail(error)
  }

  async leave(groupId: string): Promise<void> {
    const me = await this.me()
    if (!me) return
    const { error } = await this.client.from('study_group_members').delete().eq('group_id', groupId).eq('user_id', me.id)
    if (error) fail(error)
  }

  async invite(groupId: string, role: TeamInvite['role'], hours: number, maxUses: number | null): Promise<TeamInvite> {
    const { data, error } = await this.client.rpc('create_team_invite', { p_group: groupId, p_role: role, p_hours: hours, p_max_uses: maxUses })
    if (error) fail(error)
    return toInvite(data as InviteRow)
  }

  async withdraw(inviteId: string): Promise<void> {
    const { error } = await this.client.from('team_invites').delete().eq('id', inviteId)
    if (error) fail(error)
  }

  async setRole(groupId: string, userId: string, role: TeamRole): Promise<void> {
    const { error } = await this.client.rpc('set_team_role', { p_group: groupId, p_user: userId, p_role: role })
    if (error) fail(error)
  }

  async removeMember(groupId: string, userId: string): Promise<void> {
    const { error } = await this.client.rpc('remove_team_member', { p_group: groupId, p_user: userId })
    if (error) fail(error)
  }

  async transfer(groupId: string, userId: string): Promise<void> {
    const { error } = await this.client.rpc('transfer_team', { p_group: groupId, p_user: userId })
    if (error) fail(error)
  }

  async addProject(groupId: string, name: string): Promise<void> {
    const { error } = await this.client.from('team_projects').insert({ group_id: groupId, name: name.trim().slice(0, TEAM_PROJECT_NAME_MAX) })
    if (error) fail(error)
  }

  async renameProject(projectId: string, name: string): Promise<void> {
    const { error } = await this.client.from('team_projects').update({ name: name.trim().slice(0, TEAM_PROJECT_NAME_MAX) }).eq('id', projectId)
    if (error) fail(error)
  }

  async removeProject(projectId: string): Promise<void> {
    const { error } = await this.client.from('team_projects').delete().eq('id', projectId)
    if (error) fail(error)
  }

  async addTask(project: TeamProject, title: string, assignee: string | null, dueAt: number | null): Promise<void> {
    const { error } = await this.client
      .from('team_project_tasks')
      .insert({ project_id: project.id, group_id: project.groupId, title: title.trim().slice(0, TEAM_TASK_TITLE_MAX), assignee, due_at: dueAt })
    if (error) fail(error)
  }

  async updateTask(taskId: string, change: Partial<{ title: string; status: TeamTaskStatus; assignee: string | null; dueAt: number | null }>): Promise<void> {
    const row: Record<string, unknown> = {}
    if (change.title !== undefined) row.title = change.title.trim().slice(0, TEAM_TASK_TITLE_MAX)
    if (change.status !== undefined) row.status = change.status
    if (change.assignee !== undefined) row.assignee = change.assignee
    if (change.dueAt !== undefined) row.due_at = change.dueAt
    const { error } = await this.client.from('team_project_tasks').update(row).eq('id', taskId)
    if (error) fail(error)
  }

  async removeTask(taskId: string): Promise<void> {
    const { error } = await this.client.from('team_project_tasks').delete().eq('id', taskId)
    if (error) fail(error)
  }

  /** Puts a task with a date in your own Agenda, with the usual reminders. */
  takeOver(task: Pick<TeamProjectTask, 'title' | 'dueAt'>, projectName: string): Promise<string> | null {
    if (task.dueAt === null) return null
    return this.life.addDeadline({ title: task.title, dueAt: task.dueAt, projectId: null, notes: `Overgenomen uit het teamproject ${projectName}.`, remind: DEFAULT_REMIND, target: 'phone' })
  }

  /** Calls [onChange] when anything in the team changes; returns the way to stop listening. */
  watch(groupId: string, onChange: () => void): () => void {
    let channel = this.client.channel(`team-${groupId}`)
    for (const table of ['study_group_members', 'team_projects', 'team_project_tasks']) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `group_id=eq.${groupId}` }, onChange)
    }
    channel.subscribe()
    return () => void this.client.removeChannel(channel)
  }
}
