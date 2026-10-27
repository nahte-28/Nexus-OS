import { useEffect, useState } from 'react'
import type { AppId } from '@nexus/core'
import { getApp } from '../apps/registry'
import { BellIcon, CloudIcon, GridIcon } from '../apps/icons'
import { statusText } from '../apps/Account'
import { useConnect } from '../connect/ConnectContext'
import { useSync } from '../sync/SyncContext'
import { installUpdate, useUpdate } from '../platform/update'
import { useWindows } from '../state/WindowsContext'
import { SearchButton } from '../search/SearchPalette'
import { StartMenu } from './StartMenu'

export const TASKBAR_HEIGHT = 52

export function Taskbar({ onOpenApp, onSearch }: { onOpenApp: (id: AppId) => void; onSearch: () => void }) {
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
      <SearchButton onClick={onSearch} />

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

      <UpdateBadge />
      <InboxBadge onOpen={() => onOpenApp('notifications')} />
      <SyncBadge onOpen={() => onOpenApp('account')} />
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

function SyncBadge({ onOpen }: { onOpen: () => void }) {
  const { state } = useSync()
  if (state.status === 'unconfigured') return null
  const label = statusText(state)
  const color =
    state.status === 'error' ? 'text-red-500' : state.status === 'synced' && state.pending === 0 ? 'text-nx-accent' : 'text-nx-muted'
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Synchronisatie: ${label}`}
      title={label}
      className={`grid size-10 place-items-center rounded-lg hover:bg-nx-surface-2 ${color} ${state.status === 'syncing' ? 'animate-pulse' : ''}`}
    >
      <CloudIcon className="size-5" />
    </button>
  )
}

function InboxBadge({ onOpen }: { onOpen: () => void }) {
  const { state } = useConnect()
  if (state.status === 'unconfigured' || state.status === 'signed-out') return null
  const label = state.unread > 0 ? `${state.unread} nieuwe melding(en)` : 'Meldingen'
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      title={label}
      className="relative grid size-10 place-items-center rounded-lg text-nx-muted hover:bg-nx-surface-2"
    >
      <BellIcon className="size-5" />
      {state.unread > 0 && (
        <span className="absolute top-1 right-1 min-w-4 rounded-full bg-nx-accent px-1 text-[10px] leading-4 font-semibold text-nx-accent-text">
          {state.unread > 99 ? '99+' : state.unread}
        </span>
      )}
    </button>
  )
}

/** Shown only in the Windows app when a newer version was published. */
function UpdateBadge() {
  const update = useUpdate()
  if (update.status !== 'available' && update.status !== 'installing') return null
  const installing = update.status === 'installing'
  return (
    <button
      type="button"
      disabled={installing}
      onClick={() => void installUpdate()}
      title={`NEXUS OS ${update.update.version} installeren`}
      className="h-10 shrink-0 rounded-lg bg-nx-accent px-3 text-sm font-medium text-nx-accent-text disabled:opacity-70"
    >
      {installing ? 'Bijwerken…' : `Bijwerken naar ${update.update.version}`}
    </button>
  )
}
