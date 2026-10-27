/**
 * Cijfers: your marks per course, as at AP Hogeschool: every course has parts (exam, labo, project)
 * that weigh a share, marks are out of 20 and 10/20 passes. NEXUS shows the course mark so far and
 * what you still need on the rest to reach your target.
 */

export interface GradePart {
  id: string
  name: string
  /** Share of the course mark, in percent. */
  weight: number
  /** null while the mark is not in yet. */
  score: number | null
  /** What the mark is out of, usually 20. */
  max: number
}

export interface Course {
  id: string
  name: string
  /** Studiepunten. */
  credits: number
  /** The course mark you aim for, out of 20. */
  target: number
  parts: GradePart[]
  updatedAt: number
  deletedAt: number | null
}

export interface GradesState {
  courses: Course[]
  /** Bumped on every change; the account keeps only newer copies. */
  revision: number
}

export const PASS_MARK = 10
export const DEFAULT_TARGET = 10

export const emptyGrades = (): GradesState => ({ courses: [], revision: 0 })

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const round1 = (n: number) => Math.round(n * 10) / 10

function parsePart(raw: unknown): GradePart | null {
  if (typeof raw !== 'object' || raw === null) return null
  const p = raw as Partial<GradePart>
  if (typeof p.id !== 'string' || typeof p.name !== 'string' || !isNumber(p.weight) || p.weight <= 0) return null
  const max = isNumber(p.max) && p.max > 0 ? p.max : 20
  const score = isNumber(p.score) && p.score >= 0 && p.score <= max ? p.score : null
  return { id: p.id, name: p.name.slice(0, 80), weight: Math.min(p.weight, 100), score, max }
}

export function parseCourse(raw: unknown): Course | null {
  if (typeof raw !== 'object' || raw === null) return null
  const c = raw as Partial<Course>
  if (typeof c.id !== 'string' || typeof c.name !== 'string' || !isNumber(c.updatedAt)) return null
  return {
    id: c.id,
    name: c.name.slice(0, 80),
    credits: isNumber(c.credits) && c.credits >= 0 ? Math.min(c.credits, 60) : 0,
    target: isNumber(c.target) && c.target >= 0 && c.target <= 20 ? c.target : DEFAULT_TARGET,
    parts: Array.isArray(c.parts) ? c.parts.map(parsePart).filter((p): p is GradePart => p !== null).slice(0, 20) : [],
    updatedAt: c.updatedAt,
    deletedAt: isNumber(c.deletedAt) ? c.deletedAt : null,
  }
}

/** Repairs a stored copy; anything unreadable is dropped. */
export function parseGradesState(raw: unknown): GradesState {
  if (typeof raw !== 'object' || raw === null) return emptyGrades()
  const r = raw as Partial<GradesState>
  return {
    courses: Array.isArray(r.courses) ? r.courses.map(parseCourse).filter((c): c is Course => c !== null).slice(0, 100) : [],
    revision: isNumber(r.revision) ? r.revision : 0,
  }
}

/** Two copies course by course: the newer change of each course wins, deletions included. */
export function mergeGrades(a: GradesState, b: GradesState): GradesState {
  const byId = new Map(a.courses.map((c) => [c.id, c]))
  for (const c of b.courses) {
    const mine = byId.get(c.id)
    if (!mine || c.updatedAt > mine.updatedAt) byId.set(c.id, c)
  }
  return { courses: [...byId.values()], revision: Math.max(a.revision, b.revision) }
}

export const activeCourses = (s: GradesState) => s.courses.filter((c) => c.deletedAt === null)

export type CourseStatus = 'empty' | 'open' | 'safe' | 'impossible' | 'passed' | 'failed'

export interface CourseResult {
  /** The mark so far over the parts that are in, out of 20; null when none are. */
  score: number | null
  /** Percent of the course whose mark is in. */
  graded: number
  /** All weights together; normally 100. */
  totalWeight: number
  /** Average you still need on the remaining parts (out of 20) for the target. */
  needed: number | null
  status: CourseStatus
}

/** The mark of a course so far, and what the rest needs to reach its target. */
export function courseResult(course: Course): CourseResult {
  const totalWeight = course.parts.reduce((n, p) => n + p.weight, 0)
  if (totalWeight === 0) return { score: null, graded: 0, totalWeight: 0, needed: null, status: 'empty' }
  const done = course.parts.filter((p) => p.score !== null)
  const doneWeight = done.reduce((n, p) => n + p.weight, 0)
  const points = done.reduce((n, p) => n + (p.weight * (p.score as number) * 20) / p.max, 0)
  const score = doneWeight > 0 ? round1(points / doneWeight) : null
  const graded = round1((doneWeight / totalWeight) * 100)
  const restWeight = totalWeight - doneWeight
  if (restWeight === 0) return { score, graded, totalWeight, needed: null, status: (score ?? 0) >= PASS_MARK ? 'passed' : 'failed' }
  const needed = (course.target * totalWeight - points) / restWeight
  const status = needed <= 0 ? 'safe' : needed > 20 ? 'impossible' : 'open'
  return { score, graded, totalWeight, needed: needed <= 0 ? 0 : round1(needed), status }
}

export interface GradesOverview {
  /** Average of the courses with a mark, weighted by their studiepunten (or equally without any). */
  average: number | null
  /** Studiepunten of the courses that are finished with at least 10/20. */
  earned: number
  credits: number
}

export function gradesOverview(state: GradesState): GradesOverview {
  let sum = 0
  let weight = 0
  let earned = 0
  let credits = 0
  for (const c of activeCourses(state)) {
    const r = courseResult(c)
    credits += c.credits
    if (r.status === 'passed') earned += c.credits
    if (r.score === null) continue
    const w = c.credits > 0 ? c.credits : 1
    sum += r.score * w
    weight += w
  }
  return { average: weight > 0 ? round1(sum / weight) : null, earned, credits }
}

/** "13,5/20" in Belgian notation. */
export const formatMark = (n: number) => `${n.toLocaleString('nl-BE', { maximumFractionDigits: 1 })}/20`
