/**
 * Examenblok: a full block schedule from the start of your blok up to your last exam. Every free
 * day is cut into study blocks with breaks (and a lunch), the day before each exam is kept for
 * herhaling of that course, and the other blocks go to the exam that comes first and still needs
 * time. That order (earliest exam first) fits every exam in if any order can.
 */
import type { Exam } from './exams'
import type { Busy } from './study'

export interface BlockSettings {
  /** First day of the blok, YYYY-MM-DD, or null for tomorrow. */
  start: string | null
  /** Study day from … to, HH:MM. */
  from: string
  to: string
  blockMinutes: number
  breakMinutes: number
  /** 12:30 to 13:30 stays free. */
  lunch: boolean
  /** Weekdays without studying, 1 = Monday … 7 = Sunday. */
  restDays: number[]
  /** The last free day before each exam is herhaling of that course. */
  review: boolean
  /** Lessons in your agenda count as busy; turn off when there are no lessons in the blok. */
  lessons: boolean
  updatedAt: number
}

export const DEFAULT_BLOCK: BlockSettings = { start: null, from: '09:00', to: '18:00', blockMinutes: 90, breakMinutes: 15, lunch: true, restDays: [], review: true, lessons: true, updatedAt: 0 }
export const BLOCK_LENGTHS = [45, 60, 90, 120]
export const BLOCK_BREAKS = [10, 15, 20, 30]

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 24 * 60 * 60_000
const MIN_BLOCK = 30 * 60_000
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))

export function parseBlockSettings(raw: unknown): BlockSettings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_BLOCK }
  const r = raw as Partial<BlockSettings>
  const from = typeof r.from === 'string' && TIME.test(r.from) ? r.from : DEFAULT_BLOCK.from
  const to = typeof r.to === 'string' && TIME.test(r.to) && minutesOf(r.to) > minutesOf(from) ? r.to : minutesOf(DEFAULT_BLOCK.to) > minutesOf(from) ? DEFAULT_BLOCK.to : '23:59'
  return {
    start: typeof r.start === 'string' && DATE.test(r.start) ? r.start : null,
    from,
    to,
    blockMinutes: isNumber(r.blockMinutes) && BLOCK_LENGTHS.includes(r.blockMinutes) ? r.blockMinutes : DEFAULT_BLOCK.blockMinutes,
    breakMinutes: isNumber(r.breakMinutes) && BLOCK_BREAKS.includes(r.breakMinutes) ? r.breakMinutes : DEFAULT_BLOCK.breakMinutes,
    lunch: typeof r.lunch === 'boolean' ? r.lunch : DEFAULT_BLOCK.lunch,
    restDays: Array.isArray(r.restDays) ? [...new Set(r.restDays.filter((d): d is number => Number.isInteger(d) && d >= 1 && d <= 7))].sort() : [],
    review: typeof r.review === 'boolean' ? r.review : DEFAULT_BLOCK.review,
    lessons: typeof r.lessons === 'boolean' ? r.lessons : DEFAULT_BLOCK.lessons,
    updatedAt: isNumber(r.updatedAt) ? r.updatedAt : 0,
  }
}

export type BlockKind = 'study' | 'review'

export interface BlockSlot {
  examId: string
  course: string
  kind: BlockKind
  start: number
  end: number
}

export interface BlockDay {
  /** Midnight of the day. */
  day: number
  kind: 'study' | 'rest' | 'exam'
  /** The exams on this day. */
  exams: Array<Pick<Exam, 'id' | 'course' | 'at'>>
  blocks: BlockSlot[]
  /** Study time on this day nobody needed, minutes. */
  spare: number
}

export interface BlockPlan {
  days: BlockDay[]
  /** Exams that still miss time, with the minutes short. */
  short: Array<{ examId: string; course: string; minutes: number }>
  /** Planned study minutes per exam. */
  perExam: Record<string, number>
}

function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Midnight of the next calendar day, safe across summer time. */
const nextDay = (day: number) => startOfDay(day + DAY_MS + 3 * 3_600_000)

function atTime(day: number, time: string): number {
  const d = new Date(day)
  d.setHours(Number(time.slice(0, 2)), Number(time.slice(3)), 0, 0)
  return d.getTime()
}

const weekday = (day: number) => ((new Date(day).getDay() + 6) % 7) + 1

