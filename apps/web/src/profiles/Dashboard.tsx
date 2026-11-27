import { useMinute } from '../state/useNow'
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import {
  activeHabits,
  agendaDay,
  calendarSources,
  linkedEvents,
  type AgendaEntry,
  columnsFor,
  dayTimeline,
  type TimedEntry,
  fillGaps,
  isDone,
  isDue,
  MAX_COLUMNS,
  MAX_ROWS,
  moveWidget,
  packWidgets,
  rowsOf,
  setSize,
  sizeFromDrag,
  sizeOf,
  toggleDone,
  WIDGET_IDS,
  WIDGET_TITLES,
  defaultDashboard,
  hideWidgetOn,
  showWidgetOn,
  widgetsOnDevice,
  type Profile,
  widgetTier,
  type WidgetTier,
  type WidgetSize,
} from '@nexus/core'
import { WIDGET_APP, alive, appOn, budgetStatus, widgetsOn, gameTimerMinutes, gamingWeek, liveGames, goalProgress, monthOf, nextCalendarEvent, nextLesson, noteTitle, openDeadlines, appointmentsOf, nextOccurrence, upcomingPayments, needsAbout, type AppId, type WidgetId } from '@nexus/core'
import { assistant } from '../ai/runtime'
import { LinkIcon, SparkIcon } from '../apps/icons'
import { useConnect } from '../connect/ConnectContext'
import { ExtensionWidgets } from '../devhub/ExtensionWidgets'
import { setFeature, useAppSwitches, useFeature } from '../features/store'
import { financeStore } from '../finance/store'
import { useVisibleApps } from '../apps/registry'
import { habitsStore } from '../habits/store'
import { useGaming } from '../gaming/store'
import { currentSleepPlan, startGaming, stopGaming } from '../gaming/timer'
import { dismissPrompt, usePrompts } from '../flows/prompts'
import { appName } from '../flows/runner'
import { lifeStore } from '../life/store'
import { installUpdate, useUpdate } from '../platform/update'
import { remindersStore } from '../reminders/store'
import { notesStore } from '../state/notesStore'
import { useNotes } from '../state/useNotes'
import { profilesStore, useProfiles } from './store'
import { AboutMe } from './AboutMe'
import { PROFILE_ICONS, reasonText } from './ui'

type OpenApp = (id: AppId) => void

const STUDY_PROMPTS = ['Maak een studieplanning voor mijn deadlines', 'Overhoor me over mijn laatste notitie']

/** Re-renders every minute, so "next class" and greetings stay current. */
function greeting(now: number): string {
  const h = new Date(now).getHours()
  return h < 6 ? 'Goedenacht' : h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond'
}

/**
 * The home screen of the active profile (Dashboard 2.0): one calm row on top (greeting, date and
 * profile, your apps, Indeling aanpassen), then anything waiting for an answer, then the widgets,
 * so what you need today is visible without scrolling.
 */
/** shortcuts: je apps, rechts in de bovenste rij. */
export function Dashboard({ onOpenApp, compact = false, shortcuts = null }: { onOpenApp: OpenApp; compact?: boolean; shortcuts?: ReactNode }) {
  const { state, active } = useProfiles()
  const now = useMinute()
  const devHub = useFeature('devHub')
  const marketplace = useFeature('marketplace')
  const [editing, setEditing] = useState(false)
  const date = new Date(now).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <section aria-label="Dashboard" className={`flex w-full flex-col ${compact ? 'mx-auto max-w-5xl gap-3 p-4' : 'min-h-full gap-4 px-6 pt-5 pb-6 2xl:px-8'}`}>
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className={`${compact ? 'text-xl' : 'text-[26px] leading-tight'} font-semibold tracking-tight`}>
            {greeting(now)}
            {state.about.name ? `, ${state.about.name}` : ''}
          </h1>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-nx-muted">
            <span className="first-letter:uppercase">{date}</span>
            <span aria-hidden>·</span>
            <span>Profiel {active.name}</span>
          </p>
        </div>
        {!compact && (
          <div className="flex flex-wrap items-center gap-3">
            {shortcuts}
            <button
              type="button"
              aria-pressed={editing}
              onClick={() => setEditing(!editing)}
              className={`flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium ${editing ? 'bg-nx-accent text-nx-accent-text' : 'nx-tile-quiet border border-nx-border hover:bg-nx-surface-2'}`}
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                {editing ? <path d="M5 12l5 5L20 7" /> : <path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" />}
              </svg>
              {editing ? 'Klaar' : 'Indeling aanpassen'}
            </button>
          </div>
        )}
      </header>

      <Welcome />

      <FlowPrompts onOpenApp={onOpenApp} />

      <WidgetGrid compact={compact} editing={editing} now={now} onOpenApp={onOpenApp} />

      {(devHub || marketplace) && <ExtensionWidgets />}
    </section>
  )
}

/** A line that waits for an answer above the widgets: one look for Welkom and Flow-voorstellen, with the copper trace on the left. */
const notice = 'nx-tile-quiet flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-nx-border px-4 py-2 text-sm shadow-[inset_3px_0_0_var(--nx-accent)]'

