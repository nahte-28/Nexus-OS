import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react'
import {
  agendaDay,
  activeDecks,
  appointmentsOf,
  countdownLabel,
  deckStats,
  examTasks,
  studiedMinutes,
  upcomingExams,
  DEFAULT_WINDOWS,
  openDeadlines,
  PHASE_LABELS,
  planStudy,
  STUDY_BLOCK_NOTE,
  studyBlockTitle,
  timeLeft,
  type Busy,
  type Exam,
  type PlanResult,
  type StudyWindow,
} from '@nexus/core'
import { flashcardsStore } from '../flashcards/store'
import { gradesStore } from '../grades/store'
import { lifeStore } from '../life/store'
import { useProfiles } from '../profiles/store'
import { readStorage, writeStorage } from '../state/storage'
import { addExam, examsStore, examsSyncProblem, removeExam, updateExam, type ExamDraft } from '../study/exams'
import { focusMinutes, focusStore } from '../study/timer'
import { StudyGroupTab } from './StudyGroup'

const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'
const TABS = ['Focus', 'Examens', 'Planning', 'Groep'] as const
const DAY = 24 * 60 * 60_000
const HORIZON_DAYS = 21

const useLife = () => useSyncExternalStore(lifeStore.subscribe, lifeStore.getSnapshot)
const useFocus = () => useSyncExternalStore(focusStore.subscribe, focusStore.getSnapshot)
const useExams = () => useSyncExternalStore(examsStore.subscribe, examsStore.getSnapshot)

function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

const mmss = (ms: number) => {
  const s = Math.ceil(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
const clock = (t: number) => new Date(t).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })
const dayTitle = (t: number) => {
  const word = new Date(t).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' })
  return word.charAt(0).toUpperCase() + word.slice(1)
}

function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Studie: a focus timer, your exams, study time planned before your deadlines and exams, and your study group. */
export function Study() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Focus')
  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div role="tablist" className="flex gap-1 border-b border-nx-border px-3 py-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1 ${tab === t ? 'bg-nx-surface-2 font-medium' : 'hover:bg-nx-surface-2'}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">{tab === 'Focus' ? <Focus /> : tab === 'Examens' ? <Exams onPlan={() => setTab('Planning')} /> : tab === 'Planning' ? <Planning /> : <StudyGroupTab />}</div>
    </div>
  )
}

