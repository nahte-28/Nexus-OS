import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { APP_GROUP, APP_GROUPS, type AppId } from '@nexus/core'
import { useVisibleApps, type AppDefinition } from '../apps/registry'
import { favoritesStore, useFavorites } from '../controlcenter/store'
import { useRecentApps } from '../apps/usage'
import { useProfiles } from '../profiles/store'
import { NexusGlyph } from '../shell/NexusMark'
import { PowerIcon, SearchIcon, TerminalIcon } from '../apps/icons'
import { filterLinuxApps, installNexusOs, openLinuxApp, sessionPower, useLinuxApps, useLiveSystem, useNexusSession, type PowerAction } from '../platform/session'

interface Props {
  onClose: () => void
  onOpenApp: (id: AppId) => void
  /** Opens Zoeken overal (Ctrl+K) with what you typed here. */
  onSearch?: (query: string) => void
}

const RECENT_SHOWN = 6
const GROUP_TITLE = new Map(APP_GROUPS.map((g) => [g.id, g.title]))

/**
 * Start 2.0: a header with the NEXUS mark and your profile, search on top, then your favourites,
 * what you opened recently and all apps in the profile's order. Typing turns the body into results
 * (apps, Linux apps, and a step to Zoeken overal). Arrow keys walk through everything you can open.
 */
