/**
 * Project Hub: projects from idea to delivery. The projects themselves are the Agenda projects
 * (life_items kind 'project'), so their deadlines stay where they are; the hub adds a board of tasks
 * with priorities and dependencies, milestones, a status and an activity log. One document per
 * account (user_settings key 'projecthub'); every entry merges on its own, newest edit wins.
 * Pure logic.
 */

export type BoardColumn = 'todo' | 'doing' | 'review' | 'done'
export const BOARD_COLUMNS: BoardColumn[] = ['todo', 'doing', 'review', 'done']
export const COLUMN_LABELS: Record<BoardColumn, string> = { todo: 'Te doen', doing: 'Bezig', review: 'Nakijken', done: 'Klaar' }

export type TaskPriority = 'low' | 'normal' | 'high'
export const PRIORITY_NAMES: Record<TaskPriority, string> = { low: 'Laag', normal: 'Normaal', high: 'Hoog' }

export type ProjectStatus = 'idea' | 'active' | 'paused' | 'done'
export const PROJECT_STATUSES: ProjectStatus[] = ['idea', 'active', 'paused', 'done']
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = { idea: 'Idee', active: 'Bezig', paused: 'Gepauzeerd', done: 'Opgeleverd' }

export interface ProjectMeta {
  /** The id of the Agenda project. */
  id: string
  description: string
  status: ProjectStatus
  updatedAt: number
}

export interface HubTask {
  id: string
  projectId: string
  title: string
  notes: string
  column: BoardColumn
  priority: TaskPriority
  /** Place in its column, lowest first. */
  order: number
  dueAt: number | null
  milestoneId: string | null
  /** Tasks that must be done first. */
  dependsOn: string[]
  /** The Agenda deadline made from this task, or null. */
  deadlineId: string | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface Milestone {
  id: string
  projectId: string
  title: string
  dueAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface ProjectActivity {
  id: string
  projectId: string
  at: number
  text: string
}

export interface ProjectHubState {
  meta: ProjectMeta[]
  tasks: HubTask[]
  milestones: Milestone[]
  activity: ProjectActivity[]
  revision: number
}

export const MAX_HUB_TASKS = 1000
export const MAX_MILESTONES = 200
export const MAX_ACTIVITY = 300
const MAX_TITLE = 200
const MAX_NOTES = 4000

export const emptyProjectHub = (): ProjectHubState => ({ meta: [], tasks: [], milestones: [], activity: [], revision: 0 })

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const list = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null && typeof i.id === 'string') : [])
const pick = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback)

export function parseProjectHub(raw: unknown): ProjectHubState {
  if (typeof raw !== 'object' || raw === null) return emptyProjectHub()
  const v = raw as Record<string, unknown>
  const meta = list(v.meta).map((m) => ({ id: m.id as string, description: str(m.description, MAX_NOTES), status: pick(m.status, PROJECT_STATUSES, 'active'), updatedAt: num(m.updatedAt) ?? 0 }))
  const tasks = list(v.tasks).flatMap((t): HubTask[] => {
    if (typeof t.projectId !== 'string') return []
    const createdAt = num(t.createdAt) ?? 0
    return [
      {
        id: t.id as string,
        projectId: t.projectId,
        title: str(t.title, MAX_TITLE),
        notes: str(t.notes, MAX_NOTES),
        column: pick(t.column, BOARD_COLUMNS, 'todo'),
        priority: pick(t.priority, ['low', 'normal', 'high'] as const, 'normal'),
        order: num(t.order) ?? 0,
        dueAt: num(t.dueAt),
        milestoneId: typeof t.milestoneId === 'string' ? t.milestoneId : null,
        dependsOn: Array.isArray(t.dependsOn) ? [...new Set(t.dependsOn.filter((d): d is string => typeof d === 'string' && d !== t.id))] : [],
        deadlineId: typeof t.deadlineId === 'string' ? t.deadlineId : null,
        createdAt,
        updatedAt: num(t.updatedAt) ?? createdAt,
        deletedAt: num(t.deletedAt),
      },
    ]
  })
  const milestones = list(v.milestones).flatMap((m): Milestone[] => {
    const dueAt = num(m.dueAt)
    if (typeof m.projectId !== 'string' || dueAt === null) return []
    return [{ id: m.id as string, projectId: m.projectId, title: str(m.title, MAX_TITLE), dueAt, updatedAt: num(m.updatedAt) ?? 0, deletedAt: num(m.deletedAt) }]
  })
  const activity = list(v.activity).flatMap((a): ProjectActivity[] => {
    const at = num(a.at)
    return at === null || typeof a.projectId !== 'string' ? [] : [{ id: a.id as string, projectId: a.projectId, at, text: str(a.text, 300) }]
  })
  return { meta, tasks, milestones, activity: activity.sort((a, b) => b.at - a.at).slice(0, MAX_ACTIVITY), revision: num(v.revision) ?? 0 }
}

