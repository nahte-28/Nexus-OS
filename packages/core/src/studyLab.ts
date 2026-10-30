/**
 * Study Lab: from deadlines to learning on purpose. Courses (vakken) with their topics, your own
 * practice questions per topic, practice rounds that ask what you got wrong or never tried first,
 * study sessions, and progress per topic from your answers and how sure you feel. A course can point
 * to a deck of Leerkaarten and to an exam. One document per account (user_settings key 'studylab').
 * Pure logic, without AI.
 */

export interface StudyTopic {
  id: string
  name: string
  /** How sure you feel: 0 = nog niet bekeken ... 3 = ken ik. */
  confidence: 0 | 1 | 2 | 3
}

export interface StudySubject {
  id: string
  name: string
  topics: StudyTopic[]
  /** A deck of Leerkaarten for this course, or null. */
  deckId: string | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export type QuestionKind = 'open' | 'choice'

export interface PracticeQuestion {
  id: string
  subjectId: string
  topicId: string | null
  kind: QuestionKind
  prompt: string
  /** The answer of an open question, or why the right choice is right. */
  answer: string
  /** For a choice question: 2 to 6 options and the index of the right one. */
  choices: string[]
  correct: number
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface PracticeAttempt {
  id: string
  questionId: string
  at: number
  correct: boolean
}

export interface StudyLabSession {
  id: string
  subjectId: string
  at: number
  minutes: number
  note: string
}

export interface StudyLabState {
  subjects: StudySubject[]
  questions: PracticeQuestion[]
  attempts: PracticeAttempt[]
  sessions: StudyLabSession[]
  revision: number
}

export const CONFIDENCE_LABELS = ['Nog niet bekeken', 'Wankel', 'Gaat wel', 'Ken ik'] as const
export const MAX_SUBJECTS = 40
export const MAX_TOPICS = 60
export const MAX_QUESTIONS = 2000
const MAX_ATTEMPTS = 3000
const MAX_SESSIONS = 600
const MAX_TEXT = 2000

export const emptyStudyLab = (): StudyLabState => ({ subjects: [], questions: [], attempts: [], sessions: [], revision: 0 })

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const list = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null && typeof i.id === 'string') : [])
const level = (v: unknown): StudyTopic['confidence'] => (v === 1 || v === 2 || v === 3 ? v : 0)

export function parseStudyLab(raw: unknown): StudyLabState {
  if (typeof raw !== 'object' || raw === null) return emptyStudyLab()
  const v = raw as Record<string, unknown>
  const subjects = list(v.subjects).map((s): StudySubject => {
    const createdAt = num(s.createdAt) ?? 0
    return {
      id: s.id as string,
      name: str(s.name, 80),
      topics: list(s.topics).slice(0, MAX_TOPICS).map((t) => ({ id: t.id as string, name: str(t.name, 80), confidence: level(t.confidence) })),
      deckId: typeof s.deckId === 'string' ? s.deckId : null,
      createdAt,
      updatedAt: num(s.updatedAt) ?? createdAt,
      deletedAt: num(s.deletedAt),
    }
  })
  const questions = list(v.questions).flatMap((q): PracticeQuestion[] => {
    if (typeof q.subjectId !== 'string') return []
    const choices = Array.isArray(q.choices) ? q.choices.filter((c): c is string => typeof c === 'string').map((c) => c.slice(0, 300)).slice(0, 6) : []
    const kind: QuestionKind = q.kind === 'choice' && choices.length >= 2 ? 'choice' : 'open'
    const correct = num(q.correct) ?? 0
    const createdAt = num(q.createdAt) ?? 0
    return [
      {
        id: q.id as string,
        subjectId: q.subjectId,
        topicId: typeof q.topicId === 'string' ? q.topicId : null,
        kind,
        prompt: str(q.prompt, MAX_TEXT),
        answer: str(q.answer, MAX_TEXT),
        choices: kind === 'choice' ? choices : [],
        correct: kind === 'choice' && Number.isInteger(correct) && correct >= 0 && correct < choices.length ? correct : 0,
        createdAt,
        updatedAt: num(q.updatedAt) ?? createdAt,
        deletedAt: num(q.deletedAt),
      },
    ]
  })
  const attempts = list(v.attempts).flatMap((a): PracticeAttempt[] => {
    const at = num(a.at)
    return at === null || typeof a.questionId !== 'string' ? [] : [{ id: a.id as string, questionId: a.questionId, at, correct: a.correct === true }]
  })
  const sessions = list(v.sessions).flatMap((s): StudyLabSession[] => {
    const at = num(s.at)
    const minutes = num(s.minutes)
    return at === null || minutes === null || typeof s.subjectId !== 'string' ? [] : [{ id: s.id as string, subjectId: s.subjectId, at, minutes: Math.max(1, Math.min(Math.round(minutes), 24 * 60)), note: str(s.note, 300) }]
  })
  return {
    subjects,
    questions,
    attempts: attempts.sort((a, b) => b.at - a.at).slice(0, MAX_ATTEMPTS),
    sessions: sessions.sort((a, b) => b.at - a.at).slice(0, MAX_SESSIONS),
    revision: num(v.revision) ?? 0,
  }
}

