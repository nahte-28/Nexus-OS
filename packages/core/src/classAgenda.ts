/**
 * Klasagenda: the group deadlines of your class teams appear in your own Agenda by themselves,
 * with the usual reminders. A team with a class (e.g. 1IT3) does this unless you switch it off;
 * any other team only when you switch it on. Ticking one off in the Agenda ticks it off in the team
 * and the other way round. Each copy has an id worked out from you and the group deadline, so two
 * devices never make two copies, and a copy you deleted stays deleted. Pure logic.
 */
import type { GroupTask } from './studyGroup'
import type { LifeItem } from './life'

/** What this device last saw of a group deadline and its copy; local, per account. */
export interface ClassAgendaSeen {
  groupId: string
  title: string
  dueAt: number
  done: boolean
}

export interface ClassAgendaState {
  /** Your choice per team; a team without a choice follows its class. */
  groups: Record<string, boolean>
  seen: Record<string, ClassAgendaSeen>
}

export const emptyClassAgenda = (): ClassAgendaState => ({ groups: {}, seen: {} })

export function toClassAgenda(raw: unknown): ClassAgendaState {
  const out = emptyClassAgenda()
  if (!raw || typeof raw !== 'object') return out
  const r = raw as Record<string, unknown>
  if (r.groups && typeof r.groups === 'object') for (const [k, v] of Object.entries(r.groups as Record<string, unknown>)) if (typeof v === 'boolean') out.groups[k] = v
  if (r.seen && typeof r.seen === 'object')
    for (const [k, v] of Object.entries(r.seen as Record<string, unknown>)) {
      const s = v as Partial<ClassAgendaSeen> | null
      if (s && typeof s.groupId === 'string' && typeof s.title === 'string' && typeof s.dueAt === 'number' && typeof s.done === 'boolean') out.seen[k] = { groupId: s.groupId, title: s.title, dueAt: s.dueAt, done: s.done }
    }
  return out
}

/** Whether the deadlines of a team go to your Agenda: your choice, else on for class teams. */
export function classAgendaOn(state: ClassAgendaState, group: { id: string; klas?: string | null }): boolean {
  return state.groups[group.id] ?? !!group.klas
}

export interface ClassAgendaInput {
  /** Every team you are in; only pass this when the list loaded. */
  groups: Array<{ id: string; name: string; klas?: string | null }>
  /** Group deadlines per team that loaded; a team that failed to load is left alone. */
  tasks: Record<string, GroupTask[]>
  /** Every Agenda record, deleted ones included. */
  life: LifeItem[]
  me: string
  /** The id of your copy of a group deadline. */
  copyIdOf: Record<string, string>
  state: ClassAgendaState
  now: number
}

export interface ClassAgendaPlan {
  add: Array<{ id: string; title: string; dueAt: number; notes: string; done: boolean }>
  update: Array<{ id: string; title?: string; dueAt?: number; doneAt?: number | null }>
  remove: string[]
  /** Tick off (or on again) in the team. */
  markTask: Array<{ task: GroupTask; done: boolean }>
  seen: Record<string, ClassAgendaSeen>
}

export const classAgendaNote = (team: string) => `Uit de klasagenda van ${team}. Vink je hem af, dan staat hij ook in het team als klaar.`

/** What to change so your Agenda and your teams agree again. */
export function planClassAgenda(input: ClassAgendaInput): ClassAgendaPlan {
  const plan: ClassAgendaPlan = { add: [], update: [], remove: [], markTask: [], seen: {} }
  const records = new Map(input.life.map((i) => [i.id, i]))
  const names = new Map(input.groups.map((g) => [g.id, g.name]))
  const active = new Set(input.groups.filter((g) => classAgendaOn(input.state, g)).map((g) => g.id))
  const handled = new Set<string>()

  for (const [groupId, tasks] of Object.entries(input.tasks)) {
    if (!active.has(groupId)) continue
    for (const task of tasks) {
      handled.add(task.id)
      const seen = input.state.seen[task.id]
      const copyId = input.copyIdOf[task.id]
      if (!copyId) {
        if (seen) plan.seen[task.id] = seen
        continue
      }
      const copy = records.get(copyId)
      const groupDone = task.doneBy.includes(input.me)
      if (!copy) {
        // Past deadlines are not worth a new copy; one this device already had comes back (sign-in).
        if (!seen && task.dueAt < input.now) continue
        const done = groupDone || (seen?.done ?? false)
        plan.add.push({ id: copyId, title: task.title, dueAt: task.dueAt, notes: classAgendaNote(names.get(groupId) ?? 'je team'), done })
        if (done && !groupDone) plan.markTask.push({ task, done: true })
        plan.seen[task.id] = { groupId, title: task.title, dueAt: task.dueAt, done }
        continue
      }
      if (copy.kind !== 'deadline' || copy.deletedAt !== null) {
        // You deleted your copy: it stays deleted, and the team is left as it is.
        plan.seen[task.id] = { groupId, title: task.title, dueAt: task.dueAt, done: groupDone }
        continue
      }
      const copyDone = copy.doneAt !== null
      let done: boolean
      if (!seen) done = copyDone || groupDone
      else if (copyDone !== seen.done) done = copyDone // changed in the Agenda (wins when both changed)
      else if (groupDone !== seen.done) done = groupDone
      else done = copyDone
      const patch: ClassAgendaPlan['update'][number] = { id: copy.id }
      if (done !== copyDone) patch.doneAt = done ? input.now : null
      if (done !== groupDone) plan.markTask.push({ task, done })
      // The maker of the group deadline changed it: follow, unless you changed your copy yourself.
      if (seen && task.title !== seen.title && copy.title === seen.title) patch.title = task.title
      if (seen && task.dueAt !== seen.dueAt && copy.dueAt === seen.dueAt) patch.dueAt = task.dueAt
      if (Object.keys(patch).length > 1) plan.update.push(patch)
      plan.seen[task.id] = { groupId, title: task.title, dueAt: task.dueAt, done }
    }
  }

  const listed = new Set(input.groups.map((g) => g.id))
  for (const [taskId, seen] of Object.entries(input.state.seen)) {
    if (handled.has(taskId)) continue
    const loaded = seen.groupId in input.tasks
    // A team that did not load keeps its copies until next time.
    if (listed.has(seen.groupId) && active.has(seen.groupId) && !loaded) {
      plan.seen[taskId] = seen
      continue
    }
    // The deadline was removed, you left the team, or you switched it off: open copies go.
    const copy = records.get(input.copyIdOf[taskId] ?? '')
    if (copy && copy.kind === 'deadline' && copy.deletedAt === null && copy.doneAt === null) plan.remove.push(copy.id)
  }
  return plan
}

/** A uuid made from 32 hex characters (the start of a SHA-256), so it fits life_items.id. */
export function uuidFromHex(hex: string): string {
  const h = hex.slice(0, 32).padEnd(32, '0')
  // Version 5 style marks, so it reads as a valid uuid everywhere.
  const v = `${h.slice(0, 12)}5${h.slice(13, 16)}${((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)}${h.slice(17)}`
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20)}`
}

/** The id of your copy of a group deadline: the same on every device, different for every member. */
export async function classCopyId(userId: string, taskId: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`nexus-klasagenda|${userId}|${taskId}`)))
  return uuidFromHex([...bytes].map((b) => b.toString(16).padStart(2, '0')).join(''))
}
