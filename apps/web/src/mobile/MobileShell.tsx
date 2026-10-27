import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { AppId } from '@nexus/core'
import { getApp, useVisibleApps } from '../apps/registry'
import { BackIcon, GridIcon } from '../apps/icons'
import { ErrorBoundary } from '../devtools/ErrorBoundary'
import { Dashboard } from '../profiles/Dashboard'
import { SearchButton, SearchPalette, useSearchShortcut } from '../search/SearchPalette'

/** Phone layout: app grid, full-screen apps and a bottom navigation bar. */
export function MobileShell() {
  const [openId, setOpenId] = useState<AppId | null>(null)
  const app = openId ? getApp(openId) : null
  const apps = useVisibleApps()
  const [searching, setSearching] = useState(false)
  const openSearch = useCallback(() => setSearching(true), [])
  useSearchShortcut(openSearch)

  // Android back button / gesture returns to the app grid instead of leaving NEXUS.
  useEffect(() => {
    const onPop = () => setOpenId(null)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const open = (id: AppId) => {
    const launch = getApp(id).launch
    if (launch) return launch()
    history.pushState({ app: id }, '')
    setOpenId(id)
  }
  // Switching between apps replaces the current entry so one back press always returns home.
  const switchTo = (id: AppId) => {
    if (openId === id) return
    const launch = getApp(id).launch
    if (launch) return launch()
    if (openId) setOpenId(id)
    else open(id)
  }
  const goHome = () => {
    if (openId) history.back()
  }

  return (
    <div className="nx-wallpaper flex h-full flex-col">
      <header className="nx-glass nx-safe-top flex h-14 shrink-0 items-center gap-2 border-b border-nx-border px-2">
        {app ? (
          <button type="button" aria-label="Terug" onClick={goHome} className="grid size-11 place-items-center rounded-lg">
            <BackIcon />
          </button>
        ) : (
          <span className="pl-2 font-semibold tracking-wide text-nx-accent">NEXUS</span>
        )}
        <h1 className="min-w-0 flex-1 truncate font-medium">{app?.title ?? ''}</h1>
        <SearchButton onClick={openSearch} className="size-11" />
      </header>
      {searching && <SearchPalette onClose={() => setSearching(false)} onOpenApp={switchTo} />}

      <main className="min-h-0 flex-1 overflow-auto">
        {app ? (
          <div className="nx-glass h-full">
            <ErrorBoundary key={app.id} name={app.title}>
              <app.component />
            </ErrorBoundary>
          </div>
        ) : (
          <>
            <Dashboard compact onOpenApp={open} />
            <ul className="grid grid-cols-4 gap-y-6 p-5" aria-label="Apps">
              {apps.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => open(a.id)} className="flex w-full flex-col items-center gap-2 text-xs">
                    <span className="nx-glass grid size-14 place-items-center rounded-2xl border border-nx-border text-nx-accent">
                      <a.icon />
                    </span>
                    {a.title}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>

      <nav aria-label="Navigatie" className="nx-glass nx-safe-bottom flex shrink-0 justify-around border-t border-nx-border">
        <NavButton label="Apps" active={!app} onClick={goHome}>
          <GridIcon />
        </NavButton>
        {apps.slice(0, 2).map((a) => (
          <NavButton key={a.id} label={a.title} active={openId === a.id} onClick={() => switchTo(a.id)}>
            <a.icon />
          </NavButton>
        ))}
      </nav>
    </div>
  )
}

function NavButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex h-16 flex-1 flex-col items-center justify-center gap-1 text-xs ${active ? 'text-nx-accent' : 'text-nx-muted'}`}
    >
      {children}
      {label}
    </button>
  )
}
