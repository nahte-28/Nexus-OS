import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  columnsFor,
  moveWidget,
  resizeBy,
  setSize,
  sizeFromDrag,
  sizeOf,
  spanOn,
  WIDGET_IDS,
  WIDGET_TITLES,
  type WidgetLayout,
  type WidgetSize,
} from '@nexus/core'
import { alive, budgetStatus, gameTimerMinutes, gamingWeek, liveGames, goalProgress, monthOf, nextCalendarEvent, nextLesson, noteTitle, openDeadlines, appointmentsOf, nextOccurrence, upcomingPayments, type AppId, type WidgetId } from '@nexus/core'
import { assistant } from '../ai/runtime'
import { LinkIcon, SparkIcon } from '../apps/icons'
import { useConnect } from '../connect/ConnectContext'
import { ExtensionWidgets } from '../devhub/ExtensionWidgets'
import { setFeature, useFeature } from '../features/store'
import { financeStore } from '../finance/store'
import { useGaming } from '../gaming/store'
import { currentSleepPlan, startGaming, stopGaming } from '../gaming/timer'
import { dismissPrompt, usePrompts } from '../flows/prompts'
import { appName } from '../flows/runner'
import { lifeStore } from '../life/store'
import { installUpdate, useUpdate } from '../platform/update'
import { remindersStore } from '../reminders/store'
import { useNotes } from '../state/useNotes'
import { profilesStore, useProfiles } from './store'
import { PROFILE_ICONS, reasonText } from './ui'

type OpenApp = (id: AppId) => void

const STUDY_PROMPTS = ['Maak een studieplanning voor mijn deadlines', 'Overhoor me over mijn laatste notitie']

/** Re-renders every minute, so "next class" and greetings stay current. */
function useMinute(): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  return now
}

function greeting(now: number): string {
  const h = new Date(now).getHours()
  return h < 6 ? 'Goedenacht' : h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond'
}

