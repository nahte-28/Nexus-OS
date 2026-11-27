import { useState } from 'react'
import type { AppId } from '@nexus/core'
import { getApp } from '../apps/registry'
import { BellIcon, CloudIcon, UpdateIcon } from '../apps/icons'
import { statusText } from '../sync/statusText'
import { useConnect } from '../connect/ConnectContext'
import { useSync } from '../sync/SyncContext'
import { installUpdate, useUpdate } from '../platform/update'
import { useWindows } from '../state/WindowsContext'
import { SearchButton } from '../search/SearchButton'
import { CaptureButton } from '../capture/QuickCaptureHost'
import { StartMenu } from './StartMenu'
import { useMinute } from '../state/useNow'
import { NexusGlyph } from '../shell/NexusMark'
import { useVisibleApps } from '../apps/registry'
import { useFavorites } from '../controlcenter/store'

export const TASKBAR_HEIGHT = 48

/**
 * Taakbalk 2.0, from left to right: Start and the two quick tools, your pinned favourites, the open
 * windows, and one status zone (update, meldingen, sync, klok). Thin dividers keep the groups apart.
 * The bar is a size container: on narrow screens (768-1000px) window labels shrink and then become
 * icons, and the date leaves the clock, so nothing wraps or scrolls before it has to.
 */
export function Taskbar({ onOpenApp, onSearch }: { onOpenApp: (id: AppId) => void; onSearch: (query?: string) => void }) {
  const { state, dispatch } = useWindows()
  const [startOpen, setStartOpen] = useState(false)
  const focused = state.windows.find((w) => w.id === state.focusedId && !w.minimized)

  return (
    <footer
      style={{ height: TASKBAR_HEIGHT }}
      className="nx-glass @container absolute inset-x-0 bottom-0 z-[10000] flex items-center gap-1 border-t border-nx-border px-1.5"
    >
      <button
        type="button"
        aria-label="Start"
        aria-expanded={startOpen}
        onClick={() => setStartOpen((v) => !v)}
        className={`grid size-9 shrink-0 place-items-center rounded-md ${startOpen ? 'bg-nx-accent text-nx-accent-text' : 'text-nx-text hover:bg-nx-surface-2 hover:text-nx-accent'}`}
      >
        <NexusGlyph className="size-5" />
      </button>
      <SearchButton onClick={() => onSearch()} className="shrink-0" />
      <CaptureButton className="shrink-0" />
      <Favorites onOpenApp={onOpenApp} focusedApp={focused?.appId} />

      {state.windows.length > 0 && <Divider />}
      <nav aria-label="Geopende vensters" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
        {state.windows.map((win) => {
          const app = getApp(win.appId)
          const active = focused?.id === win.id
          return (
            <button
              key={win.id}
              type="button"
              aria-pressed={active}
              title={win.minimized ? `${win.title} (geminimaliseerd)` : win.title}
              onClick={() => dispatch(active ? { type: 'minimize', id: win.id } : { type: 'focus', id: win.id })}
              data-trace="bottom"
              className={`flex h-9 max-w-44 min-w-9 shrink items-center gap-2 rounded-md border px-2.5 text-[13px] @max-[820px]:justify-center @max-[820px]:px-0 ${
                active
                  ? 'border-nx-border bg-nx-surface font-medium text-nx-text shadow-sm'
                  : `border-transparent hover:bg-nx-surface-2 ${win.minimized ? 'text-nx-muted' : 'text-nx-text'}`
              }`}
            >
              <app.icon className={`size-4 shrink-0 ${active ? 'text-nx-accent' : 'text-nx-muted'} ${win.minimized ? 'opacity-60' : ''}`} />
              <span className="truncate @max-[820px]:sr-only">{win.title}</span>
            </button>
          )
        })}
      </nav>

      <StatusZone onOpenApp={onOpenApp} />
      {startOpen && (
        <StartMenu
          onClose={() => setStartOpen(false)}
          onSearch={onSearch}
          onOpenApp={(id) => {
            onOpenApp(id)
            setStartOpen(false)
          }}
        />
      )}
    </footer>
  )
}

const Divider = () => <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-nx-border" />

/**
 * Je favoriete apps, vast in de taakbalk. Je kiest ze met de ster in het Start-menu (het NEXUS-teken)
 * of in Control Center. Een app die open staat, krijgt een punt; staat hij vooraan, dan kleurt hij mee.
 */
