/**
 * Examenplanner: your exams with how much study time each still needs. The Studieplanner spreads
 * that time over the days before each exam, and a linked deck of Leerkaarten shows what to repeat.
 */
import type { PlanTask } from './study'

export interface Exam {
  id: string
  course: string
  /** Start of the exam, ms. */
  at: number
  /** How long it lasts. */
  minutes: number
  location: string
  /** Study time it needs in total, in hours. */
  studyHours: number
  /** A deck of Leerkaarten for it, or null. */
  deckId: string | null
  /** The appointment in the Agenda that carries its reminders, or null. */
  appointmentId: string | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface ExamsState {
  exams: Exam[]
  revision: number
}

export const emptyExams = (): ExamsState => ({ exams: [], revision: 0 })
export const MAX_EXAMS = 100
export const MAX_STUDY_HOURS = 200
const DAY_MS = 24 * 60 * 60_000

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function parseExam(raw: unknown): Exam | null {
  if (typeof raw !== 'object' || raw === null) return null
  const e = raw as Partial<Exam>
  if (typeof e.id !== 'string' || !isNumber(e.updatedAt) || !isNumber(e.at)) return null
  const deletedAt = isNumber(e.deletedAt) ? e.deletedAt : null
  if (deletedAt === null && (typeof e.course !== 'string' || !e.course.trim())) return null
  return {
    id: e.id,
    course: typeof e.course === 'string' ? e.course.slice(0, 80) : '',
    at: e.at,
    minutes: isNumber(e.minutes) && e.minutes >= 0 && e.minutes <= 12 * 60 ? Math.round(e.minutes) : 120,
    location: typeof e.location === 'string' ? e.location.slice(0, 120) : '',
    studyHours: isNumber(e.studyHours) && e.studyHours >= 0 ? Math.min(MAX_STUDY_HOURS, e.studyHours) : 0,
    deckId: typeof e.deckId === 'string' ? e.deckId : null,
    appointmentId: typeof e.appointmentId === 'string' ? e.appointmentId : null,
    createdAt: isNumber(e.createdAt) ? e.createdAt : e.updatedAt,
    updatedAt: e.updatedAt,
    deletedAt,
  }
}

export function parseExamsState(raw: unknown): ExamsState {
  if (typeof raw !== 'object' || raw === null) return emptyExams()
  const r = raw as Partial<ExamsState>
  return {
    exams: Array.isArray(r.exams) ? r.exams.map(parseExam).filter((e): e is Exam => e !== null).slice(-MAX_EXAMS * 2) : [],
    revision: isNumber(r.revision) ? r.revision : 0,
  }
}

/** Two copies exam by exam: the newer change wins, deletions included. */
export function mergeExams(a: ExamsState, b: ExamsState): ExamsState {
  const byId = new Map(a.exams.map((e) => [e.id, e]))
  for (const e of b.exams) {
    const mine = byId.get(e.id)
    if (!mine || e.updatedAt > mine.updatedAt) byId.set(e.id, e)
  }
  return { exams: [...byId.values()], revision: Math.max(a.revision, b.revision) }
}

/** Exams that have not ended yet, soonest first. */
export function upcomingExams(s: ExamsState, now: number): Exam[] {
  return s.exams.filter((e) => e.deletedAt === null && e.at + e.minutes * 60_000 > now).sort((a, b) => a.at - b.at)
}

/** Whole days from today to the day of the exam: 0 is today, 1 tomorrow. */
export function daysUntil(at: number, now: number): number {
  const day = (t: number) => {
    const d = new Date(t)
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  }
  return Math.round((day(at) - day(now)) / DAY_MS)
}

export function countdownLabel(at: number, now: number): string {
  const n = daysUntil(at, now)
  return n <= 0 ? 'vandaag' : n === 1 ? 'morgen' : `over ${n} dagen`
}

/** Midnight before the exam day: studying for it ends the evening before. */
export function studyDeadline(exam: Pick<Exam, 'at'>): number {
  const d = new Date(exam.at)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** How many minutes of focus time went to [course], from the focus log (the task text names the course). */
export function studiedMinutes(course: string, log: Array<{ minutes: number; task: string }>): number {
  const name = course.trim().toLowerCase()
  if (!name) return 0
  return log.filter((e) => e.task.toLowerCase().includes(name)).reduce((n, e) => n + e.minutes, 0)
}

/**
 * The exams as tasks for the Studieplanner: what is still needed (study hours minus focus time
 * already spent on the course), due the evening before the exam.
 */
export function examTasks(s: ExamsState, now: number, log: Array<{ minutes: number; task: string }> = []): PlanTask[] {
  return upcomingExams(s, now)
    .map((e) => ({ id: `exam:${e.id}`, title: e.course, dueAt: studyDeadline(e), minutes: Math.max(0, Math.round(e.studyHours * 60) - studiedMinutes(e.course, log)) }))
    .filter((t) => t.dueAt > now && t.minutes > 0)
}

export const examTitle = (course: string) => `Examen ${course}`.slice(0, 160)
export const EXAM_NOTE = 'Examen uit de Examenplanner.'
