/**
 * Studieplanner: a focus timer (pomodoro) and study blocks planned before your deadlines in the
 * free time around lessons and appointments. Pure logic; the Studie app stores and shows it.
 */

export interface FocusSettings {
  focusMinutes: number
  breakMinutes: number
  longBreakMinutes: number
  /** Focus rounds before a long break. */
  rounds: number
}

export const DEFAULT_FOCUS: FocusSettings = { focusMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, rounds: 4 }

export type FocusPhase = 'focus' | 'break' | 'long_break'

export interface FocusTimer {
  phase: FocusPhase
  /** Completed focus rounds in this series. */
  round: number
  /** When the running phase ends; null while paused or not started. */
  endsAt: number | null
  /** Time left while paused, ms. */
  remaining: number
  /** What you work on, e.g. a deadline title. */
  task: string
}

const clampMinutes = (value: unknown, fallback: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(1, Math.round(value))) : fallback

export function parseFocusSettings(value: unknown): FocusSettings {
  const v = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  return {
    focusMinutes: clampMinutes(v.focusMinutes, DEFAULT_FOCUS.focusMinutes, 180),
    breakMinutes: clampMinutes(v.breakMinutes, DEFAULT_FOCUS.breakMinutes, 60),
    longBreakMinutes: clampMinutes(v.longBreakMinutes, DEFAULT_FOCUS.longBreakMinutes, 90),
    rounds: clampMinutes(v.rounds, DEFAULT_FOCUS.rounds, 12),
  }
}

export const phaseMs = (phase: FocusPhase, s: FocusSettings) =>
  (phase === 'focus' ? s.focusMinutes : phase === 'break' ? s.breakMinutes : s.longBreakMinutes) * 60_000

export const newTimer = (s: FocusSettings, task = ''): FocusTimer => ({ phase: 'focus', round: 0, endsAt: null, remaining: phaseMs('focus', s), task })

export const PHASE_LABELS: Record<FocusPhase, string> = { focus: 'Focus', break: 'Pauze', long_break: 'Lange pauze' }

export function startTimer(t: FocusTimer, now: number): FocusTimer {
  return t.endsAt !== null ? t : { ...t, endsAt: now + t.remaining }
}

export function pauseTimer(t: FocusTimer, now: number): FocusTimer {
  return t.endsAt === null ? t : { ...t, endsAt: null, remaining: Math.max(0, t.endsAt - now) }
}

export function timeLeft(t: FocusTimer, now: number): number {
  return t.endsAt === null ? t.remaining : Math.max(0, t.endsAt - now)
}

/** The phase after the current one, already running when [autoStart]. */
export function nextPhase(t: FocusTimer, s: FocusSettings, now: number, autoStart = true): FocusTimer {
  const round = t.phase === 'focus' ? t.round + 1 : t.round
  const phase: FocusPhase = t.phase !== 'focus' ? 'focus' : round % s.rounds === 0 ? 'long_break' : 'break'
  const remaining = phaseMs(phase, s)
  return { ...t, phase, round, remaining, endsAt: autoStart ? now + remaining : null }
}

/** What the notification says when a phase is over. */
export function phaseEndNotice(t: FocusTimer, s: FocusSettings): { title: string; text: string } {
  if (t.phase === 'focus') {
    const long = (t.round + 1) % s.rounds === 0
    return { title: long ? 'Tijd voor een lange pauze' : 'Tijd voor een pauze', text: `${t.task ? `${t.task}: ` : ''}focusronde ${t.round + 1} klaar.` }
  }
  return { title: 'Pauze voorbij', text: t.task ? `Verder met ${t.task}.` : 'Tijd voor de volgende focusronde.' }
}

/* Planning */

export interface StudyWindow {
  /** 1 = Monday … 7 = Sunday. */
  days: number[]
  start: string
  end: string
}

