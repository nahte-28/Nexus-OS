import { useEffect, useState } from 'react'
import type { AppId } from '@nexus/core'
import { getApp } from '../apps/registry'
import { GridIcon } from '../apps/icons'
import { useWindows } from '../state/WindowsContext'
import { StartMenu } from './StartMenu'

export const TASKBAR_HEIGHT = 52

export function Taskbar({ onOpenApp }: { onOpenApp: (id: AppId) => void }) {
  const { state, dispatch } = useWindows()
  const [startOpen, setStartOpen] = useState(false)

  return (
    <footer
      style={{ height: TASKBAR_HEIGHT }}
      className="nx-glass absolute inset-x-0 bottom-0 z-[10000] flex items-center gap-1 border-t border-nx-border px-2"
    >
      <button
        type="button"
        aria-label="Start"
        aria-expanded={startOpen}
        onClick={() => setStartOpen((v) => !v)}
        className={`grid size-10 place-items-center rounded-lg ${startOpen ? 'bg-nx-accent text-nx-accent-text' : 'text-nx-accent hover:bg-nx-surface-2'}`}
      >
        <GridIcon />
      </button>

      <nav aria-label="Geopende vensters" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {state.windows.map((win) => {
          const app = getApp(win.appId)
          const active = state.focusedId === win.id
          return (
            <button
              key={win.id}
              type="button"
              aria-pressed={active}
              onClick={() => dispatch(active ? { type: 'minimize', id: win.id } : { type: 'focus', id: win.id })}
              className={`flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm ${
                active ? 'bg-nx-surface-2 font-medium' : 'hover:bg-nx-surface-2'
              } ${win.minimized ? 'opacity-60' : ''}`}
            >
              <app.icon className="size-4 text-nx-accent" />
              {win.title}
            </button>
          )
        })}
      </nav>

      <Clock />
      {startOpen && (
        <StartMenu
          onClose={() => setStartOpen(false)}
          onOpenApp={(id) => {
            onOpenApp(id)
            setStartOpen(false)
          }}
        />
      )}
    </footer>
  )
}

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(t)
  }, [])
  return (
    <time dateTime={now.toISOString()} className="px-3 text-right text-xs leading-tight text-nx-muted tabular-nums">
      <span className="block text-sm text-nx-text">{now.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}</span>
      {now.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })}
    </time>
  )
}
