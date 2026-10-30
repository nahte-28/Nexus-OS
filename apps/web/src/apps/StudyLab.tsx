import { useState, useSyncExternalStore } from 'react'
import {
  activeDecks,
  addTopic,
  answerQuestion,
  CONFIDENCE_LABELS,
  countdownLabel,
  deckStats,
  liveSubjects,
  logSession,
  minutesPerSubject,
  practiceRound,
  removeQuestion,
  removeSubject,
  removeTopic,
  saveQuestion,
  saveSubject,
  setConfidence,
  subjectProgress,
  subjectQuestions,
  topicProgress,
  upcomingExams,
  weakTopics,
  type PracticeQuestion,
  type QuestionKind,
  type StudyLabState,
  type StudySubject,
  type StudyTopic,
} from '@nexus/core'
import { flashcardsStore } from '../flashcards/store'
import { openApp } from '../shell/openApp'
import { readStorage, writeStorage } from '../state/storage'
import { examsStore } from '../study/exams'
import { studyLabStore, studyLabSyncProblem, useStudyLab } from '../studylab/store'

const TABS = ['Dashboard', 'Vakken', 'Oefenen', 'Vragen', 'Sessies', 'Voortgang'] as const
type Tab = (typeof TABS)[number]
const TAB_KEY = 'nexus.studylab.tab'
const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'
const when = (t: number) => new Date(t).toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const WEEK = 7 * 24 * 60 * 60_000

function change(apply: (s: StudyLabState) => StudyLabState | { error: string }): string | null {
  const next = apply(studyLabStore.getSnapshot())
  if ('error' in next) return next.error
  studyLabStore.update(() => next)
  return null
}

function Bar({ percent, label }: { percent: number; label: string }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-nx-surface-2">
      <div className="h-full bg-nx-accent" style={{ width: `${percent}%` }} />
    </div>
  )
}

