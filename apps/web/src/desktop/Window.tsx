import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
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

/** The desktop area the windows live in (next to the sidebar, above the taskbar). */
function areaOf(el: HTMLElement): DOMRect {
  return (el.closest('main') ?? document.body).getBoundingClientRect()
}

export function Window({ win, focused }: Props) {
  const { dispatch } = useWindows()
  const drag = useRef<{ mode: DragMode; startX: number; startY: number; rect: WindowState['rect']; last: WindowState['rect']; fromMax: boolean } | null>(null)
  const [snap, setSnap] = useState<SnapSide | null>(null)
  const app = getApp(win.appId)

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

  if (win.minimized) return null

  const style = win.maximized
    ? { inset: 0, zIndex: win.z }
    : { left: win.rect.x, top: win.rect.y, width: win.rect.width, height: win.rect.height, zIndex: win.z }

  return (
    <>
      {snap && (
        <div
          aria-hidden
          data-testid="snap-preview"
          className="pointer-events-none absolute rounded-xl border-2 border-nx-accent bg-nx-accent/15 transition-all"
          style={{
            zIndex: win.z,
            top: 8,
            bottom: 8,
            left: snap === 'right' ? '50%' : 8,
            right: snap === 'left' ? '50%' : 8,
          }}
        />
      )}
      <section
        role="dialog"
        aria-label={win.title}
        style={style}
        onPointerDown={() => !focused && dispatch({ type: 'focus', id: win.id })}
        className={`nx-glass absolute flex flex-col overflow-hidden border ${
          win.maximized ? 'rounded-none' : 'rounded-xl'
        } ${focused ? 'border-nx-accent/60' : 'border-nx-border'}`}
      >
        <header
          onPointerDown={startDrag('move')}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={() => dispatch({ type: 'toggleMaximize', id: win.id })}
          title="Sleep om te verplaatsen; naar de rand van het scherm om vast te zetten"
          className="flex h-10 shrink-0 cursor-default touch-none items-center gap-2 border-b border-nx-border bg-nx-surface-2 pr-1 pl-3 select-none"
        >
          <app.icon className={`size-4 ${focused ? 'text-nx-accent' : 'text-nx-muted'}`} />
          <h2 className="flex-1 truncate text-sm font-medium">{win.title}</h2>
          <TitleButton label="Minimaliseren" onClick={() => dispatch({ type: 'minimize', id: win.id })}>
            <path d="M5 12h14" />
          </TitleButton>
          <TitleButton
            label={win.maximized ? 'Herstellen' : 'Maximaliseren'}
            onClick={() => dispatch({ type: 'toggleMaximize', id: win.id })}
          >
            <rect x="5" y="5" width="14" height="14" rx="2" />
          </TitleButton>
          <TitleButton label="Sluiten" onClick={() => dispatch({ type: 'close', id: win.id })} danger>
            <path d="M6 6l12 12M18 6L6 18" />
          </TitleButton>
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
      className={`grid size-8 place-items-center rounded-md text-nx-muted ${
        danger ? 'hover:bg-red-500 hover:text-white' : 'hover:bg-nx-surface hover:text-nx-text'
      }`}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
        {children}
      </svg>
    </button>
  )
}
