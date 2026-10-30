import { useState, useSyncExternalStore } from 'react'
import {
  BRIEFING_CHANNEL_LABELS,
  buildBriefing,
  durationLabel,
  FREE_FROM,
  FREE_TO,
  markDone,
  MIN_FREE_MINUTES,
  overlapsOf,
  PRIORITY_LABELS,
  wallDate,
  type AgendaEntry,
  type Briefing as BriefingData,
  type BriefingPriority,
} from '@nexus/core'
import { briefingInput, briefingSyncProblem, useBriefingState } from '../briefing/store'
import { capturesStore } from '../capture/hub'
import { useConnect } from '../connect/ConnectContext'
import { habitsStore } from '../habits/store'
import { defaultDeadlineEffects } from '../life/alerts'
import { sendDagstartTest } from '../life/dagstart'
import { lifeStore } from '../life/store'
import { useProfiles } from '../profiles/store'
import { remindersStore } from '../reminders/store'
import { openApp } from '../shell/openApp'
import { readStorage, writeStorage } from '../state/storage'
import { examsStore } from '../study/exams'
import { Dagstart } from './Agenda'

const TABS = ['Overzicht', 'Planning', 'Prioriteiten', 'Bezorging', 'Geschiedenis'] as const
type Tab = (typeof TABS)[number]
const TAB_KEY = 'nexus.briefing.tab'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50'
const clock = (t: number) => new Date(t).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })
const longDay = (t: number) => new Date(t).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' })
const when = (t: number) => new Date(t).toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Re-renders when anything the briefing reads changes. */
function useBriefingSources() {
  useProfiles()
  useSyncExternalStore(lifeStore.subscribe, lifeStore.getSnapshot)
  useSyncExternalStore(remindersStore.subscribe, remindersStore.getSnapshot)
  useSyncExternalStore(habitsStore.subscribe, habitsStore.getSnapshot)
  useSyncExternalStore(examsStore.subscribe, examsStore.getSnapshot)
  useSyncExternalStore(capturesStore.subscribe, capturesStore.getSnapshot)
}

/** Dagbriefing (Dagstart 2.0): the day in one view, what comes first, free time and what was sent. */
export function Briefing() {
  useBriefingSources()
  const problem = useSyncExternalStore(briefingSyncProblem.subscribe, briefingSyncProblem.getSnapshot)
  const [tab, setTabState] = useState<Tab>(() => (TABS.includes(readStorage(TAB_KEY) as Tab) ? (readStorage(TAB_KEY) as Tab) : 'Overzicht'))
  const setTab = (t: Tab) => {
    setTabState(t)
    writeStorage(TAB_KEY, t)
  }
  const [tomorrow, setTomorrow] = useState(false)
  // "Opnieuw opbouwen" moves this; the briefing is the same for the same moment.
  const [builtAt, setBuiltAt] = useState(() => Date.now())
  const today = startOfDay(builtAt)
  const day = tomorrow ? startOfDay(today + 27 * 3_600_000) : today
  const briefing = buildBriefing(briefingInput(), day, builtAt)

  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div role="tablist" aria-label="Dagbriefing" className="flex gap-1 overflow-x-auto border-b border-nx-border px-3 py-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`shrink-0 rounded-md px-3 py-1 ${tab === t ? 'bg-nx-surface-2 font-medium' : 'hover:bg-nx-surface-2'}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {problem?.startsWith('setup:') && (
          <p role="alert" className="rounded-md border border-amber-500/40 p-2 text-amber-700 dark:text-amber-300">
            De geschiedenis synct nog niet: voer eenmalig <code>{problem.slice(6)}</code> uit in de SQL Editor van Supabase (of via Account › Database-check).
          </p>
        )}
        {(tab === 'Overzicht' || tab === 'Planning' || tab === 'Prioriteiten') && (
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Dag" className="flex gap-1">
              {[false, true].map((t) => (
                <button key={String(t)} type="button" aria-pressed={tomorrow === t} onClick={() => setTomorrow(t)} className={`${small} ${tomorrow === t ? 'bg-nx-surface-2 font-medium' : ''}`}>
                  {t ? 'Morgen' : 'Vandaag'}
                </button>
              ))}
            </div>
            <button type="button" className={small} onClick={() => setBuiltAt(Date.now())}>
              Opnieuw opbouwen
            </button>
            <span className="text-xs text-nx-muted">Opgebouwd om {clock(builtAt)}</span>
          </div>
        )}
        {tab === 'Overzicht' && <Overview briefing={briefing} onTab={setTab} />}
        {tab === 'Planning' && <Schedule briefing={briefing} />}
        {tab === 'Prioriteiten' && <Priorities briefing={briefing} />}
        {tab === 'Bezorging' && <Dagstart />}
        {tab === 'Geschiedenis' && <History />}
      </div>
    </div>
  )
}

