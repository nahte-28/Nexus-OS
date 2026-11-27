import { useState, useSyncExternalStore } from 'react'
import {
  agendaDay,
  appointmentsOf,
  blockSlotTitle,
  blockSummary,
  BLOCK_BREAKS,
  BLOCK_LENGTHS,
  dateKeyOf,
  deckStats,
  DEFAULT_BLOCK,
  EXAM_BLOCK_NOTE,
  examTasks,
  linkedEvents,
  planExamBlock,
  STUDY_BLOCK_NOTE,
  upcomingExams,
  type BlockPlan,
  type BlockSettings,
  type Busy,
} from '@nexus/core'
import { flashcardsStore } from '../flashcards/store'
import { lifeStore } from '../life/store'
import { useProfiles } from '../profiles/store'
import { examsStore } from './exams'
import { focusStore } from './timer'

const field = 'min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'
const WEEKDAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']
const DAY = 24 * 60 * 60_000

const clock = (t: number) => new Date(t).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })
const dayTitle = (t: number) => {
  const word = new Date(t).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' })
  return word.charAt(0).toUpperCase() + word.slice(1)
}
const hours = (minutes: number) => `${Math.round((minutes / 60) * 10) / 10} uur`

function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Examenblok: a day-by-day schedule up to your last exam, with herhaling the day before each exam. */
export function ExamBlock() {
  const state = useSyncExternalStore(examsStore.subscribe, examsStore.getSnapshot)
  const { log } = useSyncExternalStore(focusStore.subscribe, focusStore.getSnapshot)
  const cards = useSyncExternalStore(flashcardsStore.subscribe, flashcardsStore.getSnapshot)
  const items = useSyncExternalStore(lifeStore.subscribe, lifeStore.getSnapshot)
  const { state: profiles } = useProfiles()
  const settings = state.block ?? DEFAULT_BLOCK
  const [plan, setPlan] = useState<BlockPlan | null>(null)
  const [saved, setSaved] = useState<number | null>(null)
  const now = Date.now()
  const exams = upcomingExams(state, now)

  const change = (patch: Partial<BlockSettings>) => {
    examsStore.update((s) => ({ ...s, block: { ...(s.block ?? DEFAULT_BLOCK), ...patch, updatedAt: Date.now() } }))
    setPlan(null)
    setSaved(null)
  }

  const make = () => {
    const needs = Object.fromEntries(exams.map((e) => [e.id, 0]))
    for (const t of examTasks(state, now, log)) needs[t.id.slice(5)] = t.minutes
    // Earlier plans of the Studieplanner and the Examenblok are replaced, so they do not count as busy.
    const life = items.filter((i) => !(i.kind === 'appointment' && (i.notes === STUDY_BLOCK_NOTE || i.notes === EXAM_BLOCK_NOTE)))
    const last = exams.length > 0 ? exams[exams.length - 1].at : now
    const busy: Busy[] = []
    for (let d = 0; d <= Math.min(120, Math.ceil((last - now) / DAY) + 1); d++) {
      const start = startOfDay(startOfDay(now) + d * DAY + 3_600_000)
      for (const e of agendaDay({ calendarEvents: profiles.calendarEvents, googleEvents: linkedEvents(profiles), timetable: profiles.lessons, items: life, reminders: [] }, start)) {
        if (e.kind === 'appointment' || e.kind === 'event' || (e.kind === 'lesson' && settings.lessons)) busy.push({ start: e.at, end: e.end })
      }
    }
    setPlan(planExamBlock(exams, needs, busy, settings, now))
    setSaved(null)
  }

  const save = async () => {
    if (!plan) return
    for (const old of appointmentsOf(lifeStore.getSnapshot())) {
      if (old.notes === EXAM_BLOCK_NOTE && old.startAt > Date.now()) await lifeStore.remove(old.id)
    }
    let n = 0
    for (const d of plan.days) {
      for (const b of d.blocks) {
        await lifeStore.addAppointment({ title: blockSlotTitle(b), startAt: b.start, endAt: b.end, location: '', notes: EXAM_BLOCK_NOTE, remind: [0], target: 'this_device' })
        n++
      }
    }
    setSaved(n)
  }

  if (exams.length === 0) return <p className="text-nx-muted">Zet eerst je examens in het tabblad Examens, met hoeveel uur je per vak nodig hebt. Dan maakt NEXUS hier je blokschema.</p>

  return (
    <>
      <p className="text-nx-muted">
        NEXUS maakt een blokschema tot je laatste examen. Elke vrije dag wordt verdeeld in studieblokken met pauzes. De dag voor een examen is voor herhaling van dat vak, en de rest gaat naar het examen dat eerst komt.
      </p>
      <section aria-label="Instellingen van je blok" className="space-y-2 rounded-lg border border-nx-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2">
            Blok begint op
            <input type="date" value={settings.start ?? dateKeyOf(now + DAY)} min={dateKeyOf(now + DAY)} onChange={(e) => change({ start: e.target.value || null })} className={field} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          Studeren van
          <input type="time" aria-label="Studeren van" value={settings.from} onChange={(e) => e.target.value && e.target.value < settings.to && change({ from: e.target.value })} className={`${field} w-28`} />
          tot
          <input type="time" aria-label="Studeren tot" value={settings.to} onChange={(e) => e.target.value && e.target.value > settings.from && change({ to: e.target.value })} className={`${field} w-28`} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2">
            Blokken van
            <select value={settings.blockMinutes} onChange={(e) => change({ blockMinutes: Number(e.target.value) })} className={field}>
              {BLOCK_LENGTHS.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            pauze
            <select value={settings.breakMinutes} onChange={(e) => change({ breakMinutes: Number(e.target.value) })} className={field}>
              {BLOCK_BREAKS.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span>Rustdagen</span>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Rustdagen">
            {WEEKDAYS.map((label, i) => {
              const day = i + 1
              const on = settings.restDays.includes(day)
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  onClick={() => change({ restDays: on ? settings.restDays.filter((d) => d !== day) : [...settings.restDays, day].sort() })}
                  className={`size-8 rounded-full border border-nx-border text-xs ${on ? 'bg-nx-accent font-medium text-nx-accent-text' : 'hover:bg-nx-surface-2'}`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={settings.lunch} onChange={(e) => change({ lunch: e.target.checked })} />
          Middagpauze van 12:30 tot 13:30
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={settings.review} onChange={(e) => change({ review: e.target.checked })} />
          De dag voor een examen is herhaling van dat vak
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={settings.lessons} onChange={(e) => change({ lessons: e.target.checked })} />
          Lessen in mijn agenda tellen mee
        </label>
      </section>
      <button type="button" className={primaryButton} onClick={make}>
        Blokschema maken
      </button>
      {plan && (
        <section aria-label="Blokschema" className="space-y-3">
          <p className="font-medium">{blockSummary(plan)}</p>
          {plan.short.map((s) => (
            <p key={s.examId} role="alert" className="text-nx-danger">
              {s.course}: nog {hours(s.minutes)} zonder plek. Begin vroeger, studeer langer per dag of verlaag het aantal uur bij het examen.
            </p>
          ))}
          <ul className="space-y-1 text-xs text-nx-muted">
            {exams.map((e) => (
              <li key={e.id}>
                {e.course}: {hours(plan.perExam[e.id] ?? 0)} gepland
              </li>
            ))}
          </ul>
          <ol className="space-y-3">
            {plan.days.map((d) => (
              <li key={d.day} className="space-y-1">
                <h3 className="font-medium">{dayTitle(d.day)}</h3>
                {d.kind === 'rest' && <p className="text-nx-muted">Rustdag</p>}
                {d.exams.map((e) => (
                  <p key={e.id} className="rounded-md bg-nx-danger/15 px-2 py-1.5 text-nx-danger">
                    {clock(e.at)} Examen {e.course}
                  </p>
                ))}
                {d.kind === 'study' && d.blocks.length === 0 && <p className="text-nx-muted">Vrij</p>}
                <ul className="space-y-1">
                  {d.blocks.map((b) => {
                    const exam = exams.find((e) => e.id === b.examId)
                    const deck = b.kind === 'review' && exam?.deckId ? deckStats(cards, exam.deckId, now) : null
                    return (
                      <li key={b.start} className="flex gap-2 rounded-md bg-nx-surface-2 px-2 py-1.5">
                        <span className="w-24 shrink-0 text-nx-muted tabular-nums">
                          {clock(b.start)}–{clock(b.end)}
                        </span>
                        <span className="min-w-0 flex-1">
                          {b.kind === 'review' ? 'Herhaling' : 'Blok'}: {b.course}
                          {deck && deck.total > 0 && <span className="block text-xs text-nx-muted">Herhaal ook je {deck.total} leerkaarten.</span>}
                        </span>
                      </li>
                    )
                  })}
                </ul>
                {d.spare >= 60 && d.blocks.length > 0 && <p className="text-xs text-nx-muted">Nog {hours(d.spare)} vrij.</p>}
              </li>
            ))}
          </ol>
          {plan.days.some((d) => d.blocks.length > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={primaryButton} onClick={() => void save()}>
                In Agenda zetten
              </button>
              <span className="text-nx-muted">{saved !== null ? `${saved} blokken staan in je Agenda.` : 'Een eerder blokschema wordt vervangen.'}</span>
            </div>
          )}
        </section>
      )}
    </>
  )
}