/** When you want to study: weekday evenings and weekend days. */
export const DEFAULT_WINDOWS: StudyWindow[] = [
  { days: [1, 2, 3, 4, 5], start: '17:00', end: '21:00' },
  { days: [6, 7], start: '10:00', end: '17:00' },
]

export interface PlanTask {
  id: string
  title: string
  dueAt: number
  /** How long it still needs, minutes. */
  minutes: number
}

export interface Busy {
  start: number
  end: number
}

export interface StudyBlock {
  taskId: string
  title: string
  start: number
  end: number
}

export interface PlanResult {
  blocks: StudyBlock[]
  /** Tasks that do not fit before their deadline, with the minutes left over. */
  short: Array<{ taskId: string; title: string; minutes: number }>
}

const DAY_MS = 24 * 60 * 60_000

function at(day: Date, time: string): number {
  const [h, m] = time.split(':').map(Number)
  const d = new Date(day)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

/** Free time in the study windows from [from] to [to], minus what is busy. */
export function freeSlots(windows: StudyWindow[], busy: Busy[], from: number, to: number): Busy[] {
  const slots: Busy[] = []
  const day = new Date(from)
  day.setHours(0, 0, 0, 0)
  const sorted = [...busy].sort((a, b) => a.start - b.start)
  for (let d = new Date(day); d.getTime() < to; d.setDate(d.getDate() + 1)) {
    const weekday = ((d.getDay() + 6) % 7) + 1
    for (const w of windows) {
      if (!w.days.includes(weekday)) continue
      let start = Math.max(at(d, w.start), from)
      const end = Math.min(at(d, w.end), to)
      for (const b of sorted) {
        if (b.end <= start || b.start >= end) continue
        if (b.start > start) slots.push({ start, end: b.start })
        start = Math.max(start, b.end)
      }
      if (end > start) slots.push({ start, end })
    }
  }
  return slots.sort((a, b) => a.start - b.start)
}

/**
 * Plans study blocks: the task with the nearest deadline gets the first free time, in blocks of
 * at most [blockMinutes] with a short gap between them, and always before its deadline. Blocks
 * shorter than 20 minutes are not planned.
 */
export function planStudy(
  tasks: PlanTask[],
  busy: Busy[],
  now: number,
  { windows = DEFAULT_WINDOWS, blockMinutes = 60, gapMinutes = 15, horizonDays = 21 }: { windows?: StudyWindow[]; blockMinutes?: number; gapMinutes?: number; horizonDays?: number } = {},
): PlanResult {
  const MIN_BLOCK = 20 * 60_000
  const open = tasks.filter((t) => t.dueAt > now && t.minutes > 0).sort((a, b) => a.dueAt - b.dueAt)
  const last = Math.min(now + horizonDays * DAY_MS, Math.max(now, ...open.map((t) => t.dueAt)))
  const slots = freeSlots(windows, busy, now, last)
  const blocks: StudyBlock[] = []
  const short: PlanResult['short'] = []
  for (const task of open) {
    let left = task.minutes * 60_000
    for (const slot of slots) {
      while (left > 0) {
        const end = Math.min(slot.end, task.dueAt, slot.start + Math.min(left, blockMinutes * 60_000))
        if (end - slot.start < Math.min(MIN_BLOCK, left)) break
        blocks.push({ taskId: task.id, title: task.title, start: slot.start, end })
        left -= end - slot.start
        slot.start = end + gapMinutes * 60_000
        if (slot.start >= slot.end) break
      }
      if (left <= 0) break
    }
    if (left > 0) short.push({ taskId: task.id, title: task.title, minutes: Math.ceil(left / 60_000) })
  }
  return { blocks: blocks.sort((a, b) => a.start - b.start), short }
}

/** Marks appointments the Studieplanner made, so planning again replaces them. */
export const STUDY_BLOCK_NOTE = 'Gepland door de Studieplanner.'
export const studyBlockTitle = (task: string) => `Studeren: ${task}`.slice(0, 160)