function mergeById<T extends { id: string; updatedAt: number }>(a: T[], b: T[]): T[] {
  const byId = new Map(a.map((x) => [x.id, x]))
  for (const x of b) {
    const mine = byId.get(x.id)
    if (!mine || x.updatedAt > mine.updatedAt) byId.set(x.id, x)
  }
  return [...byId.values()]
}

export function mergeProjectHub(a: ProjectHubState, b: ProjectHubState): ProjectHubState {
  const activity = new Map([...a.activity, ...b.activity].map((x) => [x.id, x]))
  return {
    meta: mergeById(a.meta, b.meta),
    tasks: mergeById(a.tasks, b.tasks),
    milestones: mergeById(a.milestones, b.milestones),
    activity: [...activity.values()].sort((x, y) => y.at - x.at).slice(0, MAX_ACTIVITY),
    revision: Math.max(a.revision, b.revision),
  }
}

// Reading -------------------------------------------------------------------------------------------

export const liveTasks = (s: ProjectHubState, projectId: string) => s.tasks.filter((t) => t.projectId === projectId && t.deletedAt === null)
export const liveMilestones = (s: ProjectHubState, projectId: string) => s.milestones.filter((m) => m.projectId === projectId && m.deletedAt === null).sort((a, b) => a.dueAt - b.dueAt)

export function projectMeta(s: ProjectHubState, projectId: string): ProjectMeta {
  return s.meta.find((m) => m.id === projectId) ?? { id: projectId, description: '', status: 'active', updatedAt: 0 }
}

/** The tasks of one column, in their order. */
export function columnTasks(s: ProjectHubState, projectId: string, column: BoardColumn): HubTask[] {
  return liveTasks(s, projectId)
    .filter((t) => t.column === column)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
}

/** The tasks [task] waits for that are not done yet. */
export function blockedBy(s: ProjectHubState, task: HubTask): HubTask[] {
  return task.dependsOn.flatMap((id) => s.tasks.filter((t) => t.id === id && t.deletedAt === null && t.column !== 'done'))
}

/** Whether making [taskId] wait for [dependsOn] would create a loop. */
export function wouldCycle(s: ProjectHubState, taskId: string, dependsOn: string): boolean {
  if (taskId === dependsOn) return true
  const seen = new Set<string>()
  const stack = [dependsOn]
  while (stack.length > 0) {
    const id = stack.pop() as string
    if (id === taskId) return true
    if (seen.has(id)) continue
    seen.add(id)
    stack.push(...(s.tasks.find((t) => t.id === id && t.deletedAt === null)?.dependsOn ?? []))
  }
  return false
}

export function hubProgress(tasks: HubTask[]): { done: number; total: number; percent: number } {
  const done = tasks.filter((t) => t.column === 'done').length
  return { done, total: tasks.length, percent: tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100) }
}

export function milestoneProgress(s: ProjectHubState, milestone: Milestone) {
  return hubProgress(liveTasks(s, milestone.projectId).filter((t) => t.milestoneId === milestone.id))
}

