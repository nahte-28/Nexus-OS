/**
 * Teams: a study group with roles, invitations that expire and shared project tasks. The database
 * decides who may do what (supabase/migrations/20261030150000_teams.sql); these rules mirror it so
 * the app only offers what will work. Pure logic; the web app talks to Supabase.
 */
import type { GroupMember } from './studyGroup'

export type TeamRole = 'owner' | 'admin' | 'member' | 'viewer'
export const TEAM_ROLES: TeamRole[] = ['owner', 'admin', 'member', 'viewer']
export const TEAM_ROLE_LABELS: Record<TeamRole, string> = { owner: 'Eigenaar', admin: 'Beheerder', member: 'Lid', viewer: 'Kijker' }
export const TEAM_ROLE_HELP: Record<TeamRole, string> = {
  owner: 'Alles, ook het team overdragen of verwijderen.',
  admin: 'Uitnodigen, leden en kijkers beheren, het team hernoemen.',
  member: 'Delen, groepsdeadlines, projecten en taken.',
  viewer: 'Leest mee, verandert niets.',
}

export interface TeamMember extends GroupMember {
  role: TeamRole
}

export type TeamAction = 'edit' | 'manage' | 'inviteAdmin' | 'delete' | 'transfer'

/** What a role may do in its team. */
export function teamCan(role: TeamRole | null | undefined, action: TeamAction): boolean {
  if (!role) return false
  switch (action) {
    case 'edit':
      return role !== 'viewer'
    case 'manage':
      return role === 'owner' || role === 'admin'
    case 'inviteAdmin':
    case 'delete':
    case 'transfer':
      return role === 'owner'
  }
}

/** The roles you may give someone; empty when you may not touch them (yourself, the owner, an equal). */
export function roleChoices(mine: TeamRole | null | undefined, theirs: TeamRole, self = false): TeamRole[] {
  if (self || theirs === 'owner') return []
  if (mine === 'owner') return ['admin', 'member', 'viewer']
  if (mine === 'admin' && (theirs === 'member' || theirs === 'viewer')) return ['member', 'viewer']
  return []
}

export const canRemove = (mine: TeamRole | null | undefined, theirs: TeamRole, self = false) => roleChoices(mine, theirs, self).length > 0

/** The owner first, then admins, members and viewers; by name within a role. */
export function sortMembers(members: TeamMember[]): TeamMember[] {
  return [...members].sort((a, b) => TEAM_ROLES.indexOf(a.role) - TEAM_ROLES.indexOf(b.role) || a.displayName.localeCompare(b.displayName))
}

export interface TeamInvite {
  id: string
  groupId: string
  code: string
  role: Exclude<TeamRole, 'owner'>
  expiresAt: number
  maxUses: number | null
  uses: number
  createdBy: string
}

export const INVITE_DURATIONS: Array<{ hours: number; label: string }> = [
  { hours: 1, label: '1 uur' },
  { hours: 24, label: '1 dag' },
  { hours: 168, label: '1 week' },
  { hours: 720, label: '30 dagen' },
]
export const INVITES_MAX = 20

export type InviteState = 'active' | 'expired' | 'usedUp'

export function inviteState(invite: TeamInvite, now: number): InviteState {
  if (invite.expiresAt <= now) return 'expired'
  if (invite.maxUses !== null && invite.uses >= invite.maxUses) return 'usedUp'
  return 'active'
}

const left = (ms: number) => {
  const minutes = Math.max(1, Math.round(ms / 60_000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} uur`
  return `${Math.round(hours / 24)} dagen`
}

/** One line under an invitation: how long it still works and how often it was used. */
export function inviteSummary(invite: TeamInvite, now: number): string {
  const state = inviteState(invite, now)
  const uses = invite.maxUses === null ? `${invite.uses} keer gebruikt` : `${invite.uses} van ${invite.maxUses} keer gebruikt`
  if (state === 'expired') return `Vervallen · ${uses}`
  if (state === 'usedUp') return `Opgebruikt · ${uses}`
  return `Nog ${left(invite.expiresAt - now)} geldig · ${uses}`
}

/**
 * A code someone typed: 10 characters is an invitation (with a role and an end), 8 is the
 * permanent code of a study group. Spaces, dashes and case don't matter.
 */
export function normalizeTeamCode(raw: string): { code: string; kind: 'invite' | 'group' } | null {
  const code = raw.toUpperCase().replace(/[\s-]/g, '')
  if (/^[A-HJ-NP-Z2-9]{10}$/.test(code)) return { code, kind: 'invite' }
  if (/^[A-HJ-NP-Z2-9]{8}$/.test(code)) return { code, kind: 'group' }
  return null
}

export const formatTeamCode = (code: string) => (code.length === 10 ? `${code.slice(0, 5)}-${code.slice(5)}` : `${code.slice(0, 4)}-${code.slice(4)}`)

export interface TeamProject {
  id: string
  groupId: string
  name: string
  createdBy: string
}

export type TeamTaskStatus = 'todo' | 'doing' | 'done'
export const TEAM_TASK_STATUSES: TeamTaskStatus[] = ['todo', 'doing', 'done']
export const TEAM_TASK_STATUS_LABELS: Record<TeamTaskStatus, string> = { todo: 'Te doen', doing: 'Bezig', done: 'Klaar' }

export interface TeamProjectTask {
  id: string
  projectId: string
  groupId: string
  title: string
  status: TeamTaskStatus
  assignee: string | null
  dueAt: number | null
  createdBy: string
  updatedBy: string
  updatedAt: number
}

export const TEAM_PROJECTS_MAX = 30
export const TEAM_PROJECT_TASKS_MAX = 300
export const TEAM_PROJECT_NAME_MAX = 80
export const TEAM_TASK_TITLE_MAX = 160

const byDue = (a: TeamProjectTask, b: TeamProjectTask) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || a.title.localeCompare(b.title)

/** A project's tasks per column, soonest first and tasks without a date last. */
export function teamBoard(tasks: TeamProjectTask[], projectId: string): Record<TeamTaskStatus, TeamProjectTask[]> {
  const board: Record<TeamTaskStatus, TeamProjectTask[]> = { todo: [], doing: [], done: [] }
  for (const t of tasks) if (t.projectId === projectId) board[t.status].push(t)
  for (const s of TEAM_TASK_STATUSES) board[s].sort(byDue)
  return board
}

export function teamProjectProgress(tasks: TeamProjectTask[], projectId: string): { done: number; total: number } {
  const mine = tasks.filter((t) => t.projectId === projectId)
  return { done: mine.filter((t) => t.status === 'done').length, total: mine.length }
}

/** Open tasks assigned to you, over every project of the team, soonest first. */
export function myTeamTasks(tasks: TeamProjectTask[], me: string): TeamProjectTask[] {
  return tasks.filter((t) => t.assignee === me && t.status !== 'done').sort(byDue)
}

/** The name to show for a user id: "jij" for yourself, "Oud lid" for someone who left. */
export function memberName(members: GroupMember[], userId: string | null, me: string): string {
  if (!userId) return 'Niemand'
  if (userId === me) return 'jij'
  return members.find((m) => m.userId === userId)?.displayName ?? 'Oud lid'
}
