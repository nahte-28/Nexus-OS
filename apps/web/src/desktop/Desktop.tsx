import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { groupApps, openRect, type AppId } from '@nexus/core'
import { SpaceSuggestion } from '../spaces/Suggestion'
import { setAppOpener } from '../shell/openApp'
import { OfflineBanner } from '../shell/OfflineBanner'
import { AskName } from '../shell/AskName'
import { getApp, useVisibleApps, type AppDefinition } from '../apps/registry'
import { Dashboard } from '../profiles/Dashboard'
import { useProfiles } from '../profiles/store'
import { useWindows } from '../state/WindowsContext'
import { QuickCaptureHost, useCaptureShortcut } from '../capture/QuickCaptureHost'
import { Tour } from '../onboarding/Tour'
import { useSearchShortcut } from '../search/SearchButton'
import { Taskbar, TASKBAR_HEIGHT } from './Taskbar'
import { Window } from './Window'
import { toggleGroup, useFoldedGroups } from './sidebarGroups'

export const SIDEBAR_WIDTH = 224

// Loads when you open it (Ctrl+K), not with the desktop.
// After an update; it carries the whole changelog, so it loads after the first screen.
const WhatsNew = lazy(() => import('../shell/WhatsNew').then((m) => ({ default: m.WhatsNew })))
const SearchPalette = lazy(() => import('../search/SearchPalette').then((m) => ({ default: m.SearchPalette })))

export function Desktop() {
  const { state, dispatch } = useWindows()
  const apps = useVisibleApps()
  const [searching, setSearching] = useState(false)
  const openSearch = useCallback(() => setSearching(true), [])
  useSearchShortcut(openSearch)
  useCaptureShortcut()

  const openApp = useCallback(
    (appId: AppId) => {
      const app = getApp(appId)
      if (app.launch) return app.launch()
      const area = { width: window.innerWidth - SIDEBAR_WIDTH, height: window.innerHeight - TASKBAR_HEIGHT }
      dispatch({ type: 'open', appId, title: app.title, rect: openRect(app.defaultSize, area, state.windows.length, app.fill) })
    },
    [dispatch, state.windows.length],
  )

  // Deep links from other apps (the Inbox) open windows here.
  useEffect(() => {
    setAppOpener(openApp)
    return () => setAppOpener(null)
  }, [openApp])

  return (
    <div className="nx-wallpaper relative h-full overflow-hidden">
      <div className="absolute inset-x-0 top-0 flex" style={{ bottom: TASKBAR_HEIGHT }}>
        <Sidebar apps={apps} onOpenApp={openApp} />
        <main className="relative min-w-0 flex-1 overflow-hidden" aria-label="Bureaublad">
          <div className="h-full overflow-auto">
            <Dashboard onOpenApp={openApp} />
          </div>
          {state.windows.map((win) => (
            <Window key={win.id} win={win} focused={state.focusedId === win.id} />
          ))}
          <SpaceSuggestion />
        </main>
      </div>
      <Taskbar onOpenApp={openApp} onSearch={openSearch} />
      {searching && (
        <Suspense fallback={null}>
          <SearchPalette onClose={() => setSearching(false)} onOpenApp={openApp} />
        </Suspense>
      )}
      <Tour onOpenApp={openApp} />
      <QuickCaptureHost />
      <OfflineBanner bottom={TASKBAR_HEIGHT + 8} />
      <Suspense fallback={null}>
        <WhatsNew bottom={TASKBAR_HEIGHT + 8} />
      </Suspense>
      <AskName />
    </div>
  )
}

/** Brand, the active profile and its apps in groups you can fold away. Switching profiles happens in the Profielen app. */
function Sidebar({ apps, onOpenApp }: { apps: AppDefinition[]; onOpenApp: (id: AppId) => void }) {
  const { active } = useProfiles()
  const folded = useFoldedGroups()
  return (
    <aside style={{ width: SIDEBAR_WIDTH }} className="nx-glass flex shrink-0 flex-col gap-4 overflow-y-auto border-r border-nx-border p-3">
      <div className="px-2 pt-1">
        <p className="text-lg font-bold tracking-wide text-nx-accent">NEXUS</p>
        <p className="text-xs text-nx-muted">{active.name} Mode</p>
      </div>
      <nav aria-label="Apps" className="space-y-2">
        {groupApps(apps).map((group) => {
          const open = !folded.includes(group.id)
          return (
            <section key={group.id} aria-label={group.title}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggleGroup(group.id)}
                className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-nx-muted hover:bg-nx-surface-2"
              >
                {group.title}
                <span aria-hidden="true" className={`transition ${open ? 'rotate-90' : ''}`}>
                  ›
                </span>
              </button>
              {open && (
                <ul className="mt-0.5 space-y-0.5">
                  {group.apps.map((app) => (
                    <li key={app.id}>
                      <button
                        type="button"
                        onClick={() => onOpenApp(app.id)}
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-nx-surface-2"
                      >
                        <span className="text-nx-accent [&>svg]:size-5">
                          <app.icon />
                        </span>
                        {app.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </nav>
    </aside>
  )
}