export type TimelineEntry =
  | { kind: 'milestone'; at: number; title: string; id: string; done: boolean }
  | { kind: 'task'; at: number; title: string; id: string; done: boolean }
  | { kind: 'deadline'; at: number; title: string; id: string; done: boolean }

/** Milestones, tasks with a date and the project's Agenda deadlines, by date. */
export function projectTimeline(s: ProjectHubState, projectId: string, deadlines: Array<{ id: string; title: string; dueAt: number; doneAt: number | null; projectId: string | null; deletedAt: number | null }>): TimelineEntry[] {
  const linked = new Set(liveTasks(s, projectId).flatMap((t) => (t.deadlineId ? [t.deadlineId] : [])))
  const entries: TimelineEntry[] = [
    ...liveMilestones(s, projectId).map((m) => {
      const p = milestoneProgress(s, m)
      return { kind: 'milestone' as const, at: m.dueAt, title: m.title, id: m.id, done: p.total > 0 && p.done === p.total }
    }),
    ...liveTasks(s, projectId).flatMap((t) => (t.dueAt === null ? [] : [{ kind: 'task' as const, at: t.dueAt, title: t.title, id: t.id, done: t.column === 'done' }])),
    // A deadline made from a task shows once, as that task.
    ...deadlines.filter((d) => d.projectId === projectId && d.deletedAt === null && !linked.has(d.id)).map((d) => ({ kind: 'deadline' as const, at: d.dueAt, title: d.title, id: d.id, done: d.doneAt !== null })),
  ]
  return entries.sort((a, b) => a.at - b.at || a.title.localeCompare(b.title, 'nl'))
}

export const projectActivity = (s: ProjectHubState, projectId: string) => s.activity.filter((a) => a.projectId === projectId)

// Changing ------------------------------------------------------------------------------------------

function log(s: ProjectHubState, projectId: string, text: string, now: number, id: string): ProjectHubState {
  return { ...s, activity: [{ id, projectId, at: now, text }, ...s.activity].slice(0, MAX_ACTIVITY) }
}

export function saveProjectMeta(s: ProjectHubState, projectId: string, patch: Partial<Pick<ProjectMeta, 'description' | 'status'>>, now: number): ProjectHubState {
  const old = projectMeta(s, projectId)
  const next: ProjectMeta = { ...old, description: (patch.description ?? old.description).slice(0, MAX_NOTES), status: patch.status ?? old.status, updatedAt: now }
  const meta = s.meta.some((m) => m.id === projectId) ? s.meta.map((m) => (m.id === projectId ? next : m)) : [...s.meta, next]
  const changed = { ...s, meta }
  return patch.status && patch.status !== old.status ? log(changed, projectId, `Status: ${PROJECT_STATUS_LABELS[patch.status]}`, now, `status-${projectId}-${now}`) : changed
}

export type TaskDraft = Pick<HubTask, 'title'> & Partial<Pick<HubTask, 'notes' | 'column' | 'priority' | 'dueAt' | 'milestoneId'>>

export function addTask(s: ProjectHubState, projectId: string, draft: TaskDraft, id: string, now: number): ProjectHubState | { error: string } {
  const title = draft.title.trim().slice(0, MAX_TITLE)
  if (!title) return { error: 'Geef de taak een titel.' }
  if (s.tasks.filter((t) => t.deletedAt === null).length >= MAX_HUB_TASKS) return { error: `Hoogstens ${MAX_HUB_TASKS} taken.` }
  const column = draft.column ?? 'todo'
  const last = columnTasks(s, projectId, column).at(-1)
  const task: HubTask = {
    id,
    projectId,
    title,
    notes: (draft.notes ?? '').slice(0, MAX_NOTES),
    column,
    priority: draft.priority ?? 'normal',
    order: (last?.order ?? 0) + 1,
    dueAt: draft.dueAt ?? null,
    milestoneId: draft.milestoneId ?? null,
    dependsOn: [],
    deadlineId: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  return log({ ...s, tasks: [...s.tasks, task] }, projectId, `Taak toegevoegd: ${title}`, now, `add-${id}`)
}

export function updateTask(s: ProjectHubState, id: string, patch: Partial<Pick<HubTask, 'title' | 'notes' | 'priority' | 'dueAt' | 'milestoneId' | 'deadlineId'>>, now: number): ProjectHubState {
  return { ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch, title: (patch.title ?? t.title).slice(0, MAX_TITLE) || t.title, updatedAt: now } : t)) }
}

