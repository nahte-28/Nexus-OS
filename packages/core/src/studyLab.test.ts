import { describe, expect, it } from 'vitest'
import {
  addTopic,
  answerQuestion,
  emptyStudyLab,
  logSession,
  mergeStudyLab,
  minutesPerSubject,
  parseStudyLab,
  practiceRound,
  removeSubject,
  removeTopic,
  saveQuestion,
  saveSubject,
  setConfidence,
  subjectProgress,
  subjectQuestions,
  topicProgress,
  weakTopics,
  type StudyLabState,
} from './studyLab'

const ok = (r: StudyLabState | { error: string }) => {
  if ('error' in r) throw new Error(r.error)
  return r
}
const open = (id: string, topicId: string | null, prompt = `Vraag ${id}`) => ({ id, subjectId: 's', topicId, kind: 'open' as const, prompt, answer: 'Antwoord', choices: [], correct: 0 })

function lab() {
  let s = ok(saveSubject(emptyStudyLab(), { id: 's', name: 'Elektronica' }, 1))
  s = ok(addTopic(s, 's', 'Wet van Ohm', 't1', 2))
  s = ok(addTopic(s, 's', 'Kirchhoff', 't2', 3))
  s = ok(saveQuestion(s, open('q1', 't1'), 4))
  s = ok(saveQuestion(s, open('q2', 't1'), 5))
  s = ok(saveQuestion(s, { id: 'q3', subjectId: 's', topicId: 't2', kind: 'choice', prompt: 'Som van stromen in een knoop?', answer: '', choices: ['0', '1', ' '], correct: 0 }, 6))
  return s
}

describe('Study Lab', () => {
  it('checks courses, topics and questions', () => {
    const s = lab()
    expect(saveSubject(s, { id: 'x', name: 'elektronica' }, 7)).toEqual({ error: 'Dat vak bestaat al.' })
    expect(saveQuestion(s, { ...open('q4', null), answer: ' ' }, 7)).toEqual({ error: 'Typ het antwoord, zodat je jezelf kan nakijken.' })
    expect(saveQuestion(s, { id: 'q5', subjectId: 's', topicId: null, kind: 'choice', prompt: 'x', answer: '', choices: ['a'], correct: 0 }, 7)).toEqual({ error: 'Een meerkeuzevraag heeft minstens twee antwoorden.' })
    expect(s.questions.find((q) => q.id === 'q3')!.choices).toEqual(['0', '1'])
  })

  it('asks wrong answers first, then new ones, then the oldest right ones', () => {
    let s = lab()
    expect(practiceRound(s, 's').map((q) => q.id)).toEqual(['q1', 'q2', 'q3'])
    s = answerQuestion(s, 'q1', true, 'a1', 10)
    s = answerQuestion(s, 'q2', false, 'a2', 11)
    expect(practiceRound(s, 's').map((q) => q.id)).toEqual(['q2', 'q3', 'q1'])
    expect(practiceRound(s, 's', 't1', 1).map((q) => q.id)).toEqual(['q2'])
  })

  it('measures progress per topic from answers and confidence', () => {
    let s = lab()
    s = answerQuestion(s, 'q1', true, 'a1', 10)
    s = answerQuestion(s, 'q2', false, 'a2', 11)
    s = setConfidence(s, 's', 't1', 3, 12)
    const subject = s.subjects[0]
    expect(topicProgress(s, 's', subject.topics[0])).toEqual({ questions: 2, tried: 2, right: 1, confidence: 3, percent: 75 })
    expect(topicProgress(s, 's', subject.topics[1]).percent).toBe(0)
    expect(subjectProgress(s, subject)).toBe(38)
    expect(weakTopics(s).map((w) => w.topic.name)).toEqual(['Kirchhoff', 'Wet van Ohm'])
    s = removeTopic(s, 's', 't1', 13)
    expect(subjectQuestions(s, 's', null).map((q) => q.id)).toEqual(['q1', 'q2'])
    s = removeSubject(s, 's', 14)
    expect(subjectQuestions(s, 's')).toEqual([])
  })

  it('logs sessions and merges devices', () => {
    let a = ok(logSession(lab(), { id: 'x1', subjectId: 's', at: 100, minutes: 25, note: '' }))
    expect(logSession(a, { id: 'x2', subjectId: 's', at: 100, minutes: 0, note: '' })).toEqual({ error: 'Geef een duur tussen 1 minuut en 24 uur.' })
    const b = ok(logSession(lab(), { id: 'x3', subjectId: 's', at: 200, minutes: 50, note: 'labo' }))
    a = mergeStudyLab(a, b)
    expect(minutesPerSubject(a, 0, 1000).get('s')).toBe(75)
    expect(parseStudyLab(JSON.parse(JSON.stringify(a)))).toEqual(a)
  })
})
