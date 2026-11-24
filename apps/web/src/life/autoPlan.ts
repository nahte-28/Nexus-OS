import { agendaDay, appointmentsOf, DEFAULT_WINDOWS, linkedEvents, PLANNED_NOTE, plannedTitle, planTask, type Busy, type LifeItem, type PlanResult, type StudyWindow, type TaskToPlan } from '@nexus/core'
import { profilesStore } from '../profiles/store'
import { readStorage } from '../state/storage'
import { lifeStore } from './store'

/** The Studieplanner's "Wanneer wil je studeren?" times; Inplannen uses the same ones. */
const WINDOWS_KEY = 'nexus.study.windows'
const DAY = 24 * 60 * 60_000

export function planWindows(): StudyWindow[] {
  try {
    const raw = JSON.parse(readStorage(WINDOWS_KEY) ?? 'null') as unknown
    return Array.isArray(raw) && raw.length > 0 ? (raw as StudyWindow[]) : DEFAULT_WINDOWS
  } catch {
    return DEFAULT_WINDOWS
  }
}

const isBlockOf = (item: LifeItem, title: string) => item.kind === 'appointment' && item.notes === PLANNED_NOTE && item.title === plannedTitle(title)

function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * When you are busy from [now] to [until]: lessons, appointments (also study blocks) and linked
 * calendars. Earlier blocks of the task itself are left out, because planning again replaces them.
 */
export function busyFor(task: string, now: number, until: number, items: LifeItem[] = lifeStore.getSnapshot()): Busy[] {
  const { state } = profilesStore.getSnapshot()
  const input = { calendarEvents: state.calendarEvents, googleEvents: linkedEvents(state), timetable: state.lessons, items: items.filter((i) => !isBlockOf(i, task)), reminders: [] }
  const busy: Busy[] = []
  for (let day = startOfDay(now); day < until; day = startOfDay(day + DAY + 3_600_000)) {
    for (const e of agendaDay(input, day)) {
      if (e.kind === 'lesson' || e.kind === 'appointment' || e.kind === 'event') busy.push({ start: e.at, end: e.end })
    }
  }
  return busy
}

/** A proposal for [task]; nothing is saved yet. */
export function proposeTaskPlan(task: TaskToPlan, now = Date.now()): PlanResult {
  const until = (task.dueAt ?? now + 7 * DAY) + DAY
  return planTask(task, busyFor(task.title, now, until), now, { windows: planWindows() })
}

/** Puts the blocks in the Agenda, with a notice on the phone when each starts; earlier blocks of the task go. */
export async function saveTaskPlan(task: string, plan: PlanResult, now = Date.now()): Promise<number> {
  for (const old of appointmentsOf(lifeStore.getSnapshot())) {
    if (isBlockOf(old, task) && old.startAt > now) await lifeStore.remove(old.id)
  }
  for (const b of plan.blocks) {
    await lifeStore.addAppointment({ title: plannedTitle(task), startAt: b.start, endAt: b.end, location: '', notes: PLANNED_NOTE, remind: [0], target: 'phone' })
  }
  return plan.blocks.length
}

/** "maandag 2 november 18:00–19:30", for lists and NEXUS AI's answer. */
export function blockLabel(b: { start: number; end: number }): string {
  const day = new Date(b.start).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' })
  const t = (at: number) => new Date(at).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })
  return `${day} ${t(b.start)}–${t(b.end)}`
}
