import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { WindowState } from '@nexus/core'
import { getApp } from '../apps/registry'
import { useWindows } from '../state/WindowsContext'

interface Props {
  win: WindowState
  focused: boolean
}

type DragMode = 'move' | 'resize'

export function Window({ win, focused }: Props) {
  const { dispatch } = useWindows()
  const drag = useRef<{ mode: DragMode; startX: number; startY: number; rect: WindowState['rect'] } | null>(null)
  const app = getApp(win.appId)
  const AppComponent = app.component

  const startDrag = (mode: DragMode) => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || win.maximized) return
    // Let clicks on title-bar buttons through.
    if (mode === 'move' && (e.target as HTMLElement).closest('button')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { mode, startX: e.clientX, startY: e.clientY, rect: win.rect }
    dispatch({ type: 'focus', id: win.id })
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (d.mode === 'move') {
      // Keep at least part of the title bar reachable.
      const x = Math.min(Math.max(d.rect.x + dx, -d.rect.width + 80), window.innerWidth - 80)
      dispatch({ type: 'move', id: win.id, x, y: d.rect.y + dy })
    } else {
      dispatch({ type: 'resize', id: win.id, width: d.rect.width + dx, height: d.rect.height + dy })
    }
  }

  const endDrag = () => {
    drag.current = null
  }

  if (win.minimized) return null

  const style = win.maximized
    ? { inset: 0, zIndex: win.z }
    : { left: win.rect.x, top: win.rect.y, width: win.rect.width, height: win.rect.height, zIndex: win.z }

  return (
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
        <AppComponent />
      </div>

      {!win.maximized && (
        <div
          aria-hidden
          onPointerDown={startDrag('resize')}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="absolute right-0 bottom-0 size-4 cursor-se-resize touch-none"
        />
      )}
    </section>
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