function mergeById<T extends { id: string; updatedAt: number }>(a: T[], b: T[]): T[] {
  const byId = new Map(a.map((x) => [x.id, x]))
  for (const x of b) {
    const mine = byId.get(x.id)
    if (!mine || x.updatedAt > mine.updatedAt) byId.set(x.id, x)
  }
  return [...byId.values()]
}

const union = <T extends { id: string; at: number }>(a: T[], b: T[], max: number) => [...new Map([...a, ...b].map((x) => [x.id, x])).values()].sort((x, y) => y.at - x.at).slice(0, max)

export function mergeStudyLab(a: StudyLabState, b: StudyLabState): StudyLabState {
  return {
    subjects: mergeById(a.subjects, b.subjects),
    questions: mergeById(a.questions, b.questions),
    attempts: union(a.attempts, b.attempts, MAX_ATTEMPTS),
    sessions: union(a.sessions, b.sessions, MAX_SESSIONS),
    revision: Math.max(a.revision, b.revision),
  }
}

// Courses and topics --------------------------------------------------------------------------------

export const liveSubjects = (s: StudyLabState) => s.subjects.filter((x) => x.deletedAt === null).sort((a, b) => a.name.localeCompare(b.name, 'nl'))
export const subjectQuestions = (s: StudyLabState, subjectId: string, topicId?: string | null) =>
  s.questions.filter((q) => q.subjectId === subjectId && q.deletedAt === null && (topicId === undefined || q.topicId === topicId))

export function saveSubject(s: StudyLabState, subject: Pick<StudySubject, 'id' | 'name'> & Partial<Pick<StudySubject, 'deckId' | 'topics'>>, now: number): StudyLabState | { error: string } {
  const name = subject.name.trim().slice(0, 80)
  if (!name) return { error: 'Geef het vak een naam.' }
  const old = s.subjects.find((x) => x.id === subject.id)
  if (!old && liveSubjects(s).length >= MAX_SUBJECTS) return { error: `Hoogstens ${MAX_SUBJECTS} vakken.` }
  if (liveSubjects(s).some((x) => x.id !== subject.id && x.name.toLowerCase() === name.toLowerCase())) return { error: 'Dat vak bestaat al.' }
  const entry: StudySubject = {
    id: subject.id,
    name,
    topics: (subject.topics ?? old?.topics ?? []).slice(0, MAX_TOPICS),
    deckId: subject.deckId !== undefined ? subject.deckId : (old?.deckId ?? null),
    createdAt: old?.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
  }
  return { ...s, subjects: old ? s.subjects.map((x) => (x.id === subject.id ? entry : x)) : [...s.subjects, entry] }
}

