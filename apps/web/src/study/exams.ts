import { EXAM_NOTE, examTitle, mergeExams, parseExamsState, type Exam, type ExamsState } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { lifeStore } from '../life/store'
import { createProblem, DocStore, startDocSync } from '../state/docStore'

export const EXAMS_MIGRATION = 'supabase/migrations/20261028120000_exams_journal.sql'

export const examsStore = new DocStore<ExamsState>('nexus.exams', parseExamsState)
export const examsSyncProblem = createProblem()

export function startExamsSync(client: SupabaseClient | null): () => void {
  return startDocSync(client, examsStore, { key: 'exams', parse: parseExamsState, merge: mergeExams, migration: EXAMS_MIGRATION, problem: examsSyncProblem, label: 'Examens' })
}

export type ExamDraft = Pick<Exam, 'course' | 'at' | 'minutes' | 'location' | 'studyHours' | 'deckId'>

/** Puts the exam in the Agenda as an appointment, with reminders the day before and an hour before. */
async function syncAppointment(exam: Exam): Promise<string | null> {
  const fields = { title: examTitle(exam.course), startAt: exam.at, endAt: exam.at + Math.max(15, exam.minutes) * 60_000, location: exam.location, notes: EXAM_NOTE, remind: [24 * 60, 60], target: 'phone' as const }
  const existing = exam.appointmentId ? lifeStore.getSnapshot().find((i) => i.id === exam.appointmentId && i.deletedAt === null) : undefined
  if (existing) {
    await lifeStore.updateAppointment(existing.id, fields)
    return existing.id
  }
  return lifeStore.addAppointment(fields)
}

export async function addExam(draft: ExamDraft, now = Date.now()): Promise<string> {
  const id = crypto.randomUUID()
  const exam: Exam = { ...draft, course: draft.course.trim().slice(0, 80), location: draft.location.trim().slice(0, 120), id, appointmentId: null, createdAt: now, updatedAt: now, deletedAt: null }
  examsStore.update((s) => ({ ...s, exams: [...s.exams, exam] }))
  const appointmentId = await syncAppointment(exam).catch(() => null)
  if (appointmentId) examsStore.update((s) => ({ ...s, exams: s.exams.map((e) => (e.id === id ? { ...e, appointmentId } : e)) }))
  return id
}

export async function updateExam(id: string, draft: ExamDraft, now = Date.now()) {
  examsStore.update((s) => ({ ...s, exams: s.exams.map((e) => (e.id === id ? { ...e, ...draft, course: draft.course.trim().slice(0, 80) || e.course, location: draft.location.trim().slice(0, 120), updatedAt: now } : e)) }))
  const exam = examsStore.getSnapshot().exams.find((e) => e.id === id)
  if (!exam) return
  const appointmentId = await syncAppointment(exam).catch(() => null)
  if (appointmentId && appointmentId !== exam.appointmentId) examsStore.update((s) => ({ ...s, exams: s.exams.map((e) => (e.id === id ? { ...e, appointmentId } : e)) }))
}

/** Removes the exam and its appointment in the Agenda. */
export async function removeExam(id: string, now = Date.now()) {
  const exam = examsStore.getSnapshot().exams.find((e) => e.id === id)
  examsStore.update((s) => ({ ...s, exams: s.exams.map((e) => (e.id === id ? { ...e, course: '', location: '', deletedAt: now, updatedAt: now } : e)) }))
  if (exam?.appointmentId) await lifeStore.remove(exam.appointmentId).catch(() => {})
}