/** The home screen of the active profile: status, then its widgets. */
export function Dashboard({ onOpenApp, compact = false }: { onOpenApp: OpenApp; compact?: boolean }) {
  const { state, active, reason } = useProfiles()
  const now = useMinute()
  const Icon = PROFILE_ICONS[active.id]
  const devHub = useFeature('devHub')
  const marketplace = useFeature('marketplace')
  return (
    <section aria-label="Dashboard" className={`mx-auto w-full max-w-5xl space-y-4 ${compact ? 'p-4' : 'p-6'}`}>
      <header className="space-y-1">
        <h1 className={`${compact ? 'text-xl' : 'text-3xl'} font-semibold`}>
          {active.id === 'school' ? 'School Workspace' : `${greeting(now)}`}
        </h1>
        <p className="text-nx-muted">
          {new Date(now).toLocaleDateString('nl-BE', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>
      </header>

      <FlowPrompts onOpenApp={onOpenApp} />

      <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold tracking-wide text-nx-accent uppercase">{active.name} Mode</p>
              <p className="flex items-center gap-2 text-lg font-semibold">
                <Icon className="size-5 text-nx-accent" />
                {active.description}
              </p>
              <p className="text-sm text-nx-muted">{reasonText(reason, state)}</p>
            </div>
            <span className="rounded-md bg-nx-accent px-2.5 py-1 text-xs font-semibold text-nx-accent-text">ACTIEF</span>
          </div>
          <div className="mt-3 border-t border-nx-border pt-3">
            <button type="button" className={linkButton} onClick={() => onOpenApp('profiles')}>
              Profiel wisselen in Profielen
            </button>
          </div>
        </Card>
        {active.widgets.includes('next_class') ? <NextClass now={now} onOpenApp={onOpenApp} /> : <Upcoming onOpenApp={onOpenApp} />}
      </div>

      <WidgetGrid compact={compact} onOpenApp={onOpenApp} />

      {(devHub || marketplace) && <ExtensionWidgets />}
    </section>
  )
}

/** Suggestions from Flow Studio: nothing opens or installs until you choose it here. */
function FlowPrompts({ onOpenApp }: { onOpenApp: OpenApp }) {
  const prompts = usePrompts()
  const update = useUpdate()
  if (prompts.length === 0) return null
  return (
    <ul aria-label="Voorstellen" className="space-y-2">
      {prompts.map((p) => {
        const isUpdate = p.kind === 'update'
        if (isUpdate && update.status !== 'available') return null
        return (
          <li key={p.id} className="nx-glass flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-nx-accent p-3 text-sm">
            <span>
              <span className="font-medium">{p.flowName}</span> stelt voor:{' '}
              {isUpdate && update.status === 'available' ? `versie ${update.update.version} installeren` : `${appName(p.app ?? '')} openen`}
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                className="rounded-lg bg-nx-accent px-3 py-1.5 font-medium text-nx-accent-text"
                onClick={() => {
                  dismissPrompt(p.id)
                  if (isUpdate) void installUpdate()
                  else if (p.app) onOpenApp(p.app)
                }}
              >
                {isUpdate ? 'Installeren' : 'Openen'}
              </button>
              <button type="button" className="rounded-lg border border-nx-border px-3 py-1.5" onClick={() => dismissPrompt(p.id)}>
                Niet nu
              </button>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function Card({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div className="nx-glass h-full rounded-2xl border border-nx-border p-4">
      {title && <h2 className="mb-2 text-xs font-semibold tracking-wide text-nx-muted uppercase">{title}</h2>}
      {children}
    </div>
  )
}

const linkButton = 'text-sm font-medium text-nx-accent hover:underline'

/** The widgets in the grid: next_class (and deadlines without it) sit in the top row. */
const inGrid = (widgets: WidgetId[]) => widgets.filter((w) => w !== 'next_class' && !(w === 'deadlines' && !widgets.includes('next_class')))

/** Columns of the grid at the current window width, as the CSS breakpoints. */
function useColumns(): number {
  const read = () => (typeof window === 'undefined' ? 3 : columnsFor(window.innerWidth))
  const [cols, setCols] = useState(read)
  useEffect(() => {
    const on = () => setCols(read())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return cols
}

const ROW = 'minmax(9rem, auto)'
const small = 'rounded-md border border-nx-border bg-nx-surface px-2 py-0.5 text-xs hover:bg-nx-surface-2 disabled:opacity-40'

/**
 * Workspace Studio 2.0: the dashboard grid of the active profile. In "Indeling aanpassen" you
 * drag widgets to another place, drag the corner (or use the buttons) to make them wider or
 * higher, add and hide widgets, and see how it looks on a phone.
 */
function WidgetGrid({ compact, onOpenApp }: { compact: boolean; onOpenApp: OpenApp }) {
  const { active } = useProfiles()
  const screenCols = useColumns()
  const [editing, setEditing] = useState(false)
  const [preview, setPreview] = useState<'pc' | 'gsm'>('pc')
  const [dragging, setDragging] = useState<WidgetId | null>(null)
  const shown = inGrid(active.widgets)
  const layout = active.layout ?? {}
  const cols = editing && preview === 'gsm' ? 1 : compact ? 1 : screenCols
  const save = (patch: { widgets?: WidgetId[]; layout?: WidgetLayout }) => profilesStore.updateProfile(active.id, patch)
  const move = (id: WidgetId, to: number) => save({ widgets: moveWidget(active.widgets, shown, id, to) })
  const hidden = WIDGET_IDS.filter((w) => !active.widgets.includes(w) && (w !== 'klashub' || active.apps.includes('klashub')))

  const grid = (
    <ul
      aria-label="Widgets"
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: ROW, gridAutoFlow: 'row dense' }}
    >
      {shown.map((w, i) => {
        const size = sizeOf(layout, w)
        return (
          <li
            key={w}
            style={{ gridColumn: `span ${spanOn(size, cols)}`, gridRow: `span ${size.h}` }}
            className={`relative min-w-0 ${editing ? 'rounded-2xl outline-2 outline-dashed outline-nx-accent/60' : ''} ${dragging === w ? 'opacity-50' : ''}`}
            draggable={editing}
            onDragStart={(e) => {
              setDragging(w)
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', w)
            }}
            onDragEnd={() => setDragging(null)}
            onDragOver={(e) => editing && dragging && e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              if (dragging && dragging !== w) move(dragging, i)
              setDragging(null)
            }}
          >
            <div className={editing ? 'pointer-events-none h-full select-none' : 'h-full'} aria-hidden={editing || undefined}>
              <Widget id={w} onOpenApp={onOpenApp} />
            </div>
            {editing && (
              <EditFrame
                id={w}
                size={size}
                index={i}
                count={shown.length}
                onMove={(to) => move(w, to)}
                onSize={(next) => save({ layout: setSize(layout, w, next) })}
                onResize={(dw, dh) => save({ layout: resizeBy(layout, w, dw, dh) })}
                onHide={() => save({ widgets: active.widgets.filter((x) => x !== w) })}
              />
            )}
          </li>
        )
      })}
    </ul>
  )

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
          {editing && (
            <div role="radiogroup" aria-label="Voorbeeld" className="flex gap-1">
              {(['pc', 'gsm'] as const).map((p) => (
                <button key={p} type="button" role="radio" aria-checked={preview === p} onClick={() => setPreview(p)} className={`${small} ${preview === p ? 'font-semibold' : ''}`}>
                  {p === 'pc' ? 'Pc' : 'Gsm'}
                </button>
              ))}
            </div>
          )}
          <button type="button" className={small} aria-pressed={editing} onClick={() => (setEditing(!editing), setPreview('pc'))}>
            {editing ? 'Klaar' : 'Indeling aanpassen'}
          </button>
        </div>
      )}
      {editing && (
        <div className="space-y-2 rounded-2xl border border-nx-border p-3 text-sm">
          <p className="text-nx-muted">
            Sleep een widget naar een andere plek, of sleep de hoek rechtsonder om hem breder of hoger te maken. Dit geldt voor het profiel {active.name} en gaat mee naar je andere apparaten.
          </p>
          {hidden.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-nx-muted">Toevoegen:</span>
              {hidden.map((w) => (
                <button key={w} type="button" className={small} onClick={() => save({ widgets: [...active.widgets, w] })}>
                  + {WIDGET_TITLES[w]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {editing && preview === 'gsm' ? (
        <div aria-label="Voorbeeld op de gsm" className="mx-auto w-[390px] max-w-full rounded-[2rem] border-4 border-nx-border p-3">
          {grid}
        </div>
      ) : (
        grid
      )}
    </div>
  )
}

function EditFrame({
  id,
  size,
  index,
  count,
  onMove,
  onSize,
  onResize,
  onHide,
}: {
  id: WidgetId
  size: WidgetSize
  index: number
  count: number
  onMove: (to: number) => void
  onSize: (size: WidgetSize) => void
  onResize: (dw: number, dh: number) => void
  onHide: () => void
}) {
  const title = WIDGET_TITLES[id]
  const frame = useRef<HTMLDivElement>(null)
  const [live, setLive] = useState<WidgetSize | null>(null)
  return (
    <div ref={frame} className="absolute inset-0 flex flex-col justify-between p-2" role="group" aria-label={`${title} indelen`}>
      <div className="flex flex-wrap items-center gap-1">
        <span className="cursor-grab rounded-md bg-nx-accent px-2 py-0.5 text-xs font-medium text-nx-accent-text" aria-hidden>
          ⠿ {title}
        </span>
        <span className="text-xs text-nx-muted">
          {(live ?? size).w}×{(live ?? size).h}
        </span>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-1">
        <div className="flex flex-wrap gap-1">
          <button type="button" className={small} disabled={index === 0} aria-label={`${title} naar voren`} onClick={() => onMove(index - 1)}>
            ←
          </button>
          <button type="button" className={small} disabled={index === count - 1} aria-label={`${title} naar achteren`} onClick={() => onMove(index + 1)}>
            →
          </button>
          <button type="button" className={small} disabled={size.w === 1} aria-label={`${title} smaller`} onClick={() => onResize(-1, 0)}>
            −↔
          </button>
          <button type="button" className={small} disabled={size.w === 3} aria-label={`${title} breder`} onClick={() => onResize(1, 0)}>
            +↔
          </button>
          <button type="button" className={small} disabled={size.h === 1} aria-label={`${title} lager`} onClick={() => onResize(0, -1)}>
            −↕
          </button>
          <button type="button" className={small} disabled={size.h === 2} aria-label={`${title} hoger`} onClick={() => onResize(0, 1)}>
            +↕
          </button>
          <button type="button" className={small} aria-label={`${title} verbergen`} onClick={onHide}>
            Verbergen
          </button>
        </div>
        <span
          aria-hidden
          title="Sleep om de grootte te veranderen"
          className="size-5 cursor-nwse-resize touch-none rounded-br-xl border-r-4 border-b-4 border-nx-accent"
          onPointerDown={(e) => {
            const box = frame.current?.getBoundingClientRect()
            if (!box) return
            e.preventDefault()
            const start = { x: e.clientX, y: e.clientY }
            const cell = { width: box.width / size.w, height: box.height / size.h }
            let last = size
            const onMovePointer = (ev: PointerEvent) => {
              last = sizeFromDrag(size, ev.clientX - start.x, ev.clientY - start.y, cell)
              setLive(last)
            }
            const onUp = () => {
              window.removeEventListener('pointermove', onMovePointer)
              window.removeEventListener('pointerup', onUp)
              setLive(null)
              if (last.w !== size.w || last.h !== size.h) onSize(last)
            }
            window.addEventListener('pointermove', onMovePointer)
            window.addEventListener('pointerup', onUp)
          }}
        />
      </div>
    </div>
  )
}

function Widget({ id, onOpenApp }: { id: WidgetId; onOpenApp: OpenApp }) {
  switch (id) {
    case 'deadlines':
      return <Upcoming onOpenApp={onOpenApp} />
    case 'notes':
      return <RecentNotes onOpenApp={onOpenApp} />
    case 'ai_study':
      return <AiStudy onOpenApp={onOpenApp} />
    case 'klashub':
      return <KlasHub onOpenApp={onOpenApp} />
    case 'notifications':
      return <Notifications onOpenApp={onOpenApp} />
    case 'devices':
      return <DevicesWidget onOpenApp={onOpenApp} />
    case 'finance':
      return <FinanceWidget onOpenApp={onOpenApp} />
    case 'gaming':
      return <GamingWidget onOpenApp={onOpenApp} />
    case 'next_class':
      return null
  }
}

function dayWord(at: number, now: number): string {
  const day = (t: number) => new Date(t).toDateString()
  if (day(at) === day(now)) return 'Vandaag'
  if (day(at) === day(now + 86_400_000)) return 'Morgen'
  const word = new Date(at).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'short' })
  return word.charAt(0).toUpperCase() + word.slice(1)
}

const clock = (t: number) => new Date(t).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })

function NextClass({ now, onOpenApp }: { now: number; onOpenApp: OpenApp }) {
  const { state } = useProfiles()
  // Lessons from the school calendar win over the ones typed in by hand.
  const event = nextCalendarEvent(state.calendarEvents, now)
  if (event) {
    return (
      <Card title={event.start <= now ? 'Nu bezig' : 'Volgende les'}>
        <p className="text-lg font-semibold">{event.subject}</p>
        <p className="text-sm text-nx-accent tabular-nums">
          {dayWord(event.start, now)} {clock(event.start)}–{clock(event.end)}
          {event.room ? ` · ${event.room}` : ''}
        </p>
      </Card>
    )
  }
  const next = nextLesson(state.lessons, now, state.schedule.timeZone)
  if (!next) {
    return (
      <Card title="Volgende les">
        <p className="text-sm text-nx-muted">Nog geen lesrooster.</p>
        <button type="button" className={linkButton} onClick={() => onOpenApp('profiles')}>
          Lesrooster invullen
        </button>
      </Card>
    )
  }
  const { lesson, inDays } = next
  const when =
    inDays === 0
      ? 'Vandaag'
      : inDays === 1
        ? 'Morgen'
        : ['', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'][lesson.day]
  return (
    <Card title="Volgende les">
      <p className="text-lg font-semibold">{lesson.subject}</p>
      <p className="text-sm text-nx-accent tabular-nums">
        {when} {lesson.start}–{lesson.end}
        {lesson.room ? ` · ${lesson.room}` : ''}
      </p>
    </Card>
  )
}

function Upcoming({ onOpenApp }: { onOpenApp: OpenApp }) {
  const reminders = useSyncExternalStore(remindersStore.subscribe, remindersStore.getSnapshot)
  const life = useSyncExternalStore(lifeStore.subscribe, lifeStore.getSnapshot)
  const now = Date.now()
  // Open deadlines (overdue ones too), coming appointments and reminders together, soonest first.
  const items = [
    ...openDeadlines(life).map((d) => ({ id: d.id, title: d.title, at: d.dueAt, deadline: true })),
    ...appointmentsOf(life).flatMap((a) => {
      const next = nextOccurrence(a, now)
      return next ? [{ id: a.id, title: `📅 ${a.title}`, at: next.startAt, deadline: false }] : []
    }),
    ...reminders.map((r) => ({ id: r.id, title: r.title, at: r.at, deadline: false })),
  ].sort((a, b) => a.at - b.at)
  return (
    <Card title="Deadlines en afspraken">
      {items.length === 0 ? (
        <p className="text-sm text-nx-muted">Niets gepland.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {items.slice(0, 5).map((r) => (
            <li key={r.id} className="flex justify-between gap-2">
              <span className="truncate">
                {r.deadline ? '📌 ' : ''}
                {r.title}
              </span>
              <span className={`shrink-0 tabular-nums ${r.deadline && r.at < now ? 'text-red-500' : 'text-nx-muted'}`}>
                {r.deadline && r.at < now
                  ? 'te laat'
                  : new Date(r.at).toLocaleString('nl-BE', {
                      weekday: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
              </span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className={`${linkButton} mt-2`} onClick={() => onOpenApp('agenda')}>
        Agenda openen
      </button>
    </Card>
  )
}

function RecentNotes({ onOpenApp }: { onOpenApp: OpenApp }) {
  const { notes } = useNotes()
  return (
    <Card title="Notities">
      {notes.length === 0 ? (
        <p className="text-sm text-nx-muted">Nog geen notities.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {notes.slice(0, 3).map((n) => (
            <li key={n.id} className="truncate">
              {noteTitle(n)}
            </li>
          ))}
        </ul>
      )}
      <button type="button" className={`${linkButton} mt-2`} onClick={() => onOpenApp('notes')}>
        Notities openen
      </button>
    </Card>
  )
}

/** Financiën at a glance, in percentages and counts only: no amounts on a screen others may see. */
const playTime = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} u${m % 60 ? ` ${m % 60}` : ''}`)

/** Gaming: the session timer, this week's play time against the plan and tonight's stop time. */
function GamingWidget({ onOpenApp }: { onOpenApp: OpenApp }) {
  const on = useFeature('gaming')
  const state = useGaming()
  const [now, setNow] = useState(Date.now)
  const [picked, setPicked] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  if (!on) {
    return (
      <Card title="Gaming">
        <p className="text-sm text-nx-muted">Zet Gaming Companion aan voor de sessie-timer en je speeltijd.</p>
        <button type="button" className={`${linkButton} mt-2`} onClick={() => setFeature('gaming', true)}>
          Gaming Companion aanzetten
        </button>
      </Card>
    )
  }
  const games = liveGames(state).filter((g) => g.status === 'playing' || g.status === 'backlog')
  const game = state.active ? state.games.find((g) => g.id === state.active?.gameId) : null
  const week = gamingWeek(state, now)
  const plan = currentSleepPlan(now)
  const choice = picked || games[0]?.id || ''
  return (
    <Card title="Gaming">
      {state.active ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="min-w-0 flex-1 truncate">
            🎮 {game?.name ?? 'Game'} · <span className="tabular-nums">{playTime(gameTimerMinutes(state, now))}</span>
          </span>
          <button type="button" className="rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2" onClick={() => stopGaming()}>
            Stoppen
          </button>
        </div>
      ) : games.length === 0 ? (
        <button type="button" className={linkButton} onClick={() => onOpenApp('gaming')}>
          Voeg eerst een game toe
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select aria-label="Game voor de timer" value={choice} onChange={(e) => setPicked(e.target.value)} className="min-w-0 flex-1 rounded-md border border-nx-border bg-nx-surface px-2 py-1">
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <button type="button" className="rounded-md bg-nx-accent px-2 py-1 text-xs font-medium text-nx-accent-text" onClick={() => setProblem(startGaming(choice))}>
            Gaming starten
          </button>
        </div>
      )}
      {problem && <p role="alert" className="text-xs text-red-500">{problem}</p>}
      <p className={`mt-2 text-sm ${week.over ? 'text-red-500' : week.near ? 'text-amber-600 dark:text-amber-400' : 'text-nx-muted'}`}>
        Deze week {playTime(week.minutes)}
        {week.limit !== null ? ` van ${playTime(week.limit)}` : ''}
      </p>
      {plan && <p className="text-sm text-nx-muted">Vanavond stoppen om {clock(plan.stopAt)} (les om {clock(plan.firstLesson.start)})</p>}
    </Card>
  )
}

function FinanceWidget({ onOpenApp }: { onOpenApp: OpenApp }) {
  const state = useSyncExternalStore(financeStore.subscribe, financeStore.getSnapshot)
  const now = Date.now()
  const budget = budgetStatus(state, monthOf(now), now)[0]
  const soon = upcomingPayments(state, now, 7).length
  const goal = alive(state.goals)
    .map((g) => goalProgress(state, g, now))
    .filter((g) => g.left > 0)
    .sort((a, b) => b.percent - a.percent)[0]
  return (
    <Card title="Financiën">
      <ul className="space-y-1 text-sm">
        <li>{budget ? `${budget.label}: ${budget.used}% gebruikt deze maand` : 'Nog geen budget ingesteld.'}</li>
        {soon > 0 && <li>{soon === 1 ? '1 betaling' : `${soon} betalingen`} in de komende 7 dagen</li>}
        {goal && (
          <li>
            {goal.goal.name}: {goal.percent}% gespaard
          </li>
        )}
      </ul>
      <button type="button" className={`${linkButton} mt-2`} onClick={() => onOpenApp('finance')}>
        Financiën openen
      </button>
    </Card>
  )
}

function AiStudy({ onOpenApp }: { onOpenApp: OpenApp }) {
  return (
    <Card title="AI Study">
      <p className="mb-2 flex items-center gap-2 text-sm">
        <SparkIcon className="size-4 text-nx-accent" /> Studeer slimmer met NEXUS AI.
      </p>
      <div className="flex flex-col items-start gap-1">
        {STUDY_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className={`${linkButton} text-left`}
            onClick={() => {
              onOpenApp('assistant')
              void assistant.send(prompt)
            }}
          >
            {prompt}
          </button>
        ))}
      </div>
    </Card>
  )
}

function KlasHub({ onOpenApp }: { onOpenApp: OpenApp }) {
  return (
    <Card title="KlasHub">
      <p className="mb-2 text-sm text-nx-muted">Oefenvragen, samenvattingen en deadlines van je klas.</p>
      <button type="button" className={`${linkButton} inline-flex items-center gap-1`} onClick={() => onOpenApp('klashub')}>
        <LinkIcon className="size-4" /> KlasHub openen
      </button>
    </Card>
  )
}

function Notifications({ onOpenApp }: { onOpenApp: OpenApp }) {
  const { state } = useConnect()
  return (
    <Card title="Meldingen">
      <p className="text-sm">{state.unread > 0 ? `${state.unread} nieuwe melding(en)` : 'Geen nieuwe meldingen.'}</p>
      <ul className="mt-1 space-y-1 text-sm text-nx-muted">
        {state.inbox.slice(0, 3).map((i) => (
          <li key={i.id} className="truncate">
            {i.appName}: {i.title}
          </li>
        ))}
      </ul>
      <button type="button" className={`${linkButton} mt-2`} onClick={() => onOpenApp('notifications')}>
        Meldingen openen
      </button>
    </Card>
  )
}

function DevicesWidget({ onOpenApp }: { onOpenApp: OpenApp }) {
  const { state } = useConnect()
  const linked = state.devices.filter((d) => !d.revokedAt).length
  return (
    <Card title="Apparaten">
      <p className="text-sm">
        {state.status === 'ready' ? `NEXUS Connect is verbonden · ${linked} gekoppeld` : 'NEXUS Connect is niet verbonden.'}
      </p>
      <button type="button" className={`${linkButton} mt-2`} onClick={() => onOpenApp('devices')}>
        Apparaten openen
      </button>
    </Card>
  )
}