/** Suggestions from Flow Studio: nothing opens or installs until you choose it here. */
function FlowPrompts({ onOpenApp }: { onOpenApp: OpenApp }) {
  const prompts = usePrompts()
  const update = useUpdate()
  if (prompts.length === 0) return null
  return (
    <ul aria-label="Voorstellen" className="space-y-1.5">
      {prompts.map((p) => {
        const isUpdate = p.kind === 'update'
        if (isUpdate && update.status !== 'available') return null
        return (
          <li key={p.id} className={notice}>
            <span>
              <span className="font-medium">{p.flowName}</span> stelt voor:{' '}
              {isUpdate && update.status === 'available' ? `versie ${update.update.version} installeren` : `${appName(p.app ?? '')} openen`}
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                className="rounded-md bg-nx-accent px-3 py-1 font-medium text-nx-accent-text"
                onClick={() => {
                  dismissPrompt(p.id)
                  if (isUpdate) void installUpdate()
                  else if (p.app) onOpenApp(p.app)
                }}
              >
                {isUpdate ? 'Installeren' : 'Openen'}
              </button>
              <button type="button" className="rounded-md border border-nx-border px-3 py-1 hover:bg-nx-surface-2" onClick={() => dismissPrompt(p.id)}>
                Niet nu
              </button>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

const WELCOME_KEY = 'nexus.about.later'

/** On a fresh NEXUS: asks who you are, so the first profile fits (School or Werk). Stays until Opslaan or Later. */
function Welcome() {
  const { state } = useProfiles()
  const [open, setOpen] = useState(() => {
    try {
      return needsAbout(state) && localStorage.getItem(WELCOME_KEY) === null
    } catch {
      return needsAbout(state)
    }
  })
  const [expanded, setExpanded] = useState(false)
  if (!open) return null
  const close = () => {
    try {
      localStorage.setItem(WELCOME_KEY, '1')
    } catch {
      // Private window: the card comes back next time.
    }
    setOpen(false)
  }
  if (!expanded) {
    return (
      <section aria-label="Welkom" className={notice}>
        <p>Vertel NEXUS hoe je heet en wat je doet, dan past je dashboard zich aan.</p>
        <span className="flex gap-4">
          <button type="button" className={linkButton} onClick={() => setExpanded(true)}>
            Over jou invullen
          </button>
          <button type="button" className="text-sm text-nx-muted hover:underline" onClick={close}>
            Later
          </button>
        </span>
      </section>
    )
  }
  return (
    <section aria-label="Welkom" className="nx-glass space-y-3 rounded-xl border border-nx-border p-4 shadow-[inset_3px_0_0_var(--nx-accent)]">
      <h2 className="text-lg font-semibold">Welkom bij NEXUS</h2>
      <p className="text-sm text-nx-muted">Vertel kort wie je bent, dan past NEXUS zich aan. Je kan dit later aanpassen in Account.</p>
      <AboutMe />
      <div className="flex gap-2">
        <button type="button" className="rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text" onClick={close}>
          Opslaan
        </button>
        <button type="button" className="rounded-lg border border-nx-border px-3 py-1.5 text-sm" onClick={close}>
          Later
        </button>
      </div>
    </section>
  )
}

/** Dashboard 2.0: whether the widget being drawn is a main one or a calm side tile. */
const TierContext = createContext<WidgetTier>('side')

/** The look of a widget tile: main ones stand on the board, side ones lie flat and quiet. */
const tileClass = (tier: WidgetTier) => (tier === 'main' ? 'nx-glass border-nx-border' : 'nx-tile-quiet border-nx-border')

/** The title of a widget; on a main widget with the copper solder dot in front. */
function WidgetTitle({ children, tier }: { children: ReactNode; tier: WidgetTier }) {
  return (
    <h2 className={`flex items-center gap-2 text-[13px] font-semibold ${tier === 'main' ? 'text-nx-text' : 'text-nx-muted'}`}>
      {tier === 'main' && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-nx-accent" />}
      {children}
    </h2>
  )
}

function Card({ children, title }: { children: ReactNode; title?: string }) {
  const tier = useContext(TierContext)
  return (
    <div className={`${tileClass(tier)} h-full overflow-hidden rounded-xl border p-4`}>
      {title && (
        <div className="mb-2">
          <WidgetTitle tier={tier}>{title}</WidgetTitle>
        </div>
      )}
      {children}
    </div>
  )
}

const linkButton = 'text-sm font-medium text-nx-accent hover:underline'

/** The width of an element in pixels, kept up to date; null until it is measured. */
function useWidth(ref: RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => setWidth(el.getBoundingClientRect().width || null)
    read()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', read)
      return () => window.removeEventListener('resize', read)
    }
    const observer = new ResizeObserver(read)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return width
}

const FILL_KEY = 'nexus.dashboard.fill'

/** Whether widgets stretch into empty cells (on by default); a choice of this device. */
function useFillGaps(): [boolean, (on: boolean) => void] {
  const [fill, setFill] = useState(() => {
    try {
      return localStorage.getItem(FILL_KEY) !== 'off'
    } catch {
      return true
    }
  })
  const change = (on: boolean) => {
    try {
      localStorage.setItem(FILL_KEY, on ? 'on' : 'off')
    } catch {
      // Private window: only for now.
    }
    setFill(on)
  }
  return [fill, change]
}

const ROW_MIN = '9rem'
const ROW_MIN_PX = 144
/** Rows grow with the screen up to this height; more room than that is for more widgets. */
const ROW_MAX_PX = 380
const GAP_PX = 12

/** The nearest parent that scrolls: the desktop behind the windows. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY
    if (y === 'auto' || y === 'scroll') return p
  }
  return null
}

/** The height from the top of [ref] to the bottom of the visible desktop, kept up to date. */
function useRoomBelow(ref: RefObject<HTMLElement | null>, deps: unknown[]): number | null {
  const [room, setRoom] = useState<number | null>(null)
  useEffect(() => {
    const el = ref.current
    const parent = el && scrollParent(el)
    if (!el || !parent) return
    const read = () => {
      const top = el.getBoundingClientRect().top - parent.getBoundingClientRect().top + parent.scrollTop
      setRoom(parent.clientHeight - top - 24)
    }
    read()
    window.addEventListener('resize', read)
    return () => window.removeEventListener('resize', read)
  }, [ref, ...deps])
  return room
}
const small = 'rounded-md border border-nx-border bg-nx-surface px-2 py-0.5 text-xs hover:bg-nx-surface-2 disabled:opacity-40'

/**
 * Workspace Studio 2.0: the dashboard grid of the active profile. It has more columns on a bigger
 * screen and fills the height of the screen; widgets stretch into empty cells. In "Indeling
 * aanpassen" you drag widgets to another place, drag the corner (or use the buttons) to make them
 * wider or higher, add and hide widgets, and see how it looks on a phone.
 */
function WidgetGrid({ compact, editing, now, onOpenApp }: { compact: boolean; editing: boolean; now: number; onOpenApp: OpenApp }) {
  const { state, active } = useProfiles()
  const box = useRef<HTMLDivElement>(null)
  const width = useWidth(box)
  const [preview, setPreview] = useState<'pc' | 'gsm'>('pc')
  const [fill, setFill] = useFillGaps()
  const [dragging, setDragging] = useState<WidgetId | null>(null)
  const [over, setOver] = useState<WidgetId | null>(null)
  const appSwitches = useAppSwitches()
  useEffect(() => {
    if (!editing) setPreview('pc')
  }, [editing])
  // A widget goes with its app: switched off in Apps aan/uit, it is not on the dashboard either.
  const layout = active.layout ?? {}
  const phone = compact || (editing && preview === 'gsm')
  // The phone and the computer can each hide widgets the other one shows.
  const device = phone ? 'phone' : 'pc'
  const onDevice = widgetsOnDevice(active, device)
  const shown = widgetsOn(onDevice, appSwitches)
  const cols = phone ? 1 : columnsFor(width ?? (typeof window === 'undefined' ? 1200 : window.innerWidth))
  const packed = packWidgets(
    shown.map((id) => ({ id, size: sizeOf(layout, id, active.id) })),
    cols,
  )
  const placements = fill && cols > 1 ? fillGaps(packed, cols) : packed
  const rows = rowsOf(placements)
  const list = useRef<HTMLUListElement>(null)
  const room = useRoomBelow(list, [editing, preview, rows, width])
  // On a computer the rows share the height of the screen, so the dashboard fills it.
  const rowHeight = room === null ? null : Math.round(Math.min(ROW_MAX_PX, Math.max(ROW_MIN_PX, (room - GAP_PX * (rows - 1)) / Math.max(1, rows))))
  const save = (patch: Partial<Pick<Profile, 'widgets' | 'layout' | 'hiddenOn'>>) => profilesStore.updateProfile(active.id, patch)
  const move = (id: WidgetId, to: number) => save({ widgets: moveWidget(active.widgets, shown, id, to) })
  const [undo, setUndo] = useState<Pick<Profile, 'widgets' | 'layout' | 'hiddenOn'> | null>(null)
  useEffect(() => setUndo(null), [editing, active.id])
  const standard = defaultDashboard(state, active.id)
  const isStandard =
    standard.widgets.join() === active.widgets.join() && Object.keys(layout).length === 0 && !active.hiddenOn?.pc?.length && !active.hiddenOn?.phone?.length
  const hidden = WIDGET_IDS.filter((w) => !onDevice.includes(w) && (w !== 'klashub' || active.apps.includes('klashub')) && appOn(appSwitches, WIDGET_APP[w] ?? 'settings'))

  /** Drag with the pointer (mouse, pen or touch): also works in the Windows app, where drag-and-drop of the page is off. */
  const startMove = (id: WidgetId) => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button,[data-resize]')) return
    e.preventDefault()
    setDragging(id)
    let target: WidgetId | null = null
    const onMovePointer = (ev: PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-widget]')
      const hit = (el?.dataset.widget as WidgetId | undefined) ?? null
      target = hit && hit !== id ? hit : null
      setOver(target)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMovePointer)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      setDragging(null)
      setOver(null)
      if (target) move(id, shown.indexOf(target))
    }
    window.addEventListener('pointermove', onMovePointer)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const grid = (
    <ul
      ref={list}
      aria-label="Widgets"
      className="grid gap-3"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        // A widget with more to show than fits makes its row taller; the page then scrolls.
        gridAutoRows: phone || rowHeight === null ? `minmax(${ROW_MIN}, auto)` : `minmax(${rowHeight}px, auto)`,
      }}
    >
      {placements.map((p) => {
        const w = p.id
        const i = shown.indexOf(w)
        const stored = sizeOf(layout, w, active.id)
        const size = { w: p.w, h: p.h } as WidgetSize
        return (
          <li
            key={w}
            data-widget={w}
            style={{ gridColumn: `${p.x + 1} / span ${p.w}`, gridRow: `${p.y + 1} / span ${p.h}` }}
            className={`relative min-w-0 ${editing ? `cursor-grab touch-none rounded-xl outline-2 outline-dashed ${over === w ? 'outline-nx-accent' : 'outline-nx-accent/60'}` : ''} ${dragging === w ? 'cursor-grabbing opacity-50' : ''}`}
            onPointerDown={editing ? startMove(w) : undefined}
          >
            <div className={editing ? 'pointer-events-none h-full opacity-40 select-none' : 'h-full'} aria-hidden={editing || undefined}>
              <TierContext.Provider value={widgetTier(w)}>
                <Widget id={w} rows={p.h} now={now} onOpenApp={onOpenApp} />
              </TierContext.Provider>
            </div>
            {editing && (
              <EditFrame
                id={w}
                size={size}
                stretched={size.w > stored.w || size.h > stored.h}
                columns={cols}
                index={i}
                count={shown.length}
                onMove={(to) => move(w, to)}
                onSize={(next) => save({ layout: setSize(layout, w, next, active.id) })}
                hideLabel={phone ? 'Verbergen op gsm' : 'Verbergen op pc'}
                onHide={() => save(hideWidgetOn(active, device, w))}
              />
            )}
          </li>
        )
      })}
    </ul>
  )

  return (
    <div ref={box} className="flex flex-col gap-3">
      {editing && (
        <div className="space-y-2 rounded-2xl border border-nx-border p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-nx-muted">
              Sleep een widget naar een andere plek, of sleep de hoek rechtsonder om hem breder of hoger te maken. Dit geldt voor het profiel {active.name} en gaat mee naar je andere apparaten. Verbergen en Toevoegen gelden alleen voor {preview === 'gsm' ? 'je gsm' : 'je pc'}: kies hiernaast Pc of Gsm om de andere indeling te maken.
            </p>
            <div role="radiogroup" aria-label="Voorbeeld" className="flex gap-1">
              {(['pc', 'gsm'] as const).map((p) => (
                <button key={p} type="button" role="radio" aria-checked={preview === p} onClick={() => setPreview(p)} className={`${small} ${preview === p ? 'font-semibold' : ''}`}>
                  {p === 'pc' ? 'Pc' : 'Gsm'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} />
              Lege plekken opvullen: widgets rekken mee tot het scherm vol is
            </label>
            {undo ? (
              <span className="flex items-center gap-2">
                <span className="text-nx-muted" role="status">
                  Standaardindeling gezet.
                </span>
                <button
                  type="button"
                  className={small}
                  onClick={() => {
                    save(undo)
                    setUndo(null)
                  }}
                >
                  Ongedaan maken
                </button>
              </span>
            ) : (
              <button
                type="button"
                className={small}
                disabled={isStandard}
                title="Je dag, de week en deadlines bovenaan, zoals NEXUS het voor dit profiel voorstelt"
                onClick={() => {
                  setUndo({ widgets: active.widgets, layout, hiddenOn: active.hiddenOn ?? {} })
                  save(standard)
                }}
              >
                Standaardindeling
              </button>
            )}
          </div>
          {hidden.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-nx-muted">{preview === 'gsm' ? 'Toevoegen op gsm:' : 'Toevoegen op pc:'}</span>
              {hidden.map((w) => (
                <button key={w} type="button" className={small} onClick={() => save(showWidgetOn(active, device, w))}>
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
  stretched,
  columns,
  index,
  count,
  onMove,
  onSize,
  onHide,
  hideLabel,
}: {
  id: WidgetId
  size: WidgetSize
  stretched: boolean
  columns: number
  index: number
  count: number
  onMove: (to: number) => void
  onSize: (size: WidgetSize) => void
  onHide: () => void
  hideLabel: string
}) {
  const title = WIDGET_TITLES[id]
  const frame = useRef<HTMLDivElement>(null)
  const [live, setLive] = useState<WidgetSize | null>(null)
  const maxW = Math.min(MAX_COLUMNS, columns)
  const resize = (dw: number, dh: number) => onSize({ w: Math.min(maxW, size.w + dw), h: size.h + dh } as WidgetSize)
  return (
    <div ref={frame} className="absolute inset-0 flex flex-col justify-between p-2" role="group" aria-label={`${title} indelen`}>
      <div className="flex flex-wrap items-center gap-1">
        <span className="rounded-md bg-nx-accent px-2 py-0.5 text-xs font-medium text-nx-accent-text" aria-hidden>
          ⠿ {title}
        </span>
        <span className="text-xs text-nx-muted">
          {(live ?? size).w}×{(live ?? size).h}
          {stretched && !live ? ' · rekt mee' : ''}
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
          <button type="button" className={small} disabled={size.w === 1} aria-label={`${title} smaller`} onClick={() => resize(-1, 0)}>
            −↔
          </button>
          <button type="button" className={small} disabled={size.w >= maxW} aria-label={`${title} breder`} onClick={() => resize(1, 0)}>
            +↔
          </button>
          <button type="button" className={small} disabled={size.h === 1} aria-label={`${title} lager`} onClick={() => resize(0, -1)}>
            −↕
          </button>
          <button type="button" className={small} disabled={size.h >= MAX_ROWS} aria-label={`${title} hoger`} onClick={() => resize(0, 1)}>
            +↕
          </button>
          <button type="button" className={small} aria-label={`${title} verbergen`} onClick={onHide}>
            {hideLabel}
          </button>
        </div>
        <span
          aria-hidden
          data-resize
          title="Sleep om de grootte te veranderen"
          className="size-5 cursor-nwse-resize touch-none rounded-br-xl border-r-4 border-b-4 border-nx-accent"
          onPointerDown={(e) => {
            const box = frame.current?.getBoundingClientRect()
            if (!box) return
            e.preventDefault()
            e.stopPropagation()
            const start = { x: e.clientX, y: e.clientY }
            const cell = { width: box.width / size.w, height: box.height / size.h }
            let last = size
            const onMovePointer = (ev: PointerEvent) => {
              const next = sizeFromDrag(size, ev.clientX - start.x, ev.clientY - start.y, cell)
              last = { ...next, w: Math.min(maxW, next.w) } as WidgetSize
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

function Widget({ id, rows, now, onOpenApp }: { id: WidgetId; rows: number; now: number; onOpenApp: OpenApp }) {
  switch (id) {
    case 'profile':
      return <ProfileWidget onOpenApp={onOpenApp} />
    case 'next_class':
      return <NextClass now={now} onOpenApp={onOpenApp} />
    case 'deadlines':
      return <Upcoming rows={rows} onOpenApp={onOpenApp} />
    case 'notes':
      return <RecentNotes rows={rows} onOpenApp={onOpenApp} />
    case 'ai_study':
      return <AiStudy onOpenApp={onOpenApp} />
    case 'klashub':
      return <KlasHub onOpenApp={onOpenApp} />
    case 'notifications':
      return <Notifications rows={rows} onOpenApp={onOpenApp} />
    case 'devices':
      return <DevicesWidget onOpenApp={onOpenApp} />
    case 'finance':
      return <FinanceWidget onOpenApp={onOpenApp} />
    case 'gaming':
      return <GamingWidget onOpenApp={onOpenApp} />
    case 'habits':
      return <HabitsWidget rows={rows} now={now} onOpenApp={onOpenApp} />
    case 'quick_note':
      return <QuickNote />
    case 'clock':
      return <ClockWidget now={now} />
    case 'shortcuts':
      return <Shortcuts onOpenApp={onOpenApp} />
    case 'agenda_week':
      return <AgendaWeek rows={rows} now={now} onOpenApp={onOpenApp} />
    case 'today':
      return <MyDay now={now} onOpenApp={onOpenApp} />
    default:
      // A widget from a newer NEXUS (synced from another device): nothing to show here yet.
      return null
  }
}

const DAY_MS = 86_400_000

function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const ENTRY_ICON: Partial<Record<AgendaEntry['kind'], string>> = { deadline: '📌 ', appointment: '📅 ', reminder: '⏰ ', event: '🗓️ ' }

/**
 * The week of the Agenda, open on the dashboard: lessons, appointments, Google Agenda, deadlines
 * and reminders, one column per day, as many days as fit (up to seven).
 */
function AgendaWeek({ rows, now, onOpenApp }: { rows: number; now: number; onOpenApp: OpenApp }) {
  const { state } = useProfiles()
  const life = useSyncExternalStore(lifeStore.subscribe, lifeStore.getSnapshot)
  const reminders = useSyncExternalStore(remindersStore.subscribe, remindersStore.getSnapshot)
  const today = startOfDay(now)
  // +1 hour per step keeps each start on the right day across a time change.
  const days = Array.from({ length: 7 }, (_, i) => startOfDay(today + i * DAY_MS + 3_600_000))
  const input = { calendarEvents: state.calendarEvents, googleEvents: linkedEvents(state), timetable: state.lessons, items: life, reminders }
  const hidden = new Set(calendarSources(state).filter((c) => c.hidden).map((c) => c.id))
  const perDay = Math.max(3, rows * 5)
  return (
    <div className={`${tileClass('main')} flex h-full flex-col overflow-hidden rounded-xl border p-4`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <WidgetTitle tier="main">Agenda deze week</WidgetTitle>
        <button type="button" className={linkButton} onClick={() => onOpenApp('agenda')}>
          Agenda openen
        </button>
      </div>
      <ol className="grid min-h-0 flex-1 [grid-auto-rows:100%] grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2 overflow-hidden">
        {days.map((day) => {
          const entries = agendaDay(input, day).filter((e) => !('source' in e && e.source && hidden.has(e.source)))
          const isToday = day === today
          const title = isToday ? 'Vandaag' : day === days[1] ? 'Morgen' : new Date(day).toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' })
          return (
            <li key={day} aria-label={title} className={`flex min-h-0 flex-col overflow-hidden rounded-xl border p-2 ${isToday ? 'border-nx-accent bg-nx-accent/10' : 'border-nx-border'}`}>
              <button type="button" onClick={() => onOpenApp('agenda')} className={`mb-1 text-left text-sm font-semibold first-letter:uppercase ${isToday ? 'text-nx-accent' : ''}`}>
                {title}
              </button>
              {entries.length === 0 ? (
                <p className="text-xs text-nx-muted">Niets gepland.</p>
              ) : (
                <ul className="min-h-0 space-y-1 overflow-hidden text-xs">
                  {entries.slice(0, perDay).map((e, i) => (
                    <li key={i} className={`rounded-md bg-nx-surface-2 px-1.5 py-1 ${e.kind === 'deadline' && e.deadline.doneAt !== null ? 'text-nx-muted line-through' : ''}`}>
                      <span className="block text-nx-muted tabular-nums">
                        {clock(e.at)}
                        {'end' in e ? `–${clock(e.end)}` : ''}
                      </span>
                      <span className="line-clamp-2">
                        {ENTRY_ICON[e.kind] ?? ''}
                        {e.title}
                      </span>
                    </li>
                  ))}
                  {entries.length > perDay && <li className="text-nx-muted">+{entries.length - perDay} meer</li>}
                </ul>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** What a timed thing is called on Mijn dag, with its room or place. */
const placeOf = (e: TimedEntry) => (e.detail ? ` in ${e.detail}` : '')

/** The one line on top of Mijn dag: what is on now or next, in plain words. */
function dayHeadline(current: TimedEntry | null, next: TimedEntry | null, now: number): string {
  if (next) {
    const minutes = Math.round((next.at - now) / 60_000)
    if (minutes <= 60) return `${next.title} begint over ${minutes} ${minutes === 1 ? 'minuut' : 'minuten'}${placeOf(next)}`
  }
  if (current) return `Nu ${current.title}${placeOf(current)}, tot ${clock(current.end)}`
  if (next) return `Straks ${next.title} om ${clock(next.at)}${placeOf(next)}`
  return 'Je dag zit erop'
}

/**
 * Mijn dag: today as a time line across the dashboard, with a copper trace at the time it is now.
 * Lessons, appointments and calendar events stand where they fall in the day; on a narrow screen
 * the same day reads as a list.
 */
function MyDay({ now, onOpenApp }: { now: number; onOpenApp: OpenApp }) {
  const { state } = useProfiles()
  const life = useSyncExternalStore(lifeStore.subscribe, lifeStore.getSnapshot)
  const reminders = useSyncExternalStore(remindersStore.subscribe, remindersStore.getSnapshot)
  const input = { calendarEvents: state.calendarEvents, googleEvents: linkedEvents(state), timetable: state.lessons, items: life, reminders }
  const hidden = new Set(calendarSources(state).filter((c) => c.hidden).map((c) => c.id))
  const entries = agendaDay(input, startOfDay(now)).filter((e) => !('source' in e && e.source && hidden.has(e.source)))
  const day = dayTimeline(entries, now)
  const past = day ? day.blocks.filter((b) => b.entry.end <= now).length : 0
  const stageOf = (e: TimedEntry) => (e.end <= now ? 'past' : e === day?.current ? 'now' : e === day?.next ? 'next' : 'later')
  return (
    <section aria-label="Mijn dag" className={`${tileClass('main')} @container flex h-full flex-col overflow-hidden rounded-xl border px-5 py-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-xl font-semibold tracking-tight @3xl:text-[22px]">{day ? dayHeadline(day.current, day.next, now) : 'Niets gepland vandaag'}</h2>
        {day && day.endsAt !== null ? (
          <p className="text-sm text-nx-muted">
            {day.left > 0 ? `Nog ${day.left} vandaag, ` : ''}
            {`klaar om ${clock(day.endsAt)}`}
          </p>
        ) : (
          <button type="button" className={linkButton} onClick={() => onOpenApp('agenda')}>
            Agenda openen
          </button>
        )}
      </div>
      {day && (
        <>
          {/* Wide: the time line. */}
          <div className="relative mt-4 hidden min-h-0 flex-1 @2xl:block" style={{ minHeight: `${1.25 + day.lanes * 3.75}rem` }}>
            <div aria-hidden className="absolute inset-x-0 top-0 h-4 text-[11px] text-nx-muted tabular-nums">
              {day.hours.map((h) => (
                <span key={h.at} className="absolute -translate-x-1/2" style={{ left: `${h.left * 100}%` }}>
                  {clock(h.at)}
                </span>
              ))}
            </div>
            <ol className="absolute inset-x-0 top-6 bottom-0">
              {day.blocks.map((b, i) => {
                const st = stageOf(b.entry)
                return (
                  <li
                    key={i}
                    className="absolute px-0.5"
                    style={{ left: `${b.left * 100}%`, width: `${b.width * 100}%`, top: `${(b.lane / day.lanes) * 100}%`, height: `${100 / day.lanes}%`, maxHeight: '5.5rem' }}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenApp('agenda')}
                      title={`${b.entry.title}, ${clock(b.entry.at)} tot ${clock(b.entry.end)}${placeOf(b.entry)}`}
                      className={`nx-lift flex h-full w-full flex-col overflow-hidden rounded-lg border px-2.5 py-2 text-left ${st === 'past' ? 'border-nx-border bg-nx-surface-2 opacity-55' : st === 'next' || st === 'now' ? 'border-nx-accent/50 bg-nx-accent/12' : 'border-nx-border bg-nx-surface-2'}`}
                    >
                      <span className="truncate text-sm font-semibold">{b.entry.title}</span>
                      <span className="truncate text-xs text-nx-muted tabular-nums">
                        {clock(b.entry.at)}
                        {b.entry.detail ? `, ${b.entry.detail}` : ''}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
            {day.now !== null && <span aria-hidden data-testid="nu" className="nx-now absolute top-4 -bottom-1" style={{ left: `${day.now * 100}%` }} />}
          </div>
          {/* Narrow: the same day as a list, what is next marked with the trace. */}
          <ol className="mt-3 min-h-0 space-y-1.5 overflow-hidden @2xl:hidden">
            {past > 0 && day.left > 0 && (
              <li className="text-xs text-nx-muted">
                {past} {past === 1 ? 'is' : 'zijn'} al voorbij
              </li>
            )}
            {day.blocks.map((b, i) => {
              const st = stageOf(b.entry)
              // What is over takes no room on a phone while there is still something to come.
              if (st === 'past' && day.left > 0) return null
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => onOpenApp('agenda')}
                    className={`flex w-full items-baseline justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm ${st === 'past' ? 'border-nx-border bg-nx-surface-2 text-nx-muted' : st === 'next' || st === 'now' ? 'border-nx-accent/50 bg-nx-accent/12 shadow-[inset_3px_0_0_var(--nx-accent)]' : 'border-nx-border bg-nx-surface-2'}`}
                  >
                    <span className="truncate font-semibold">{b.entry.title}</span>
                    <span className="shrink-0 text-xs text-nx-muted tabular-nums">
                      {clock(b.entry.at)}
                      {b.entry.detail ? `, ${b.entry.detail}` : ''}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </>
      )}
    </section>
  )
}

/** The active profile: what it is for, why it is on, and a way to switch. */
function ProfileWidget({ onOpenApp }: { onOpenApp: OpenApp }) {
  const { state, active, reason } = useProfiles()
  const Icon = PROFILE_ICONS[active.id]
  return (
    <Card>
      {/* Dashboard 2.0: a calm side tile; the greeting on top already names the profile. */}
      <div className="flex h-full flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="flex min-w-0 items-center gap-2 font-semibold">
            <Icon className="size-5 shrink-0 text-nx-accent" />
            <span className="truncate">{active.name} Mode</span>
          </p>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-nx-border px-2 py-0.5 text-xs font-medium">
            <span aria-hidden className="size-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgb(16_185_129/0.18)]" />
            Actief
          </span>
        </div>
        <p className="line-clamp-2 text-sm">{active.description}</p>
        <p className="line-clamp-2 text-xs text-nx-muted">{reasonText(reason, state)}</p>
        <button type="button" className={`${linkButton} mt-auto self-start`} onClick={() => onOpenApp('profiles')}>
          Profiel wisselen
        </button>
      </div>
    </Card>
  )
}

/** Today's habits, ticked off right here. */
function HabitsWidget({ rows, now, onOpenApp }: { rows: number; now: number; onOpenApp: OpenApp }) {
  const state = useSyncExternalStore(habitsStore.subscribe, habitsStore.getSnapshot)
  const today = activeHabits(state).filter((h) => isDue(h, now))
  const done = today.filter((h) => isDone(h, now)).length
  return (
    <Card title="Gewoontes vandaag">
      {today.length === 0 ? (
        <p className="text-sm text-nx-muted">Geen gewoontes voor vandaag.</p>
      ) : (
        <>
          <p className="mb-1 text-sm text-nx-muted">
            {done} van {today.length} gedaan
          </p>
          <ul className="space-y-1 text-sm">
            {today.slice(0, 4 * rows).map((h) => (
              <li key={h.id}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isDone(h, now)}
                    onChange={() => habitsStore.update((s) => ({ ...s, habits: s.habits.map((x) => (x.id === h.id ? toggleDone(x, Date.now()) : x)) }))}
                  />
                  <span className={`truncate ${isDone(h, now) ? 'text-nx-muted line-through' : ''}`}>{h.name}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      <button type="button" className={`${linkButton} mt-2`} onClick={() => onOpenApp('habits')}>
        Gewoontes openen
      </button>
    </Card>
  )
}

/** Type something and keep it as a note, without opening Notities. */
function QuickNote() {
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)
  const save = () => {
    const body = text.trim()
    if (!body) return
    const id = notesStore.add()
    notesStore.update(id, { body })
    setText('')
    setSaved(true)
  }
  return (
    <Card title="Snelle notitie">
      <div className="flex h-[calc(100%-1.5rem)] flex-col gap-2">
        <textarea
          aria-label="Snelle notitie"
          value={text}
          onChange={(e) => (setText(e.target.value), setSaved(false))}
          onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && save()}
          placeholder="Schrijf iets op…"
          className="min-h-16 flex-1 resize-none rounded-lg border border-nx-border bg-nx-surface p-2 text-sm"
        />
        <div className="flex items-center gap-2">
          <button type="button" disabled={!text.trim()} onClick={save} className="rounded-lg bg-nx-accent px-3 py-1 text-sm font-medium text-nx-accent-text disabled:opacity-40">
            Notitie bewaren
          </button>
          {saved && <span className="text-xs text-nx-muted">Bewaard in Notities</span>}
        </div>
      </div>
    </Card>
  )
}

function ClockWidget({ now }: { now: number }) {
  return (
    <Card>
      <div className="flex h-full flex-col items-center justify-center text-center">
        <p className="text-5xl font-semibold tabular-nums">{clock(now)}</p>
        <p className="mt-1 text-sm text-nx-muted">{new Date(now).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>
    </Card>
  )
}

/** The apps of this profile as buttons; which apps is set per profile in Profielen. */
function Shortcuts({ onOpenApp }: { onOpenApp: OpenApp }) {
  const apps = useVisibleApps()
  return (
    <Card title="Snelkoppelingen">
      {/* Scrolls inside the card: a long list of apps does not make the row taller. */}
      <ul className="grid h-[calc(100%-1.5rem)] min-h-16 grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] content-start gap-1 overflow-y-auto [contain:size]">
        {apps.map((app) => (
          <li key={app.id}>
            <button type="button" onClick={() => onOpenApp(app.id)} className="flex w-full flex-col items-center gap-1 rounded-lg p-2 text-xs hover:bg-nx-surface-2">
              <span className="text-nx-accent [&>svg]:size-6">
                <app.icon />
              </span>
              <span className="w-full truncate text-center">{app.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
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

function Upcoming({ rows = 1, onOpenApp }: { rows?: number; onOpenApp: OpenApp }) {
  const reminders = useSyncExternalStore(remindersStore.subscribe, remindersStore.getSnapshot)
  const life = useSyncExternalStore(lifeStore.subscribe, lifeStore.getSnapshot)
  const now = Date.now()
  // Open deadlines (overdue ones too), coming appointments and reminders together, soonest first.
  const items = [
    ...openDeadlines(life).map((d) => ({ id: d.id, title: d.title, at: d.dueAt, deadline: true })),
    ...appointmentsOf(life).flatMap((a) => {
      const next = nextOccurrence(a, now)
      return next ? [{ id: a.id, title: a.title, at: next.startAt, deadline: false }] : []
    }),
    ...reminders.map((r) => ({ id: r.id, title: r.title, at: r.at, deadline: false })),
  ].sort((a, b) => a.at - b.at)
  return (
    <Card title="Deadlines en afspraken">
      {items.length === 0 ? (
        <p className="text-sm text-nx-muted">Niets gepland.</p>
      ) : (
        <ul className="text-sm">
          {items.slice(0, 4 * rows).map((r) => {
            const late = r.deadline && r.at < now
            const days = Math.round((startOfDay(r.at) - startOfDay(now)) / DAY_MS)
            return (
              <li key={r.id} className="grid grid-cols-[2.75rem_1fr] items-center gap-3 border-t border-nx-border py-1.5 first:border-t-0">
                <span className={`text-right leading-none tabular-nums ${late || days <= 1 ? 'text-nx-accent' : ''}`}>
                  {late ? (
                    <span className="text-xs font-semibold text-red-500">te laat</span>
                  ) : days === 0 ? (
                    <span className="text-xs font-semibold">vandaag</span>
                  ) : (
                    <>
                      <span className="block text-2xl font-semibold">{days}</span>
                      <span className="block text-[11px] text-nx-muted">{days === 1 ? 'dag' : 'dagen'}</span>
                    </>
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.title}</span>
                  <span className="block truncate text-xs text-nx-muted">
                    {new Date(r.at).toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
      <button type="button" className={`${linkButton} mt-2`} onClick={() => onOpenApp('agenda')}>
        Agenda openen
      </button>
    </Card>
  )
}

function RecentNotes({ rows = 1, onOpenApp }: { rows?: number; onOpenApp: OpenApp }) {
  const { notes } = useNotes()
  return (
    <Card title="Notities">
      {notes.length === 0 ? (
        <p className="text-sm text-nx-muted">Nog geen notities.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {notes.slice(0, 4 * rows - 1).map((n) => (
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

function Notifications({ rows = 1, onOpenApp }: { rows?: number; onOpenApp: OpenApp }) {
  const { state } = useConnect()
  return (
    <Card title="Meldingen">
      <p className="text-sm">{state.unread > 0 ? `${state.unread} nieuwe melding(en)` : 'Geen nieuwe meldingen.'}</p>
      <ul className="mt-1 space-y-1 text-sm text-nx-muted">
        {state.inbox.slice(0, 4 * rows - 1).map((i) => (
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
