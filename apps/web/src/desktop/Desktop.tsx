import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { groupApps, openRect, type AppId } from '@nexus/core'
import { SpaceSuggestion } from '../spaces/Suggestion'
import { setAppOpener } from '../shell/openApp'
import { OfflineBanner } from '../shell/OfflineBanner'
import { AskName } from '../shell/AskName'
import { getApp, useVisibleApps, type AppDefinition } from '../apps/registry'
import { Dashboard } from '../profiles/Dashboard'
import { useWindows } from '../state/WindowsContext'
import { QuickCaptureHost, useCaptureShortcut } from '../capture/QuickCaptureHost'
import { Tour } from '../onboarding/Tour'
import { useSearchShortcut } from '../search/SearchButton'
import { Taskbar, TASKBAR_HEIGHT } from './Taskbar'
import { Window } from './Window'
import { placeOf } from './windowPlaces'

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
      const area = { width: window.innerWidth, height: window.innerHeight - TASKBAR_HEIGHT }
      dispatch({ type: 'open', appId, title: app.title, rect: placeOf(appId, area) ?? openRect(app.defaultSize, area, state.windows.length, app.fill) })
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
        <main className="relative min-w-0 flex-1 overflow-hidden" aria-label="Bureaublad">
          <div className="h-full overflow-auto">
            <Dashboard onOpenApp={openApp} shortcuts={<HomeShortcuts apps={apps} onOpenApp={openApp} />} />
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

/**
 * Je apps staan op het bureaublad, onder de titel: per groep een rij icoontjes. Zo blijft de
 * ruimte naast je vensters helemaal vrij.
 */
function HomeShortcuts({ apps, onOpenApp }: { apps: AppDefinition[]; onOpenApp: (id: AppId) => void }) {
  return (
    <nav aria-label="Apps" className="flex flex-wrap gap-x-6 gap-y-3">
      {groupApps(apps).map((group) => (
        <section key={group.id} aria-label={group.title}>
          <h2 className="mb-1 text-xs font-semibold text-nx-muted">{group.title}</h2>
          <ul className="nx-glass flex flex-wrap gap-0.5 rounded-lg border border-nx-border p-1">
            {group.apps.map((app) => (
              <li key={app.id}>
                <button
                  type="button"
                  onClick={() => onOpenApp(app.id)}
                  aria-label={app.title}
                  title={app.title}
                  data-trace="bottom"
                  className="grid size-10 place-items-center rounded-md text-nx-muted hover:bg-nx-surface-2 hover:text-nx-accent [&>svg]:size-5"
                >
                  <app.icon />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  )
}