export function dateKeyOf(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The first day of the blok: the chosen day, but never before tomorrow. */
export function blockStart(settings: BlockSettings, now: number): number {
  const tomorrow = nextDay(startOfDay(now))
  if (!settings.start) return tomorrow
  const [y, m, d] = settings.start.split('-').map(Number)
  return Math.max(tomorrow, new Date(y, m - 1, d).getTime())
}

/** The study blocks of one day: the window minus lunch and what is busy, cut into blocks with breaks. */
export function daySlots(day: number, settings: BlockSettings, busy: Busy[]): Busy[] {
  const taken = busy.filter((b) => b.end > day && b.start < nextDay(day))
  if (settings.lunch) taken.push({ start: atTime(day, '12:30'), end: atTime(day, '13:30') })
  taken.sort((a, b) => a.start - b.start)
  const end = atTime(day, settings.to)
  const block = settings.blockMinutes * 60_000
  const pause = settings.breakMinutes * 60_000
  const slots: Busy[] = []
  let t = atTime(day, settings.from)
  while (t + MIN_BLOCK <= end) {
    const clash = taken.find((b) => b.end > t && b.start < t + MIN_BLOCK)
    if (clash) {
      t = clash.end
      continue
    }
    const nextBusy = taken.find((b) => b.start >= t)
    const stop = Math.min(end, t + block, nextBusy ? nextBusy.start : Infinity)
    slots.push({ start: t, end: stop })
    t = stop + pause
  }
  return slots
}

/**
 * Plans the blok. [needs] is how many minutes each exam still needs (from the Examenplanner, minus
 * focus time already spent); [busy] is what is already in your agenda.
 */
export function planExamBlock(exams: Exam[], needs: Record<string, number>, busy: Busy[], settings: BlockSettings, now: number): BlockPlan {
  const coming = exams.filter((e) => e.deletedAt === null && e.at > now).sort((a, b) => a.at - b.at)
  const perExam: Record<string, number> = Object.fromEntries(coming.map((e) => [e.id, 0]))
  if (coming.length === 0) return { days: [], short: [], perExam }
  const first = blockStart(settings, now)
  const lastDay = startOfDay(coming[coming.length - 1].at)
  const days: BlockDay[] = []
  for (let day = first; day <= lastDay && days.length < 120; day = nextDay(day)) {
    const onDay = coming.filter((e) => startOfDay(e.at) === day).map((e) => ({ id: e.id, course: e.course, at: e.at }))
    const kind = onDay.length > 0 ? 'exam' : settings.restDays.includes(weekday(day)) ? 'rest' : 'study'
    days.push({ day, kind, exams: onDay, blocks: [], spare: 0 })
  }
  const slotsOf = new Map(days.filter((d) => d.kind === 'study').map((d) => [d.day, daySlots(d.day, settings, busy)]))
  const left: Record<string, number> = Object.fromEntries(coming.map((e) => [e.id, Math.max(0, Math.round(needs[e.id] ?? e.studyHours * 60))]))
  const reserved = new Map<number, Exam>()
  if (settings.review) {
    for (const exam of coming) {
      const before = days.filter((d) => d.day < startOfDay(exam.at) && d.kind === 'study' && (slotsOf.get(d.day)?.length ?? 0) > 0)
      // Only the very last free day before the exam: when another exam took it, there is no herhaling.
      const last = before[before.length - 1]
      if (last && !reserved.has(last.day) && !coming.some((e) => e.id !== exam.id && startOfDay(e.at) > last.day && startOfDay(e.at) < startOfDay(exam.at))) reserved.set(last.day, exam)
    }
  }
  for (const d of days) {
    if (d.kind !== 'study') continue
    for (const slot of slotsOf.get(d.day) ?? []) {
      const minutes = Math.round((slot.end - slot.start) / 60_000)
      const review = reserved.get(d.day)
      const exam = review ?? coming.find((e) => startOfDay(e.at) > d.day && left[e.id] > 0)
      if (!exam) {
        d.spare += minutes
        continue
      }
      d.blocks.push({ examId: exam.id, course: exam.course, kind: review ? 'review' : 'study', start: slot.start, end: slot.end })
      left[exam.id] = Math.max(0, left[exam.id] - minutes)
      perExam[exam.id] += minutes
    }
  }
  const short = coming.filter((e) => left[e.id] > 0).map((e) => ({ examId: e.id, course: e.course, minutes: left[e.id] }))
  return { days, short, perExam }
}

/** Marks appointments the Examenblok made, so planning again replaces them. */
export const EXAM_BLOCK_NOTE = 'Gepland door het Examenblok.'
export const blockSlotTitle = (slot: Pick<BlockSlot, 'course' | 'kind'>) => `${slot.kind === 'review' ? 'Herhaling' : 'Blok'}: ${slot.course}`.slice(0, 160)

/** A short line for the overview: how many study days, blocks and hours. */
export function blockSummary(plan: BlockPlan): string {
  const studyDays = plan.days.filter((d) => d.blocks.length > 0).length
  const minutes = Object.values(plan.perExam).reduce((n, m) => n + m, 0)
  if (studyDays === 0) return 'Nog niets te plannen.'
  const hours = Math.round((minutes / 60) * 10) / 10
  return `${studyDays} ${studyDays === 1 ? 'studiedag' : 'studiedagen'}, ${hours} uur studeren tot je laatste examen.`
}