function Focus() {
  const { timer, settings, log } = useFocus()
  const items = useLife()
  const now = useNow()
  const running = timer.endsAt !== null
  const today = startOfDay(now)
  const week = today - ((new Date(today).getDay() + 6) % 7) * DAY
  const tasks = openDeadlines(items).filter((d) => d.dueAt > now - DAY)
  return (
    <>
      <section aria-label="Focustimer" className="space-y-3 rounded-2xl border border-nx-border bg-nx-surface-2 p-6 text-center">
        <p className="text-xs font-semibold tracking-wide text-nx-accent uppercase">
          {PHASE_LABELS[timer.phase]} · ronde {Math.min(timer.round + (timer.phase === 'focus' ? 1 : 0), 99)}
        </p>
        <p className="font-mono text-6xl tabular-nums" aria-live="off" role="timer">
          {mmss(timeLeft(timer, now))}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className={primaryButton} onClick={() => (running ? focusStore.pause() : focusStore.start())}>
            {running ? 'Pauzeren' : 'Starten'}
          </button>
          <button type="button" className={button} onClick={() => focusStore.skip()}>
            Overslaan
          </button>
          <button type="button" className={button} onClick={focusStore.reset}>
            Opnieuw
          </button>
        </div>
        <input
          list="focus-tasks"
          value={timer.task}
          onChange={(e) => focusStore.setTask(e.target.value)}
          placeholder="Waar werk je aan? Bv. Verslag labo 3"
          aria-label="Taak"
          className={`${field} mx-auto max-w-sm text-center`}
        />
        <datalist id="focus-tasks">
          {tasks.map((d) => (
            <option key={d.id} value={d.title} />
          ))}
        </datalist>
      </section>
      <p className="text-nx-muted">
        Vandaag {focusMinutes(log, today)} min gefocust, deze week {focusMinutes(log, week)} min. De timer loopt door als je dit venster sluit; na een focusronde begint de pauze vanzelf.
      </p>
      <details>
        <summary className="cursor-pointer text-nx-muted">Instellingen</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          {(
            [
              ['focusMinutes', 'Focus (min)'],
              ['breakMinutes', 'Pauze (min)'],
              ['longBreakMinutes', 'Lange pauze (min)'],
              ['rounds', 'Rondes tot lange pauze'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-nx-muted">{label}</span>
              <input type="number" min={1} value={settings[key]} onChange={(e) => focusStore.updateSettings({ [key]: Number(e.target.value) })} className={field} />
            </label>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2">
          <input type="checkbox" checked={settings.phone} onChange={(e) => focusStore.updateSettings({ phone: e.target.checked })} />
          Melding aan het einde ook op gsm en horloge
        </label>
      </details>
    </>
  )
}

const ESTIMATES_KEY = 'nexus.study.estimates'
const WINDOWS_KEY = 'nexus.study.windows'
const DEFAULT_ESTIMATE = 120

function readJson<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(readStorage(key) ?? 'null') as T) ?? fallback
  } catch {
    return fallback
  }
}

function Planning() {
  const items = useLife()
  const { state } = useProfiles()
  const now = Date.now()
  const [estimates, setEstimates] = useState<Record<string, number>>(() => readJson(ESTIMATES_KEY, {}))
  const [windows, setWindows] = useState<StudyWindow[]>(() => readJson(WINDOWS_KEY, DEFAULT_WINDOWS))
  const [blockMinutes, setBlockMinutes] = useState(60)
  const [plan, setPlan] = useState<PlanResult | null>(null)
  const [saved, setSaved] = useState<number | null>(null)
  const deadlines = openDeadlines(items).filter((d) => d.dueAt > now)
  const exams = useExams()
  const { log } = useFocus()
  const examPlan = examTasks(exams, now, log)

  const setEstimate = (id: string, minutes: number) => {
    const next = { ...estimates, [id]: minutes }
    setEstimates(next)
    writeStorage(ESTIMATES_KEY, JSON.stringify(next))
    setPlan(null)
  }
  const setWindow = (i: number, patch: Partial<StudyWindow>) => {
    const next = windows.map((w, j) => (j === i ? { ...w, ...patch } : w))
    setWindows(next)
    writeStorage(WINDOWS_KEY, JSON.stringify(next))
    setPlan(null)
  }

  const make = () => {
    // Lessons, appointments and Google Agenda events are busy; earlier study blocks are replaced, so they do not count.
    const busy: Busy[] = []
    // The exams themselves are in the Agenda as appointments, so they count as busy too.
    const life = items.filter((i) => !(i.kind === 'appointment' && i.notes === STUDY_BLOCK_NOTE))
    for (let d = 0; d <= 60; d++) {
      const start = startOfDay(startOfDay(now) + d * DAY + 3_600_000)
      for (const e of agendaDay({ calendarEvents: state.calendarEvents, googleEvents: state.googleEvents, timetable: state.lessons, items: life, reminders: [] }, start)) {
        if (e.kind === 'lesson' || e.kind === 'appointment' || e.kind === 'event') busy.push({ start: e.at, end: e.end })
      }
    }
    const tasks = [...deadlines.map((d) => ({ id: d.id, title: d.title, dueAt: d.dueAt, minutes: estimates[d.id] ?? DEFAULT_ESTIMATE })), ...examPlan]
    // Exams can be weeks away: look far enough ahead to spread their study time.
    const horizonDays = Math.max(HORIZON_DAYS, ...examPlan.map((t) => Math.ceil((t.dueAt - now) / DAY)))
    setPlan(planStudy(tasks, busy, now, { windows, blockMinutes, horizonDays: Math.min(horizonDays, 60) }))
    setSaved(null)
  }

  const save = async () => {
    if (!plan) return
    for (const old of appointmentsOf(lifeStore.getSnapshot())) {
      if (old.notes === STUDY_BLOCK_NOTE && old.startAt > Date.now()) await lifeStore.remove(old.id)
    }
    for (const b of plan.blocks) {
      await lifeStore.addAppointment({ title: studyBlockTitle(b.title), startAt: b.start, endAt: b.end, location: '', notes: STUDY_BLOCK_NOTE, remind: [0], target: 'this_device' })
    }
    setSaved(plan.blocks.length)
  }

  const days = plan ? [...new Set(plan.blocks.map((b) => startOfDay(b.start)))] : []
  return (
    <>
      <p className="text-nx-muted">NEXUS plant studieblokken voor je open deadlines en examens in je vrije tijd: buiten je lessen en afspraken, en altijd voor de deadline. Wat het dichtst bij is, komt eerst.</p>
      {examPlan.length > 0 && (
        <p>
          Ook {examPlan.length === 1 ? '1 examen' : `${examPlan.length} examens`} uit de Examenplanner: {examPlan.map((t) => `${t.title} (nog ${Math.round((t.minutes / 60) * 10) / 10} uur)`).join(', ')}.
        </p>
      )}
      {deadlines.length === 0 ? (
        <p className="text-nx-muted">{examPlan.length > 0 ? 'Geen open deadlines.' : 'Geen open deadlines of examens. Zet ze eerst in de Agenda of de Examenplanner.'}</p>
      ) : (
        <section aria-label="Hoeveel tijd nodig" className="space-y-1">
          <h3 className="font-medium">Hoeveel tijd heb je nog nodig?</h3>
          <ul className="space-y-1">
            {deadlines.map((d) => (
              <li key={d.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {d.title} <span className="text-nx-muted">· {new Date(d.dueAt).toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                </span>
                <select value={estimates[d.id] ?? DEFAULT_ESTIMATE} onChange={(e) => setEstimate(d.id, Number(e.target.value))} aria-label={`Tijd voor ${d.title}`} className={`${field} w-28`}>
                  {[0, 30, 60, 90, 120, 180, 240, 360, 480, 600].map((m) => (
                    <option key={m} value={m}>
                      {m === 0 ? 'niets meer' : m < 60 ? `${m} min` : `${m / 60} uur`}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </section>
      )}
      <details>
        <summary className="cursor-pointer text-nx-muted">Wanneer wil je studeren?</summary>
        <div className="mt-2 space-y-2">
          {windows.map((w, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <span className="w-28">{w.days.join(',') === '1,2,3,4,5' ? 'Weekdagen' : w.days.join(',') === '6,7' ? 'Weekend' : `Dagen ${w.days.join(', ')}`}</span>
              <input type="time" value={w.start} onChange={(e) => setWindow(i, { start: e.target.value })} aria-label={`Van, ${i + 1}`} className={`${field} w-28`} />
              tot
              <input type="time" value={w.end} onChange={(e) => setWindow(i, { end: e.target.value })} aria-label={`Tot, ${i + 1}`} className={`${field} w-28`} />
            </div>
          ))}
          <label className="flex items-center gap-2">
            Blokken van
            <select value={blockMinutes} onChange={(e) => setBlockMinutes(Number(e.target.value))} className={`${field} w-28`}>
              {[30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>
      <button type="button" className={primaryButton} disabled={deadlines.length === 0 && examPlan.length === 0} onClick={make}>
        Planning maken
      </button>
      {plan && (
        <section aria-label="Voorstel" className="space-y-3">
          {plan.short.map((s) => (
            <p key={s.taskId} role="alert" className="text-red-500">
              {s.title}: nog {s.minutes} min zonder plek voor de deadline. Maak meer tijd vrij of verlaag de schatting.
            </p>
          ))}
          {plan.blocks.length === 0 ? (
            <p className="text-nx-muted">Er is niets te plannen.</p>
          ) : (
            days.map((day) => (
              <div key={day} className="space-y-1">
                <h3 className="font-medium">{dayTitle(day)}</h3>
                <ul className="space-y-1">
                  {plan.blocks
                    .filter((b) => startOfDay(b.start) === day)
                    .map((b) => (
                      <li key={b.start} className="flex gap-2 rounded-md bg-nx-surface-2 px-2 py-1.5">
                        <span className="w-24 shrink-0 text-nx-muted tabular-nums">
                          {clock(b.start)}–{clock(b.end)}
                        </span>
                        <span className="min-w-0 flex-1">{b.title}</span>
                      </li>
                    ))}
                </ul>
              </div>
            ))
          )}
          {plan.blocks.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={primaryButton} onClick={() => void save()}>
                In Agenda zetten
              </button>
              <span className="text-nx-muted">{saved !== null ? `${saved} studieblokken staan in je Agenda.` : 'Eerder geplande studieblokken worden vervangen.'}</span>
            </div>
          )}
        </section>
      )}
    </>
  )
}

const toLocalInput = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function ExamForm({ initial, onDone }: { initial?: Exam; onDone: () => void }) {
  const decks = activeDecks(useSyncExternalStore(flashcardsStore.subscribe, flashcardsStore.getSnapshot))
  const courses = useSyncExternalStore(gradesStore.subscribe, gradesStore.getSnapshot).courses.filter((c) => c.deletedAt === null)
  const [course, setCourse] = useState(initial?.course ?? '')
  const [when, setWhen] = useState(() => toLocalInput(initial?.at ?? (() => {
    const d = new Date(Date.now() + 14 * DAY)
    d.setHours(9, 0, 0, 0)
    return d.getTime()
  })()))
  const [minutes, setMinutes] = useState(initial?.minutes ?? 120)
  const [location, setLocation] = useState(initial?.location ?? '')
  const [hours, setHours] = useState(initial?.studyHours ?? 10)
  const [deckId, setDeckId] = useState(initial?.deckId ?? '')
  const at = new Date(when).getTime()
  const valid = course.trim() !== '' && Number.isFinite(at)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    const draft: ExamDraft = { course, at, minutes, location, studyHours: Math.max(0, hours), deckId: deckId || null }
    void (initial ? updateExam(initial.id, draft) : addExam(draft))
    onDone()
  }

  return (
    <form aria-label={initial ? 'Examen wijzigen' : 'Nieuw examen'} onSubmit={submit} className="space-y-2 rounded-lg border border-nx-border p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <input autoFocus list="exam-courses" value={course} onChange={(e) => setCourse(e.target.value)} maxLength={80} placeholder="Vak, bv. Elektronica 1" aria-label="Vak" className={field} />
        <datalist id="exam-courses">
          {courses.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
        <input type="datetime-local" value={when} onChange={(e) => e.target.value && setWhen(e.target.value)} aria-label="Wanneer" className={field} />
        <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} placeholder="Lokaal (optioneel)" aria-label="Lokaal" className={field} />
        <label className="flex items-center gap-2">
          <span className="shrink-0 text-nx-muted">Duur</span>
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="Duur" className={field}>
            {[30, 60, 90, 120, 150, 180, 240].map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} min` : `${m / 60} uur`}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="shrink-0 text-nx-muted">Studietijd</span>
          <input type="number" min={0} max={200} step={0.5} value={hours} onChange={(e) => setHours(Number(e.target.value))} aria-label="Studietijd in uren" className={field} />
          <span className="text-nx-muted">uur</span>
        </label>
        <select value={deckId} onChange={(e) => setDeckId(e.target.value)} aria-label="Leerkaarten" className={field}>
          <option value="">Geen leerkaarten</option>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-nx-muted">Het examen komt in je Agenda, met een herinnering de dag ervoor en een uur ervoor, ook op je gsm. Focustijd met de naam van het vak telt af van de studietijd.</p>
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={!valid}>
          {initial ? 'Bewaren' : 'Examen toevoegen'}
        </button>
        <button type="button" className={button} onClick={onDone}>
          Annuleren
        </button>
      </div>
    </form>
  )
}

function Exams({ onPlan }: { onPlan: () => void }) {
  const state = useExams()
  const { log } = useFocus()
  const cards = useSyncExternalStore(flashcardsStore.subscribe, flashcardsStore.getSnapshot)
  const problem = useSyncExternalStore(examsSyncProblem.subscribe, examsSyncProblem.getSnapshot)
  const now = useNow(60_000)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const exams = upcomingExams(state, now)
  const deckName = new Map(activeDecks(cards).map((d) => [d.id, d.name]))

  return (
    <>
      {problem?.startsWith('setup:') && (
        <p className="rounded-lg border border-nx-border bg-nx-surface-2 p-3">
          Je examens staan alleen op dit apparaat: de database is nog niet bijgewerkt. Voer <code className="font-mono text-xs">{problem.slice(6)}</code> uit in de SQL Editor van Supabase.
        </p>
      )}
      <p className="text-nx-muted">Zet je examens erin met hoeveel studietijd je denkt nodig te hebben. De Studieplanner spreidt die tijd over de dagen ervoor, rond je lessen en afspraken.</p>
      {adding ? (
        <ExamForm onDone={() => setAdding(false)} />
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primaryButton} onClick={() => setAdding(true)}>
            + Examen
          </button>
          {exams.length > 0 && (
            <button type="button" className={button} onClick={onPlan}>
              Studietijd plannen
            </button>
          )}
        </div>
      )}
      {exams.length === 0 && !adding && <p className="text-nx-muted">Nog geen examens.</p>}
      <ul className="space-y-2">
        {exams.map((e) => {
          if (editing === e.id)
            return (
              <li key={e.id}>
                <ExamForm initial={e} onDone={() => setEditing(null)} />
              </li>
            )
          const studied = studiedMinutes(e.course, log)
          const needed = e.studyHours * 60
          const percent = needed > 0 ? Math.min(100, Math.round((studied / needed) * 100)) : 100
          const deck = e.deckId ? deckStats(cards, e.deckId, now) : null
          return (
            <li key={e.id} className="space-y-2 rounded-lg border border-nx-border p-3">
              <div className="flex flex-wrap items-start gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{e.course}</span>
                  <span className="block text-xs text-nx-muted">
                    {dayTitle(e.at)} om {clock(e.at)}
                    {e.location && ` · ${e.location}`}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${countdownLabel(e.at, now) === 'vandaag' || countdownLabel(e.at, now) === 'morgen' ? 'bg-red-500/15 text-red-600' : 'bg-nx-surface-2'}`}>
                  {countdownLabel(e.at, now)}
                </span>
              </div>
              {needed > 0 && (
                <div className="space-y-1">
                  <div role="meter" aria-label={`${e.course} gestudeerd`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 rounded-full bg-nx-surface-2">
                    <div className="h-2 rounded-full bg-nx-accent" style={{ width: `${percent}%` }} />
                  </div>
                  <p className="text-xs text-nx-muted">
                    {Math.round((studied / 60) * 10) / 10} van {e.studyHours} uur gestudeerd met de focustimer
                  </p>
                </div>
              )}
              {deck && (
                <p className="text-xs">
                  Leerkaarten {deckName.get(e.deckId!) ?? ''}: {deck.due > 0 ? `${deck.due} om te herhalen` : 'niets te herhalen vandaag'}, {deck.learned} van {deck.total} gekend.
                </p>
              )}
              <div className="flex gap-2">
                <button type="button" className="rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2" onClick={() => setEditing(e.id)}>
                  Wijzigen
                </button>
                <button type="button" className="rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2" aria-label={`Examen ${e.course} verwijderen`} onClick={() => void removeExam(e.id)}>
                  Verwijderen
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-nx-muted">Tip: zet de naam van het vak in de taak van de focustimer, dan telt die tijd mee.</p>
    </>
  )
}
