import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { resizeRect, snapAt, snapRect, type ResizeEdge, type SnapSide, type WindowState } from '@nexus/core'
import { getApp } from '../apps/registry'
import { AppView } from '../apps/AppView'
import { ErrorBoundary } from '../devtools/ErrorBoundary'
import { useWindows } from '../state/WindowsContext'
import { rememberPlace } from './windowPlaces'

interface Props {
  win: WindowState
  focused: boolean
}

type DragMode = 'move' | ResizeEdge

/** The handles on every edge and corner; corners sit on top so they win where they overlap. */
const EDGES: Array<{ edge: ResizeEdge; className: string }> = [
  { edge: 'n', className: 'top-0 inset-x-3 h-1.5 cursor-ns-resize' },
  { edge: 's', className: 'bottom-0 inset-x-3 h-1.5 cursor-ns-resize' },
  { edge: 'w', className: 'left-0 inset-y-3 w-1.5 cursor-ew-resize' },
  { edge: 'e', className: 'right-0 inset-y-3 w-1.5 cursor-ew-resize' },
  { edge: 'nw', className: 'top-0 left-0 size-3 cursor-nwse-resize' },
  { edge: 'ne', className: 'top-0 right-0 size-3 cursor-nesw-resize' },
  { edge: 'sw', className: 'bottom-0 left-0 size-3 cursor-nesw-resize' },
  { edge: 'se', className: 'bottom-0 right-0 size-4 cursor-nwse-resize' },
]

/** How long closing and minimizing play before the window is really gone (see .nx-appwindow). */
const CLOSE_MS = 140
const MINIMIZE_MS = 180

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** The desktop area the windows live in (above the taskbar). */
function areaOf(el: HTMLElement): DOMRect {
  return (el.closest('main') ?? document.body).getBoundingClientRect()
}