/** Removes a course with its questions; sessions and answers stay for the history. */
export function removeSubject(s: StudyLabState, id: string, now: number): StudyLabState {
  return {
    ...s,
    subjects: s.subjects.map((x) => (x.id === id ? { ...x, deletedAt: now, updatedAt: now } : x)),
    questions: s.questions.map((q) => (q.subjectId === id && q.deletedAt === null ? { ...q, deletedAt: now, updatedAt: now } : q)),
  }
}

function changeTopics(s: StudyLabState, subjectId: string, change: (topics: StudyTopic[]) => StudyTopic[], now: number): StudyLabState {
  return { ...s, subjects: s.subjects.map((x) => (x.id === subjectId ? { ...x, topics: change(x.topics).slice(0, MAX_TOPICS), updatedAt: now } : x)) }
}

export function addTopic(s: StudyLabState, subjectId: string, name: string, id: string, now: number): StudyLabState | { error: string } {
  const clean = name.trim().slice(0, 80)
  if (!clean) return { error: 'Geef het onderwerp een naam.' }
  const subject = s.subjects.find((x) => x.id === subjectId)
  if (!subject) return { error: 'Dat vak bestaat niet meer.' }
  if (subject.topics.length >= MAX_TOPICS) return { error: `Hoogstens ${MAX_TOPICS} onderwerpen per vak.` }
  return changeTopics(s, subjectId, (t) => [...t, { id, name: clean, confidence: 0 }], now)
}

export function setConfidence(s: StudyLabState, subjectId: string, topicId: string, confidence: StudyTopic['confidence'], now: number): StudyLabState {
  return changeTopics(s, subjectId, (t) => t.map((x) => (x.id === topicId ? { ...x, confidence } : x)), now)
}

/** Removes a topic; its questions stay in the course without a topic. */
export function removeTopic(s: StudyLabState, subjectId: string, topicId: string, now: number): StudyLabState {
  const next = changeTopics(s, subjectId, (t) => t.filter((x) => x.id !== topicId), now)
  return { ...next, questions: next.questions.map((q) => (q.subjectId === subjectId && q.topicId === topicId ? { ...q, topicId: null, updatedAt: now } : q)) }
}

// Questions and practice ----------------------------------------------------------------------------

export type QuestionDraft = Pick<PracticeQuestion, 'id' | 'subjectId' | 'topicId' | 'kind' | 'prompt' | 'answer' | 'choices' | 'correct'>

export function saveQuestion(s: StudyLabState, draft: QuestionDraft, now: number): StudyLabState | { error: string } {
  const prompt = draft.prompt.trim().slice(0, MAX_TEXT)
  if (!prompt) return { error: 'Typ een vraag.' }
  const choices = draft.kind === 'choice' ? draft.choices.map((c) => c.trim()).filter(Boolean).slice(0, 6) : []
  if (draft.kind === 'choice' && choices.length < 2) return { error: 'Een meerkeuzevraag heeft minstens twee antwoorden.' }
  if (draft.kind === 'choice' && (draft.correct < 0 || draft.correct >= choices.length)) return { error: 'Duid het juiste antwoord aan.' }
  if (draft.kind === 'open' && !draft.answer.trim()) return { error: 'Typ het antwoord, zodat je jezelf kan nakijken.' }
  const old = s.questions.find((q) => q.id === draft.id)
  if (!old && s.questions.filter((q) => q.deletedAt === null).length >= MAX_QUESTIONS) return { error: `Hoogstens ${MAX_QUESTIONS} vragen.` }
  const entry: PracticeQuestion = { ...draft, prompt, answer: draft.answer.trim().slice(0, MAX_TEXT), choices, correct: draft.kind === 'choice' ? draft.correct : 0, createdAt: old?.createdAt ?? now, updatedAt: now, deletedAt: null }
  return { ...s, questions: old ? s.questions.map((q) => (q.id === draft.id ? entry : q)) : [...s.questions, entry] }
}

export function removeQuestion(s: StudyLabState, id: string, now: number): StudyLabState {
  return { ...s, questions: s.questions.map((q) => (q.id === id ? { ...q, deletedAt: now, updatedAt: now } : q)) }
}

