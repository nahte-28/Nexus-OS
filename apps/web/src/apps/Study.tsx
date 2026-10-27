import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  agendaDay,
  appointmentsOf,
  DEFAULT_WINDOWS,
  openDeadlines,
  PHASE_LABELS,
  planStudy,
  STUDY_BLOCK_NOTE,
  studyBlockTitle,
  timeLeft,
  type Busy,
  type PlanResult,
  type StudyWindow,
} from '@nexus/core'
import { lifeStore } from '../life/store'
import { useProfiles } from '../profiles/store'
import { readStorage, writeStorage } from '../state/storage'
import { focusMinutes, focusStore } from '../study/timer'

const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'
const TABS = ['Focus', 'Planning'] as const
const DAY = 24 * 60 * 60_000
const HORIZON_DAYS = 21

const useLife = () => useSyncExternalStore(lifeStore.subscribe, lifeStore.getSnapshot)
const useFocus = () => useSyncExternalStore(focusStore.subscribe, focusStore.getSnapshot)

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

/** Studie: a focus timer, and study time planned before your deadlines. */
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
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">{tab === 'Focus' ? <Focus /> : <Planning />}</div>
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
    // Lessons and appointments are busy; earlier study blocks are replaced, so they do not count.
    const busy: Busy[] = []
    const life = items.filter((i) => !(i.kind === 'appointment' && i.notes === STUDY_BLOCK_NOTE))
    for (let d = 0; d <= HORIZON_DAYS; d++) {
      const start = startOfDay(startOfDay(now) + d * DAY + 3_600_000)
      for (const e of agendaDay({ calendarEvents: state.calendarEvents, timetable: state.lessons, items: life, reminders: [] }, start)) {
        if (e.kind === 'lesson' || e.kind === 'appointment') busy.push({ start: e.at, end: e.end })
      }
    }
    const tasks = deadlines.map((d) => ({ id: d.id, title: d.title, dueAt: d.dueAt, minutes: estimates[d.id] ?? DEFAULT_ESTIMATE }))
    setPlan(planStudy(tasks, busy, now, { windows, blockMinutes, horizonDays: HORIZON_DAYS }))
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
      <p className="text-nx-muted">NEXUS plant studieblokken voor je open deadlines in je vrije tijd: buiten je lessen en afspraken, en altijd voor de deadline. Wat het dichtst bij is, komt eerst.</p>
      {deadlines.length === 0 ? (
        <p className="text-nx-muted">Geen open deadlines. Zet ze eerst in de Agenda.</p>
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
      <button type="button" className={primaryButton} disabled={deadlines.length === 0} onClick={make}>
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