function Overview({ briefing, onTab }: { briefing: BriefingData; onTab: (t: Tab) => void }) {
  const { engine } = useConnect()
  const { state } = useProfiles()
  const [status, setStatus] = useState<string | null>(null)
  const send = async () => {
    setStatus('Versturen…')
    try {
      await sendDagstartTest(defaultDeadlineEffects(engine))
      setStatus(state.dagstart.target === 'phone' ? 'Verstuurd naar dit apparaat en je gsm.' : 'Getoond op dit apparaat.')
    } catch (err) {
      setStatus(`Niet gelukt: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  const top = briefing.priorities.slice(0, 3)
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold first-letter:uppercase">{longDay(briefing.dayStart)}</h2>
        <p className="text-nx-muted">{briefing.headline}</p>
      </div>
      <section aria-label="Eerst" className="space-y-2 rounded-lg border border-nx-border p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium">Eerst</h3>
          {briefing.priorities.length > top.length && (
            <button type="button" className={small} onClick={() => onTab('Prioriteiten')}>
              Alle {briefing.priorities.length}
            </button>
          )}
        </div>
        {top.length === 0 ? <p className="text-nx-muted">Niets dringends. Een goede dag om vooruit te werken.</p> : <PriorityList items={top} label="Eerst" />}
      </section>
      <section aria-label="Vrije blokken" className="space-y-2 rounded-lg border border-nx-border p-3">
        <h3 className="font-medium">Vrije blokken</h3>
        {briefing.free.length === 0 ? (
          <p className="text-nx-muted">
            Geen vrij blok van minstens {MIN_FREE_MINUTES} minuten tussen {FREE_FROM} en {FREE_TO}.
          </p>
        ) : (
          <ul className="space-y-1">
            {briefing.free.map((b) => (
              <li key={b.start} className="flex justify-between gap-2">
                <span>
                  {clock(b.start)}–{clock(b.end)}
                </span>
                <span className="text-nx-muted">{durationLabel(b.minutes)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={button} onClick={() => void send()}>
          Stuur nu
        </button>
        {status && <span className="text-nx-muted">{status}</span>}
      </div>
    </div>
  )
}

const entryLabel = (e: AgendaEntry) => (e.kind === 'deadline' ? 'Deadline' : e.kind === 'appointment' || e.kind === 'event' ? 'Afspraak' : e.kind === 'reminder' ? 'Herinnering' : 'Les')

function Schedule({ briefing }: { briefing: BriefingData }) {
  const clashes = overlapsOf(briefing.schedule.filter((e): e is Extract<AgendaEntry, { end: number }> => 'end' in e))
  if (briefing.schedule.length === 0) return <p className="text-nx-muted">Niets gepland op deze dag.</p>
  return (
    <ul aria-label="Planning" className="divide-y divide-nx-border rounded-lg border border-nx-border">
      {briefing.schedule.map((e, i) => {
        const overlap = 'end' in e ? clashes.get(e as Extract<AgendaEntry, { end: number }>) : undefined
        return (
          <li key={`${e.kind}-${e.at}-${i}`} className="flex gap-3 p-2">
            <span className="w-24 shrink-0 tabular-nums text-nx-muted">
              {clock(e.at)}
              {'end' in e && e.end > e.at ? `–${clock(e.end)}` : ''}
            </span>
            <span className="min-w-0">
              <span className="block">{e.title}</span>
              <span className="block text-xs text-nx-muted">
                {entryLabel(e)}
                {e.detail ? ` · ${e.detail}` : ''}
              </span>
              {overlap && <span className="block text-xs text-amber-700 dark:text-amber-300">Overlapt met {overlap.join(', ')}</span>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function Priorities({ briefing }: { briefing: BriefingData }) {
  if (briefing.priorities.length === 0) return <p className="text-nx-muted">Geen prioriteiten: geen deadlines te laat of op komst, geen examens deze week en je gewoontes zijn gedaan.</p>
  return <PriorityList items={briefing.priorities} label="Prioriteiten" day={briefing.dayStart} />
}

function PriorityList({ items, label, day }: { items: BriefingPriority[]; label: string; day?: number }) {
  const done = (p: BriefingPriority) => {
    const now = Date.now()
    if (p.deadlineId) void lifeStore.updateDeadline(p.deadlineId, { doneAt: now })
    if (p.habitId) {
      const date = wallDate(day ?? now)
      habitsStore.update((s) => ({ ...s, habits: s.habits.map((h) => (h.id === p.habitId ? markDone(h, date, now) : h)) }))
    }
  }
  return (
    <ul aria-label={label} className="space-y-2">
      {items.map((p) => (
        <li key={p.id} className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className={`mr-2 rounded px-1.5 py-0.5 text-xs ${p.kind === 'overdue' ? 'bg-red-500/15 text-red-700 dark:text-red-300' : 'bg-nx-surface-2 text-nx-muted'}`}>{PRIORITY_LABELS[p.kind]}</span>
            {p.title}
            <span className="block text-xs text-nx-muted">{p.detail}</span>
          </span>
          {(p.deadlineId || p.habitId) && (
            <button type="button" className={small} onClick={() => done(p)} aria-label={`${p.title} afvinken`}>
              Klaar
            </button>
          )}
          {p.kind === 'capture' && (
            <button type="button" className={small} onClick={() => openApp('capture')}>
              Openen
            </button>
          )}
          {p.kind === 'exam' && (
            <button type="button" className={small} onClick={() => openApp('study')}>
              Studie
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

function History() {
  const { log } = useBriefingState()
  if (log.length === 0) return <p className="text-nx-muted">Nog geen Dagstart verstuurd. Hij verschijnt hier na de eerste ochtend, of na "Stuur nu".</p>
  return (
    <ul aria-label="Geschiedenis" className="divide-y divide-nx-border rounded-lg border border-nx-border">
      {log.map((l) => (
        <li key={l.id} className="p-2">
          <span className="block">{l.title}</span>
          <span className="block text-xs text-nx-muted">
            {when(l.at)} · {BRIEFING_CHANNEL_LABELS[l.channel]}
            {l.test ? ' · proef' : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}