/** Moves [id] to [column] at [index] (end when left out) and renumbers that column. */
export function moveTask(s: ProjectHubState, id: string, column: BoardColumn, now: number, index?: number): ProjectHubState {
  const task = s.tasks.find((t) => t.id === id && t.deletedAt === null)
  if (!task) return s
  const others = columnTasks(s, task.projectId, column).filter((t) => t.id !== id)
  const at = index === undefined ? others.length : Math.max(0, Math.min(index, others.length))
  const ordered = [...others.slice(0, at), task, ...others.slice(at)]
  const orders = new Map(ordered.map((t, i) => [t.id, i + 1]))
  const tasks = s.tasks.map((t) => {
    const order = orders.get(t.id)
    if (order === undefined) return t
    if (t.id === id) return { ...t, column, order, updatedAt: now }
    return order === t.order ? t : { ...t, order, updatedAt: now }
  })
  const next = { ...s, tasks }
  return column !== task.column ? log(next, task.projectId, `${task.title} → ${COLUMN_LABELS[column]}`, now, `move-${id}-${now}`) : next
}

export function removeTask(s: ProjectHubState, id: string, now: number): ProjectHubState {
  const task = s.tasks.find((t) => t.id === id)
  if (!task) return s
  // Others no longer wait for it.
  const tasks = s.tasks.map((t) => (t.id === id ? { ...t, deletedAt: now, updatedAt: now } : t.dependsOn.includes(id) ? { ...t, dependsOn: t.dependsOn.filter((d) => d !== id), updatedAt: now } : t))
  return log({ ...s, tasks }, task.projectId, `Taak weggehaald: ${task.title}`, now, `remove-${id}`)
}

export function setDependency(s: ProjectHubState, taskId: string, dependsOn: string, on: boolean, now: number): ProjectHubState | { error: string } {
  if (on && wouldCycle(s, taskId, dependsOn)) return { error: 'Dan wachten die taken op elkaar.' }
  return {
    ...s,
    tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, dependsOn: on ? [...new Set([...t.dependsOn, dependsOn])] : t.dependsOn.filter((d) => d !== dependsOn), updatedAt: now } : t)),
  }
}

export function saveMilestone(s: ProjectHubState, milestone: Pick<Milestone, 'id' | 'projectId' | 'title' | 'dueAt'>, now: number): ProjectHubState | { error: string } {
  const title = milestone.title.trim().slice(0, MAX_TITLE)
  if (!title) return { error: 'Geef de mijlpaal een naam.' }
  const exists = s.milestones.some((m) => m.id === milestone.id)
  if (!exists && s.milestones.filter((m) => m.deletedAt === null).length >= MAX_MILESTONES) return { error: `Hoogstens ${MAX_MILESTONES} mijlpalen.` }
  const entry: Milestone = { ...milestone, title, updatedAt: now, deletedAt: null }
  const next = { ...s, milestones: exists ? s.milestones.map((m) => (m.id === milestone.id ? entry : m)) : [...s.milestones, entry] }
  return exists ? next : log(next, milestone.projectId, `Mijlpaal: ${title}`, now, `milestone-${milestone.id}`)
}

export function removeMilestone(s: ProjectHubState, id: string, now: number): ProjectHubState {
  return {
    ...s,
    milestones: s.milestones.map((m) => (m.id === id ? { ...m, deletedAt: now, updatedAt: now } : m)),
    tasks: s.tasks.map((t) => (t.milestoneId === id ? { ...t, milestoneId: null, updatedAt: now } : t)),
  }
}