export function Window({ win, focused }: Props) {
  const { dispatch } = useWindows()
  const drag = useRef<{ mode: DragMode; startX: number; startY: number; rect: WindowState['rect']; last: WindowState['rect']; fromMax: boolean } | null>(null)
  const [snap, setSnap] = useState<SnapSide | null>(null)
  const app = getApp(win.appId)
  const el = useRef<HTMLElement>(null)
  // Closing plays out before the window leaves the state; minimizing before it is hidden.
  const [closing, setClosing] = useState(false)
  const [hidden, setHidden] = useState(win.minimized)
  const [fromTaskbar, setFromTaskbar] = useState(false)

  useEffect(() => {
    if (!win.minimized) {
      if (hidden) setFromTaskbar(true)
      setHidden(false)
      return
    }
    if (reducedMotion()) return setHidden(true)
    const t = window.setTimeout(() => setHidden(true), MINIMIZE_MS)
    return () => window.clearTimeout(t)
  }, [win.minimized]) // only when minimized changes

  const closeTimer = useRef<{ timer: number; z: number } | null>(null)
  const close = () => {
    if (closeTimer.current) return
    if (reducedMotion()) return dispatch({ type: 'close', id: win.id })
    setClosing(true)
    closeTimer.current = { z: win.z, timer: window.setTimeout(() => dispatch({ type: 'close', id: win.id }), CLOSE_MS) }
  }
  // Opened again while it was closing (it came to the front): it stays.
  useEffect(() => {
    const c = closeTimer.current
    if (!c || c.z === win.z) return
    window.clearTimeout(c.timer)
    closeTimer.current = null
    setClosing(false)
  }, [win.z])
  useEffect(() => () => window.clearTimeout(closeTimer.current?.timer), [])

  // Maximize, restore and snapping glide from the old place to the new one (FLIP, transform only).
  const box = useRef<DOMRect | null>(null)
  const placed = useRef({ rect: win.rect, maximized: win.maximized })
  useLayoutEffect(() => {
    const node = el.current
    if (!node || hidden) return
    const before = box.current
    const after = node.getBoundingClientRect()
    box.current = after
    const moved = placed.current.rect !== win.rect || placed.current.maximized !== win.maximized
    placed.current = { rect: win.rect, maximized: win.maximized }
    if (!moved || !before || drag.current || typeof node.animate !== 'function' || reducedMotion()) return
    if (after.width === 0 || after.height === 0) return
    const dx = before.left - after.left
    const dy = before.top - after.top
    const sx = before.width / after.width
    const sy = before.height / after.height
    if (Math.abs(dx) + Math.abs(dy) < 2 && Math.abs(sx - 1) + Math.abs(sy - 1) < 0.01) return
    node.animate(
      [
        { transformOrigin: 'top left', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
        { transformOrigin: 'top left', transform: 'none' },
      ],
      { duration: 220, easing: 'cubic-bezier(0.77, 0, 0.175, 1)' },
    )
  })

  const startDrag = (mode: DragMode) => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    // Let clicks on title-bar buttons through.
    if (mode === 'move' && (e.target as HTMLElement).closest('button')) return
    if (win.maximized && mode !== 'move') return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { mode, startX: e.clientX, startY: e.clientY, rect: win.rect, last: win.rect, fromMax: win.maximized }
    dispatch({ type: 'focus', id: win.id })
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d) return
    if (d.fromMax) {
      // Dragging a maximized window takes it out, under the pointer, at its normal size.
      if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) < 8) return
      const area = areaOf(e.currentTarget)
      const rect = { ...d.rect, x: Math.round(e.clientX - area.left - d.rect.width / 2), y: 0 }
      dispatch({ type: 'setRect', id: win.id, rect })
      Object.assign(d, { fromMax: false, rect, last: rect, startX: e.clientX, startY: e.clientY })
      return
    }
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (d.mode === 'move') {
      // Keep at least part of the title bar reachable.
      const x = Math.min(Math.max(d.rect.x + dx, -d.rect.width + 80), window.innerWidth - 80)
      d.last = { ...d.rect, x, y: Math.max(0, d.rect.y + dy) }
      dispatch({ type: 'move', id: win.id, x, y: d.rect.y + dy })
      const area = areaOf(e.currentTarget)
      setSnap(snapAt(e.clientX - area.left, e.clientY - area.top, area))
    } else {
      d.last = resizeRect(d.rect, d.mode, dx, dy)
      dispatch({ type: 'setRect', id: win.id, rect: d.last })
    }
  }

  const endDrag = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.mode === 'move' && snap) {
      const area = areaOf(e.currentTarget)
      const rect = snapRect(snap, area)
      if (snap === 'full') {
        dispatch({ type: 'setRect', id: win.id, rect: d.rect })
        dispatch({ type: 'toggleMaximize', id: win.id })
      } else {
        dispatch({ type: 'setRect', id: win.id, rect })
        rememberPlace(win.appId, rect)
      }
      setSnap(null)
      return
    }
    setSnap(null)
    if (d.last !== d.rect) rememberPlace(win.appId, d.last)
  }

  const style = win.maximized
    ? { inset: 0, zIndex: win.z }
    : { left: win.rect.x, top: win.rect.y, width: win.rect.width, height: win.rect.height, zIndex: win.z }

  return (
    <>
      {snap && !win.minimized && (
        <div
          aria-hidden
          data-testid="snap-preview"
          className="nx-enter-fade pointer-events-none absolute rounded-xl border-2 border-nx-accent bg-nx-accent/15"
          style={{
            zIndex: win.z,
            top: 8,
            bottom: 8,
            left: snap === 'right' ? '50%' : 8,
            right: snap === 'left' ? '50%' : 8,
          }}
        />
      )}
      {/* Minimized stays mounted, only hidden: what you typed, the scroll position and running
          timers are still there when you bring the window back. */}
      <section
        ref={el}
        role="dialog"
        aria-label={win.title}
        hidden={hidden}
        aria-hidden={win.minimized || closing || undefined}
        inert={win.minimized || closing}
        style={style}
        onPointerDown={() => !focused && dispatch({ type: 'focus', id: win.id })}
        data-front={focused}
        data-max={win.maximized}
        data-leaving={closing ? 'close' : win.minimized ? 'minimize' : undefined}
        data-from={fromTaskbar ? 'taskbar' : undefined}
        className={`nx-window nx-appwindow absolute flex flex-col overflow-hidden border ${win.maximized ? 'rounded-none' : 'rounded-xl'}`}
      >
        <header
          onPointerDown={startDrag('move')}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={() => dispatch({ type: 'toggleMaximize', id: win.id })}
          title="Sleep om te verplaatsen; naar de rand van het scherm om vast te zetten"
          data-trace="top"
          data-on={focused}
          className={`group/title flex h-10 shrink-0 cursor-default touch-none items-center gap-2.5 border-b pr-1.5 pl-2 select-none ${
            focused ? 'border-nx-border bg-nx-surface-2' : 'border-nx-border/70 bg-transparent'
          }`}
        >
          <span aria-hidden className={`nx-titlechip grid size-6 shrink-0 place-items-center rounded-md ${focused ? '' : 'text-nx-muted'}`}>
            <app.icon className="size-3.5" />
          </span>
          <h2 className={`min-w-0 flex-1 truncate text-[13px] ${focused ? 'font-semibold text-nx-text' : 'font-medium text-nx-muted'}`}>{win.title}</h2>
          <div className={`flex items-center gap-0.5 ${focused ? '' : 'opacity-70 group-hover/title:opacity-100'}`}>
            <TitleButton label="Minimaliseren" onClick={() => dispatch({ type: 'minimize', id: win.id })}>
              <path d="M6 12.5h12" />
            </TitleButton>
            <TitleButton
              label={win.maximized ? 'Herstellen' : 'Maximaliseren'}
              onClick={() => dispatch({ type: 'toggleMaximize', id: win.id })}
            >
              {win.maximized ? (
                <>
                  <rect x="5.5" y="8.5" width="10" height="10" rx="1.5" />
                  <path d="M8.5 5.5h8.5a1.5 1.5 0 0 1 1.5 1.5v8.5" />
                </>
              ) : (
                <rect x="6" y="6" width="12" height="12" rx="1.75" />
              )}
            </TitleButton>
            <TitleButton label="Sluiten" onClick={close} danger>
              <path d="M7 7l10 10M17 7L7 17" />
            </TitleButton>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto">
          <ErrorBoundary name={win.title}>
            <AppView app={app} />
          </ErrorBoundary>
        </div>

        {!win.maximized &&
          EDGES.map(({ edge, className }) => (
            <div
              key={edge}
              aria-hidden
              data-edge={edge}
              onPointerDown={startDrag(edge)}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              className={`absolute touch-none ${className}`}
            />
          ))}
      </section>
    </>
  )
}

function TitleButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid h-7 w-8 place-items-center rounded-md text-nx-muted ${
        danger ? 'hover:bg-nx-danger-strong hover:text-white' : 'hover:bg-nx-surface hover:text-nx-text'
      }`}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden>
        {children}
      </svg>
    </button>
  )
}