function Favorites({ onOpenApp, focusedApp }: { onOpenApp: (id: AppId) => void; focusedApp?: AppId }) {
  const favorites = useFavorites()
  const visible = useVisibleApps()
  const { state } = useWindows()
  const apps = favorites.flatMap((id) => visible.filter((a) => a.id === id))
  if (apps.length === 0) return null
  return (
    <>
      <Divider />
      <nav aria-label="Favorieten" className="flex shrink-0 items-center gap-0.5">
        {apps.map((app) => {
          const open = state.windows.some((w) => w.appId === app.id)
          const front = focusedApp === app.id
          return (
            <button
              key={app.id}
              type="button"
              onClick={() => onOpenApp(app.id)}
              aria-label={app.title}
              title={app.title}
              className={`relative grid size-9 place-items-center rounded-md hover:bg-nx-surface-2 hover:text-nx-accent [&>svg]:size-[18px] ${
                front ? 'text-nx-accent' : 'text-nx-muted'
              }`}
            >
              <app.icon />
              {open && (
                <span
                  aria-hidden
                  className={`absolute bottom-0.5 h-[3px] w-3 rounded-full bg-nx-accent transition-transform duration-150 ease-out ${front ? '' : 'scale-x-25 opacity-70'}`}
                />
              )}
            </button>
          )
        })}
      </nav>
    </>
  )
}

/** One calm block on the right: update (only when there is one), meldingen, sync and the clock. */
function StatusZone({ onOpenApp }: { onOpenApp: (id: AppId) => void }) {
  return (
    <div
      role="group"
      aria-label="Status"
      className="ml-1 flex h-9 shrink-0 items-center gap-0.5 rounded-md border border-nx-border bg-nx-surface-2 px-0.5"
    >
      <UpdateBadge />
      <InboxBadge onOpen={() => onOpenApp('notifications')} />
      <SyncBadge onOpen={() => onOpenApp('account')} />
      <Clock />
    </div>
  )
}

function Clock() {
  const now = new Date(useMinute())
  return (
    <time
      dateTime={now.toISOString()}
      title={now.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      className="flex items-baseline gap-1.5 px-2 text-xs text-nx-muted tabular-nums"
    >
      <span className="text-[13px] font-medium text-nx-text">{now.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}</span>
      <span className="@max-[900px]:hidden">{now.toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
    </time>
  )
}

/** The cloud with a small status light: accent when everything is synced, red on an error. */
function SyncBadge({ onOpen }: { onOpen: () => void }) {
  const { state } = useSync()
  if (state.status === 'unconfigured') return null
  const label = statusText(state)
  const light =
    state.status === 'error'
      ? 'bg-red-500'
      : state.status === 'synced' && state.pending === 0
        ? 'bg-nx-accent'
        : state.status === 'syncing'
          ? 'animate-pulse bg-nx-muted'
          : 'bg-nx-muted'
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Synchronisatie: ${label}`}
      title={label}
      className={`relative grid size-8 place-items-center rounded-md hover:bg-nx-surface hover:text-nx-text ${state.status === 'error' ? 'text-red-500' : 'text-nx-muted'}`}
    >
      <CloudIcon className="size-[18px]" />
      <span aria-hidden className={`absolute right-1.5 bottom-1.5 size-1.5 rounded-full ring-2 ring-nx-surface-2 ${light}`} />
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
      className={`relative grid size-8 place-items-center rounded-md hover:bg-nx-surface hover:text-nx-text ${state.unread > 0 ? 'text-nx-text' : 'text-nx-muted'}`}
    >
      <BellIcon className="size-[18px]" />
      {state.unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-nx-accent px-1 text-[10px] leading-4 font-semibold text-nx-accent-text ring-2 ring-nx-surface-2">
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
      aria-label={installing ? 'Bijwerken…' : `Bijwerken naar ${update.update.version}`}
      className="flex h-7 items-center gap-1.5 rounded-[5px] bg-nx-accent px-2 text-xs font-medium text-nx-accent-text disabled:opacity-70"
    >
      <UpdateIcon className="size-4 shrink-0" />
      <span className="@max-[1000px]:sr-only">{installing ? 'Bijwerken…' : `Bijwerken naar ${update.update.version}`}</span>
    </button>
  )
}