export function StartMenu({ onClose, onOpenApp, onSearch }: Props) {
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const visible = useVisibleApps()
  const q = query.trim().toLowerCase()
  const results = q ? visible.filter((a) => a.title.toLowerCase().includes(q)) : visible
  const linux = useLinuxApps()
  // Linux apps only show while searching, so the menu stays NEXUS's own.
  const linuxResults = q ? filterLinuxApps(linux.apps, query).slice(0, 6) : []
  const session = useNexusSession()
  const favorites = useFavorites()
  const recent = useRecentApps()
  const live = useLiveSystem()
  const { state, active } = useProfiles()
  const [error, setError] = useState<string | null>(null)

  const byId = new Map(visible.map((a) => [a.id, a]))
  const favoriteApps = favorites.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
  const recentApps = recent.filter((id) => !favorites.includes(id)).flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])).slice(0, RECENT_SHOWN)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement
      if (!ref.current?.contains(target) && !target.closest('[aria-label="Start"]')) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [onClose])

  const openLinux = (id: string) => void openLinuxApp(id).then(onClose, (err) => setError(String(err)))
  const searchEverywhere = () => {
    onSearch?.(query.trim())
    onClose()
  }

  // Up and down walk through every item you can open; up from the first one goes back to the search box.
  const onMenuKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    if (items.length === 0) return
    const at = items.indexOf(document.activeElement as HTMLElement)
    e.preventDefault()
    if (e.key === 'ArrowDown') items[at < 0 ? 0 : Math.min(at + 1, items.length - 1)].focus()
    else if (at <= 0) inputRef.current?.focus()
    else items[at - 1].focus()
  }

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Startmenu"
      onKeyDown={onMenuKeyDown}
      className="nx-window nx-enter-menu absolute bottom-full left-2 mb-2 flex h-[min(42rem,calc(100dvh-4.5rem))] w-[min(36rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-xl border border-nx-border"
    >
      <div className="nx-board shrink-0 border-b border-nx-border px-4 pt-4 pb-3">
        <div className="mb-3 flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-nx-accent text-nx-accent-text shadow-sm">
            <NexusGlyph className="size-[22px]" />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-[15px] font-extrabold tracking-[0.08em]">NEXUS</p>
            <p className="truncate text-xs text-nx-muted">
              {state.about.name ? `Hoi ${state.about.name} · ` : ''}Profiel {active.name}
            </p>
          </div>
        </div>
        <div className="relative">
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-nx-muted" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              if (q && results[0]) onOpenApp(results[0].id)
              else if (linuxResults[0]) openLinux(linuxResults[0].id)
              else if (q && onSearch) searchEverywhere()
            }}
            placeholder="Zoek een app…"
            aria-label="Zoek apps"
            className="h-10 w-full rounded-lg border border-nx-border bg-nx-surface pr-3 pl-9 text-sm outline-none placeholder:text-nx-muted"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3">
        {q ? (
          <>
            <Section title="Apps" count={results.length}>
              {results.length > 0 ? (
                <ul className="space-y-0.5">
                  {results.map((app, i) => (
                    <li key={app.id}>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => onOpenApp(app.id)}
                        className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-nx-surface-2 ${i === 0 ? 'bg-nx-surface-2' : ''}`}
                      >
                        <AppTile app={app} />
                        <span className="min-w-0 flex-1 truncate font-medium">{app.title}</span>
                        <span className="shrink-0 text-xs text-nx-muted">{GROUP_TITLE.get(APP_GROUP[app.id])}</span>
                        {i === 0 && <Kbd>Enter</Kbd>}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-1 text-sm text-nx-muted">Geen apps met “{query.trim()}”.</p>
              )}
            </Section>
            {linuxResults.length > 0 && (
              <Section title="Linux-apps">
                <ul className="space-y-0.5">
                  {linuxResults.map((app) => (
                    <li key={app.id}>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => openLinux(app.id)}
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-nx-surface-2"
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-md border border-nx-border bg-nx-surface-2">
                          <TerminalIcon className="size-4 text-nx-accent" />
                        </span>
                        <span className="truncate">{app.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {onSearch && (
              <button
                type="button"
                role="menuitem"
                onClick={searchEverywhere}
                className="flex w-full items-center gap-3 rounded-lg border border-dashed border-nx-border px-2 py-2 text-left text-sm hover:bg-nx-surface-2"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-nx-surface-2">
                  <SearchIcon className="size-4 text-nx-accent" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">Zoek overal naar “{query.trim()}”</span>
                  <span className="block text-xs text-nx-muted">Notities, bestanden, agenda en herinneringen</span>
                </span>
                <Kbd>Ctrl K</Kbd>
              </button>
            )}
          </>
        ) : (
          <>
            <Section title="Favorieten">
              {favoriteApps.length > 0 ? (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(5.75rem,1fr))] gap-1.5">
                  {favoriteApps.map((app) => (
                    <li key={app.id}>
                      <button
                        type="button"
                        role="menuitem"
                        aria-label={`${app.title} (favoriet)`}
                        onClick={() => onOpenApp(app.id)}
                        data-trace="bottom"
                        className="nx-lift flex w-full flex-col items-center gap-1.5 rounded-lg border border-nx-border bg-nx-surface-2 px-1.5 pt-3 pb-2.5 text-xs font-medium hover:border-nx-accent"
                      >
                        <app.icon aria-hidden className="size-6 text-nx-accent" />
                        <span className="w-full truncate text-center">{app.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-1 text-sm text-nx-muted">Nog geen favorieten. Zet er een met de ster bij Alle apps.</p>
              )}
            </Section>
            {recentApps.length > 0 && (
              <Section title="Recent">
                <ul className="flex flex-wrap gap-1">
                  {recentApps.map((app) => (
                    <li key={app.id}>
                      <button
                        type="button"
                        role="menuitem"
                        aria-label={`${app.title} (recent)`}
                        onClick={() => onOpenApp(app.id)}
                        className="flex h-8 items-center gap-2 rounded-md border border-nx-border px-2.5 text-[13px] hover:bg-nx-surface-2"
                      >
                        <app.icon aria-hidden className="size-4 text-nx-muted" />
                        {app.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            <Section title="Alle apps" count={visible.length} label="Alle apps">
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(5.75rem,1fr))] gap-0.5">
                {visible.map((app) => (
                  <AllAppsItem key={app.id} app={app} favorite={favorites.includes(app.id)} onOpen={() => onOpenApp(app.id)} />
                ))}
              </ul>
            </Section>
          </>
        )}
      </div>

      {(error || live || session) && (
        <div className="shrink-0 space-y-2 border-t border-nx-border bg-nx-surface-2 px-3 py-2">
          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}
          {live && (
            <button
              type="button"
              role="menuitem"
              onClick={() => installNexusOs().then(onClose, (err) => setError(String(err)))}
              className="w-full rounded-lg bg-nx-accent px-3 py-2 text-left text-sm font-medium text-nx-accent-text"
            >
              NEXUS OS installeren
              <span className="block text-xs font-normal opacity-80">Je draait nu vanaf de usb-stick. Wachtwoord: live</span>
            </button>
          )}
          {session && <PowerRow onError={setError} />}
        </div>
      )}
    </div>
  )
}

/** A heading with a thin rule after it, then its items. `label` makes it a named group (tests and screen readers). */
function Section({ title, count, label, children }: { title: string; count?: number; label?: string; children: ReactNode }) {
  return (
    <section role={label ? 'group' : undefined} aria-label={label}>
      <h2 className="mb-1.5 flex items-center gap-2 px-1 text-xs font-semibold text-nx-muted">
        {title}
        {count !== undefined && <span className="font-normal tabular-nums">{count}</span>}
        <span aria-hidden className="h-px flex-1 bg-nx-border" />
      </h2>
      {children}
    </section>
  )
}

function AppTile({ app }: { app: AppDefinition }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-md border border-nx-border bg-nx-surface">
      <app.icon aria-hidden className="size-4 text-nx-accent" />
    </span>
  )
}

const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="shrink-0 rounded border border-nx-border bg-nx-surface px-1.5 py-0.5 font-sans text-[11px] text-nx-muted">{children}</kbd>
)

function AllAppsItem({ app, favorite, onOpen }: { app: AppDefinition; favorite: boolean; onOpen: () => void }) {
  return (
    <li className="group relative">
      <button
        type="button"
        role="menuitem"
        onClick={onOpen}
        onContextMenu={(e) => {
          e.preventDefault()
          favoritesStore.toggle(app.id)
        }}
        className="flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 text-xs hover:bg-nx-surface-2"
      >
        <app.icon aria-hidden className="size-5 text-nx-accent" />
        <span className="w-full truncate text-center">{app.title}</span>
      </button>
      {app.id !== 'controlcenter' && (
        <button
          type="button"
          aria-pressed={favorite}
          aria-label={favorite ? `${app.title} uit je favorieten` : `${app.title} bij je favorieten`}
          title={favorite ? 'Uit je favorieten (taakbalk en bureaublad)' : 'Bij je favorieten (taakbalk en bureaublad)'}
          onClick={() => favoritesStore.toggle(app.id)}
          className={`absolute top-0.5 right-0.5 grid size-6 place-items-center rounded-md text-sm leading-none hover:bg-nx-surface focus-visible:opacity-100 ${
            favorite ? 'text-nx-accent' : 'text-nx-muted opacity-0 group-hover:opacity-100'
          }`}
        >
          <span aria-hidden>{favorite ? '★' : '☆'}</span>
        </button>
      )}
    </li>
  )
}

const POWER: Array<{ action: PowerAction; label: string; confirm?: string }> = [
  { action: 'logout', label: 'Afmelden', confirm: 'Afmelden? Open Linux-apps sluiten.' },
  { action: 'suspend', label: 'Slaapstand' },
  { action: 'reboot', label: 'Opnieuw opstarten', confirm: 'Opnieuw opstarten?' },
  { action: 'poweroff', label: 'Uitschakelen', confirm: 'Uitschakelen?' },
]

/** In the NEXUS session, NEXUS is the desktop, so logging out and shutting down live here. */
function PowerRow({ onError }: { onError: (error: string) => void }) {
  const [asking, setAsking] = useState<PowerAction | null>(null)
  const ask = POWER.find((p) => p.action === asking)
  const run = (action: PowerAction) => {
    setAsking(null)
    sessionPower(action).catch((err) => onError(String(err)))
  }
  return ask ? (
    <div className="flex items-center gap-2 text-sm">
      <span className="flex-1">{ask.confirm}</span>
      <button type="button" onClick={() => run(ask.action)} className="rounded-lg bg-nx-accent px-3 py-1 font-medium text-nx-accent-text">
        Ja
      </button>
      <button type="button" onClick={() => setAsking(null)} className="rounded-lg border border-nx-border px-3 py-1 hover:bg-nx-surface">
        Nee
      </button>
    </div>
  ) : (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <PowerIcon aria-hidden className="mr-auto size-4 text-nx-muted" />
      {POWER.map((p) => (
        <button
          key={p.action}
          type="button"
          role="menuitem"
          onClick={() => (p.confirm ? setAsking(p.action) : run(p.action))}
          className="rounded-lg px-2 py-1 text-xs hover:bg-nx-surface"
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