export function answerQuestion(s: StudyLabState, questionId: string, correct: boolean, id: string, now: number): StudyLabState {
  return { ...s, attempts: [{ id, questionId, at: now, correct }, ...s.attempts].slice(0, MAX_ATTEMPTS) }
}

/** The newest answer per question. */
function lastAnswers(s: StudyLabState): Map<string, PracticeAttempt> {
  const out = new Map<string, PracticeAttempt>()
  for (const a of s.attempts) {
    const seen = out.get(a.questionId)
    if (!seen || a.at > seen.at) out.set(a.questionId, a)
  }
  return out
}

/**
 * A practice round: questions last answered wrong first, then never tried, then the ones answered
 * right longest ago. Same state, same order; [limit] cuts the round.
 */
export function practiceRound(s: StudyLabState, subjectId: string, topicId: string | null = null, limit = 10): PracticeQuestion[] {
  const last = lastAnswers(s)
  const rank = (q: PracticeQuestion) => {
    const a = last.get(q.id)
    return a === undefined ? [1, q.createdAt] : a.correct ? [2, a.at] : [0, a.at]
  }
  return subjectQuestions(s, subjectId, topicId ?? undefined)
    .sort((a, b) => {
      const [ra, ta] = rank(a)
      const [rb, tb] = rank(b)
      return ra - rb || ta - tb || a.id.localeCompare(b.id)
    })
    .slice(0, limit)
}

export interface TopicProgress {
  questions: number
  /** Questions answered at least once. */
  tried: number
  /** Questions whose newest answer was right. */
  right: number
  confidence: StudyTopic['confidence']
  /** 0-100: half from your newest answers, half from how sure you feel; only the feeling without questions. */
  percent: number
}

export function topicProgress(s: StudyLabState, subjectId: string, topic: StudyTopic | null): TopicProgress {
  const last = lastAnswers(s)
  const qs = subjectQuestions(s, subjectId, topic ? topic.id : null)
  const tried = qs.filter((q) => last.has(q.id)).length
  const right = qs.filter((q) => last.get(q.id)?.correct).length
  const confidence = topic?.confidence ?? 0
  const feel = (confidence / 3) * 100
  const percent = qs.length === 0 ? Math.round(feel) : Math.round(((right / qs.length) * 100 + feel) / 2)
  return { questions: qs.length, tried, right, confidence, percent }
}

/** The course as a whole: the average of its topics, or of its questions when it has no topics. */
export function subjectProgress(s: StudyLabState, subject: StudySubject): number {
  if (subject.topics.length === 0) return topicProgress(s, subject.id, null).percent
  const parts = subject.topics.map((t) => topicProgress(s, subject.id, t).percent)
  return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length)
}

/** The topics to look at next: lowest progress first. */
export function weakTopics(s: StudyLabState, limit = 5): Array<{ subject: StudySubject; topic: StudyTopic; percent: number }> {
  return liveSubjects(s)
    .flatMap((subject) => subject.topics.map((topic) => ({ subject, topic, percent: topicProgress(s, subject.id, topic).percent })))
    .sort((a, b) => a.percent - b.percent || a.subject.name.localeCompare(b.subject.name, 'nl'))
    .slice(0, limit)
}

// Sessions ------------------------------------------------------------------------------------------

export function logSession(s: StudyLabState, session: StudyLabSession): StudyLabState | { error: string } {
  if (!Number.isFinite(session.minutes) || session.minutes < 1 || session.minutes > 24 * 60) return { error: 'Geef een duur tussen 1 minuut en 24 uur.' }
  return { ...s, sessions: [{ ...session, minutes: Math.round(session.minutes), note: session.note.slice(0, 300) }, ...s.sessions].slice(0, MAX_SESSIONS) }
}

/** Minutes studied per course in [from, to). */
export function minutesPerSubject(s: StudyLabState, from: number, to: number): Map<string, number> {
  const out = new Map<string, number>()
  for (const x of s.sessions) if (x.at >= from && x.at < to) out.set(x.subjectId, (out.get(x.subjectId) ?? 0) + x.minutes)
  return out
}