function SubjectPicker({ subjects, value, onChange, label = 'Vak' }: { subjects: StudySubject[]; value: string; onChange: (id: string) => void; label?: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={`${field} w-auto`}>
      {subjects.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  )
}

/** Study Lab: courses with topics, own practice questions, sessions and progress per topic. */
export function StudyLab() {
  const state = useStudyLab()
  const problem = useSyncExternalStore(studyLabSyncProblem.subscribe, studyLabSyncProblem.getSnapshot)
  const [tab, setTabState] = useState<Tab>(() => (TABS.includes(readStorage(TAB_KEY) as Tab) ? (readStorage(TAB_KEY) as Tab) : 'Dashboard'))
  const setTab = (t: Tab) => {
    setTabState(t)
    writeStorage(TAB_KEY, t)
  }
  const subjects = liveSubjects(state)
  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div role="tablist" aria-label="Study Lab" className="flex gap-1 overflow-x-auto border-b border-nx-border px-3 py-2">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`shrink-0 rounded-md px-3 py-1 ${tab === t ? 'bg-nx-surface-2 font-medium' : 'hover:bg-nx-surface-2'}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {problem?.startsWith('setup:') && (
          <p role="alert" className="rounded-md border border-amber-500/40 p-2 text-amber-700 dark:text-amber-300">
            Syncen lukt nog niet: voer eenmalig <code>{problem.slice(6)}</code> uit in de SQL Editor van Supabase (of via Account › Database-check).
          </p>
        )}
        {tab === 'Vakken' ? (
          <Subjects state={state} />
        ) : subjects.length === 0 ? (
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Begin met een vak</h2>
            <p className="text-nx-muted">Maak een vak met zijn onderwerpen. Daarna maak je oefenvragen en zie je per onderwerp hoe ver je staat.</p>
            <button type="button" className={primaryButton} onClick={() => setTab('Vakken')}>
              Naar Vakken
            </button>
          </div>
        ) : (
          <>
            {tab === 'Dashboard' && <Dashboard state={state} onTab={setTab} />}
            {tab === 'Oefenen' && <Practice state={state} subjects={subjects} />}
            {tab === 'Vragen' && <Questions state={state} subjects={subjects} />}
            {tab === 'Sessies' && <Sessions state={state} subjects={subjects} />}
            {tab === 'Voortgang' && <Progress state={state} subjects={subjects} />}
          </>
        )}
      </div>
    </div>
  )
}

function Dashboard({ state, onTab }: { state: StudyLabState; onTab: (t: Tab) => void }) {
  const exams = useSyncExternalStore(examsStore.subscribe, examsStore.getSnapshot)
  const now = Date.now()
  const weak = weakTopics(state, 4)
  const week = minutesPerSubject(state, now - WEEK, now + 1)
  const total = [...week.values()].reduce((a, b) => a + b, 0)
  const soon = upcomingExams(exams, now).slice(0, 3)
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <section aria-label="Eerst oefenen" className="space-y-2 rounded-lg border border-nx-border p-3">
          <h3 className="font-medium">Eerst oefenen</h3>
          {weak.length === 0 ? <p className="text-nx-muted">Voeg onderwerpen toe aan je vakken.</p> : (
            <ul className="space-y-1">
              {weak.map((w) => (
                <li key={w.topic.id} className="flex justify-between gap-2">
                  <span>
                    {w.topic.name} <span className="text-xs text-nx-muted">· {w.subject.name}</span>
                  </span>
                  <span className="text-xs text-nx-muted">{w.percent}%</span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className={small} onClick={() => onTab('Oefenen')}>
            Oefenen
          </button>
        </section>
        <section aria-label="Deze week" className="space-y-2 rounded-lg border border-nx-border p-3">
          <h3 className="font-medium">Deze week</h3>
          <p>{total > 0 ? `${Math.floor(total / 60)} u ${total % 60} min gestudeerd` : 'Nog geen studiesessie de laatste 7 dagen.'}</p>
          {soon.length > 0 && (
            <ul className="space-y-1 text-xs text-nx-muted">
              {soon.map((e) => (
                <li key={e.id}>
                  Examen {e.course}: {countdownLabel(e.at, now)}
                </li>
              ))}
            </ul>
          )}
          <button type="button" className={small} onClick={() => onTab('Sessies')}>
            Sessie noteren
          </button>
        </section>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} onClick={() => openApp('flashcards')}>
          Leerkaarten
        </button>
        <button type="button" className={button} onClick={() => openApp('study')}>
          Planner en focustimer
        </button>
        <button type="button" className={button} onClick={() => openApp('klashub')}>
          KlasHub openen
        </button>
      </div>
    </div>
  )
}

function Subjects({ state }: { state: StudyLabState }) {
  const flashcards = useSyncExternalStore(flashcardsStore.subscribe, flashcardsStore.getSnapshot)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const subjects = liveSubjects(state)
  const decks = activeDecks(flashcards)
  const add = () => {
    const err = change((s) => saveSubject(s, { id: crypto.randomUUID(), name }, Date.now()))
    setError(err)
    if (!err) setName('')
  }
  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input aria-label="Nieuw vak" placeholder="Nieuw vak, bv. Elektronica" value={name} onChange={(e) => setName(e.target.value)} className={field} />
        <button type="submit" className={primaryButton}>
          + Vak
        </button>
      </form>
      {error && <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}
      {subjects.length === 0 && <p className="text-nx-muted">Nog geen vakken.</p>}
      <ul className="space-y-3">
        {subjects.map((s) => (
          <SubjectCard key={s.id} subject={s} state={state} decks={decks} deckInfo={s.deckId ? deckStats(flashcards, s.deckId, Date.now()) : null} />
        ))}
      </ul>
    </div>
  )
}

function SubjectCard({ subject, state, decks, deckInfo }: { subject: StudySubject; state: StudyLabState; decks: Array<{ id: string; name: string }>; deckInfo: { total: number; due: number } | null }) {
  const [topic, setTopic] = useState('')
  const [error, setError] = useState<string | null>(null)
  const percent = subjectProgress(state, subject)
  return (
    <li aria-label={subject.name} className="space-y-2 rounded-lg border border-nx-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{subject.name}</h3>
        <button type="button" className={small} aria-label={`Vak ${subject.name} weghalen`} onClick={() => change((s) => removeSubject(s, subject.id, Date.now()))}>
          Weghalen
        </button>
      </div>
      <Bar percent={percent} label={`${subject.name} voortgang`} />
      <label className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-nx-muted">Leerkaarten</span>
        <select aria-label={`Leerkaarten voor ${subject.name}`} value={subject.deckId ?? ''} onChange={(e) => change((s) => saveSubject(s, { id: subject.id, name: subject.name, deckId: e.target.value || null }, Date.now()))} className={`${field} w-auto py-0.5 text-xs`}>
          <option value="">Geen stapel</option>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        {deckInfo && (
          <span className="text-nx-muted">
            {deckInfo.total} kaarten, {deckInfo.due} te herhalen
          </span>
        )}
      </label>
      <ul className="space-y-1">
        {subject.topics.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>{t.name}</span>
            <span className="flex items-center gap-1">
              <select aria-label={`Hoe zeker ben je van ${t.name}?`} value={t.confidence} onChange={(e) => change((s) => setConfidence(s, subject.id, t.id, Number(e.target.value) as StudyTopic['confidence'], Date.now()))} className={`${field} w-auto py-0.5 text-xs`}>
                {CONFIDENCE_LABELS.map((label, i) => (
                  <option key={label} value={i}>
                    {label}
                  </option>
                ))}
              </select>
              <button type="button" className={small} aria-label={`Onderwerp ${t.name} weghalen`} onClick={() => change((s) => removeTopic(s, subject.id, t.id, Date.now()))}>
                ×
              </button>
            </span>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const err = change((s) => addTopic(s, subject.id, topic, crypto.randomUUID(), Date.now()))
          setError(err)
          if (!err) setTopic('')
        }}
      >
        <input aria-label={`Nieuw onderwerp voor ${subject.name}`} placeholder="Onderwerp, bv. Wet van Ohm" value={topic} onChange={(e) => setTopic(e.target.value)} className={`${field} py-1`} />
        <button type="submit" className={small}>
          + Onderwerp
        </button>
      </form>
      {error && <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}
    </li>
  )
}

function Practice({ state, subjects }: { state: StudyLabState; subjects: StudySubject[] }) {
  const [subjectId, setSubjectId] = useState(subjects[0].id)
  const subject = subjects.find((s) => s.id === subjectId) ?? subjects[0]
  const [topicId, setTopicId] = useState<string>('')
  const [round, setRound] = useState<PracticeQuestion[] | null>(null)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState<number | 'open' | null>(null)
  const [score, setScore] = useState(0)
  const start = () => {
    setRound(practiceRound(state, subject.id, topicId || null))
    setIndex(0)
    setRevealed(null)
    setScore(0)
  }
  const answer = (correct: boolean) => {
    const q = round?.[index]
    if (!q) return
    studyLabStore.update((s) => answerQuestion(s, q.id, correct, crypto.randomUUID(), Date.now()))
    if (correct) setScore((n) => n + 1)
    setIndex((i) => i + 1)
    setRevealed(null)
  }
  if (!round) {
    const count = subjectQuestions(state, subject.id, topicId ? topicId : undefined).length
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <SubjectPicker
            subjects={subjects}
            value={subject.id}
            onChange={(id) => {
              setSubjectId(id)
              setTopicId('')
            }}
          />
          <select aria-label="Onderwerp" value={topicId} onChange={(e) => setTopicId(e.target.value)} className={`${field} w-auto`}>
            <option value="">Alle onderwerpen</option>
            {subject.topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <p className="text-nx-muted">{count === 0 ? 'Nog geen vragen hier. Maak er een paar in Vragen.' : `${count} ${count === 1 ? 'vraag' : 'vragen'}. Een ronde stelt er tot 10, eerst wat je fout had en wat je nog nooit probeerde.`}</p>
        <button type="button" className={primaryButton} disabled={count === 0} onClick={start}>
          Start een ronde
        </button>
      </div>
    )
  }
  const q = round[index]
  if (!q)
    return (
      <div role="status" className="space-y-2">
        <h3 className="text-lg font-semibold">
          Klaar: {score} van {round.length} juist
        </h3>
        <button type="button" className={button} onClick={() => setRound(null)}>
          Nog een ronde
        </button>
      </div>
    )
  return (
    <section aria-label="Oefenvraag" className="space-y-3">
      <p className="text-xs text-nx-muted">
        Vraag {index + 1} van {round.length}
      </p>
      <p className="whitespace-pre-line text-base font-medium">{q.prompt}</p>
      {q.kind === 'choice' ? (
        <div className="space-y-2">
          {q.choices.map((c, i) => {
            const picked = revealed === i
            const right = revealed !== null && i === q.correct
            return (
              <button
                key={i}
                type="button"
                disabled={revealed !== null}
                onClick={() => setRevealed(i)}
                className={`block w-full rounded-lg border p-2 text-left ${right ? 'border-green-600 bg-green-500/10' : picked ? 'border-red-600 bg-red-500/10' : 'border-nx-border hover:bg-nx-surface-2'}`}
              >
                {c}
              </button>
            )
          })}
          {revealed !== null && (
            <div className="space-y-2">
              <p role="status">{revealed === q.correct ? 'Juist!' : `Fout: het juiste antwoord is "${q.choices[q.correct]}".`}</p>
              {q.answer && <p className="text-nx-muted">{q.answer}</p>}
              <button type="button" className={primaryButton} onClick={() => answer(revealed === q.correct)}>
                Volgende
              </button>
            </div>
          )}
        </div>
      ) : revealed === null ? (
        <button type="button" className={button} onClick={() => setRevealed('open')}>
          Toon het antwoord
        </button>
      ) : (
        <div className="space-y-2">
          <p className="whitespace-pre-line rounded-lg border border-nx-border p-2">{q.answer}</p>
          <div className="flex gap-2">
            <button type="button" className={primaryButton} onClick={() => answer(true)}>
              Ik had het juist
            </button>
            <button type="button" className={button} onClick={() => answer(false)}>
              Nog niet
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function Questions({ state, subjects }: { state: StudyLabState; subjects: StudySubject[] }) {
  const [subjectId, setSubjectId] = useState(subjects[0].id)
  const subject = subjects.find((s) => s.id === subjectId) ?? subjects[0]
  const [topicId, setTopicId] = useState('')
  const [kind, setKind] = useState<QuestionKind>('open')
  const [prompt, setPrompt] = useState('')
  const [answer, setAnswer] = useState('')
  const [choices, setChoices] = useState(['', '', '', ''])
  const [correct, setCorrect] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const save = () => {
    const err = change((s) => saveQuestion(s, { id: crypto.randomUUID(), subjectId: subject.id, topicId: topicId || null, kind, prompt, answer, choices, correct }, Date.now()))
    setError(err)
    if (!err) {
      setPrompt('')
      setAnswer('')
      setChoices(['', '', '', ''])
      setCorrect(0)
    }
  }
  const list = subjectQuestions(state, subject.id)
  const topicName = (id: string | null) => subject.topics.find((t) => t.id === id)?.name ?? 'Zonder onderwerp'
  return (
    <div className="space-y-4">
      <form
        aria-label="Nieuwe vraag"
        className="space-y-2 rounded-lg border border-nx-border p-3"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <div className="flex flex-wrap gap-2">
          <SubjectPicker subjects={subjects} value={subject.id} onChange={setSubjectId} />
          <select aria-label="Onderwerp van de vraag" value={topicId} onChange={(e) => setTopicId(e.target.value)} className={`${field} w-auto`}>
            <option value="">Zonder onderwerp</option>
            {subject.topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select aria-label="Soort vraag" value={kind} onChange={(e) => setKind(e.target.value as QuestionKind)} className={`${field} w-auto`}>
            <option value="open">Open vraag</option>
            <option value="choice">Meerkeuze</option>
          </select>
        </div>
        <textarea aria-label="Vraag" placeholder="De vraag" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} className={field} />
        {kind === 'choice' && (
          <fieldset className="space-y-1">
            <legend className="text-xs text-nx-muted">Antwoorden (duid het juiste aan)</legend>
            {choices.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="radio" name="correct" aria-label={`Antwoord ${i + 1} is juist`} checked={correct === i} onChange={() => setCorrect(i)} />
                <input aria-label={`Antwoord ${i + 1}`} value={c} onChange={(e) => setChoices(choices.map((x, j) => (j === i ? e.target.value : x)))} className={`${field} py-1`} />
              </div>
            ))}
          </fieldset>
        )}
        <textarea aria-label={kind === 'open' ? 'Antwoord' : 'Uitleg (optioneel)'} placeholder={kind === 'open' ? 'Het antwoord' : 'Waarom dit het juiste antwoord is'} rows={2} value={answer} onChange={(e) => setAnswer(e.target.value)} className={field} />
        <button type="submit" className={primaryButton}>
          Vraag bewaren
        </button>
        {error && <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}
      </form>
      {list.length === 0 ? <p className="text-nx-muted">Nog geen vragen voor {subject.name}.</p> : (
        <ul aria-label="Vragen" className="divide-y divide-nx-border rounded-lg border border-nx-border">
          {list.map((q) => (
            <li key={q.id} className="flex items-start justify-between gap-2 p-2">
              <span className="min-w-0">
                <span className="block">{q.prompt}</span>
                <span className="block text-xs text-nx-muted">
                  {q.kind === 'choice' ? 'Meerkeuze' : 'Open'} · {topicName(q.topicId)}
                </span>
              </span>
              <button type="button" className={small} aria-label={`Vraag ${q.prompt} weghalen`} onClick={() => change((s) => removeQuestion(s, q.id, Date.now()))}>
                Weghalen
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Sessions({ state, subjects }: { state: StudyLabState; subjects: StudySubject[] }) {
  const [subjectId, setSubjectId] = useState(subjects[0].id)
  const [minutes, setMinutes] = useState('25')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const name = (id: string) => state.subjects.find((s) => s.id === id)?.name ?? 'Weggehaald vak'
  const add = () => {
    const err = change((s) => logSession(s, { id: crypto.randomUUID(), subjectId, at: Date.now(), minutes: Number(minutes), note }))
    setError(err)
    if (!err) setNote('')
  }
  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <SubjectPicker subjects={subjects} value={subjectId} onChange={setSubjectId} />
        <input type="number" min={1} max={1440} aria-label="Minuten" value={minutes} onChange={(e) => setMinutes(e.target.value)} className={`${field} w-24`} />
        <input aria-label="Notitie bij de sessie" placeholder="Wat deed je? (optioneel)" value={note} onChange={(e) => setNote(e.target.value)} className={`${field} flex-1`} />
        <button type="submit" className={button}>
          Sessie noteren
        </button>
      </form>
      {error && <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}
      {state.sessions.length === 0 ? <p className="text-nx-muted">Nog geen sessies. De focustimer in Studie telt apart; hier noteer je wat je per vak deed.</p> : (
        <ul aria-label="Sessies" className="space-y-1">
          {state.sessions.slice(0, 50).map((x) => (
            <li key={x.id} className="flex justify-between gap-2">
              <span>
                {name(x.subjectId)} · {x.minutes} min{x.note ? ` · ${x.note}` : ''}
              </span>
              <span className="shrink-0 text-xs text-nx-muted">{when(x.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Progress({ state, subjects }: { state: StudyLabState; subjects: StudySubject[] }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-nx-muted">Per onderwerp: de helft komt uit je laatste antwoord op elke vraag, de helft uit hoe zeker je je voelt.</p>
      {subjects.map((s) => (
        <section key={s.id} aria-label={`Voortgang ${s.name}`} className="space-y-2">
          <h3 className="font-medium">
            {s.name} <span className="text-xs text-nx-muted">{subjectProgress(state, s)}%</span>
          </h3>
          {[...s.topics, null].map((t) => {
            const p = topicProgress(state, s.id, t)
            if (!t && p.questions === 0) return null
            const label = t?.name ?? 'Zonder onderwerp'
            return (
              <div key={t?.id ?? 'none'} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>{label}</span>
                  <span className="text-nx-muted">
                    {p.right}/{p.questions} juist · {CONFIDENCE_LABELS[p.confidence]}
                  </span>
                </div>
                <Bar percent={p.percent} label={`${label} voortgang`} />
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}
