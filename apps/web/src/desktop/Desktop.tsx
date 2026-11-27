import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { openRect, type AppId } from '@nexus/core'
import { SpaceSuggestion } from '../spaces/Suggestion'
import { setAppOpener } from '../shell/openApp'
import { OfflineBanner } from '../shell/OfflineBanner'
import { UpdatePrompt } from '../shell/UpdatePrompt'
import { StorageNotice } from '../shell/StorageNotice'
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
import { useWindowKeys } from './windowKeys'
import { useWindowSession } from './session'
import { useFavorites } from '../controlcenter/store'
import { mostUsed, usageStore, useUsage } from '../apps/usage'

// Loads when you open it (Ctrl+K), not with the desktop.
// After an update; it carries the whole changelog, so it loads after the first screen.
const WhatsNew = lazy(() => import('../shell/WhatsNew').then((m) => ({ default: m.WhatsNew })))
const SearchPalette = lazy(() => import('../search/SearchPalette').then((m) => ({ default: m.SearchPalette })))

/** The part of the screen windows live in, above the taskbar. */
const desktopArea = () => ({ width: window.innerWidth, height: window.innerHeight - TASKBAR_HEIGHT })

export function Desktop() {
  const { state, dispatch } = useWindows()
  const apps = useVisibleApps()
  // null: closed; otherwise what to search for (empty from Ctrl+K, your words from Start).
  const [searching, setSearching] = useState<string | null>(null)
  const openSearch = useCallback((query = '') => setSearching(query), [])
  useSearchShortcut(openSearch)
  useCaptureShortcut()

  const openApp = useCallback(
    (appId: AppId) => {
      const app = getApp(appId)
      usageStore.record(appId)
      if (app.launch) return app.launch()
      const area = { width: window.innerWidth, height: window.innerHeight - TASKBAR_HEIGHT }
      dispatch({ type: 'open', appId, title: app.title, rect: placeOf(appId, area) ?? openRect(app.defaultSize, area, state.windows.length, app.fill) })
    },
    [dispatch, state.windows.length],
  )

  // The windows that were open last time come back first; links that open an app land on top.
  useWindowSession(state, dispatch, apps, desktopArea)

  // Switch, place and close windows with the keyboard.
  useWindowKeys(state, dispatch, desktopArea)

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
      {searching !== null && (
        <Suspense fallback={null}>
          <SearchPalette initialQuery={searching} onClose={() => setSearching(null)} onOpenApp={openApp} />
        </Suspense>
      )}
      <Tour onOpenApp={openApp} />
      <QuickCaptureHost />
      <OfflineBanner bottom={TASKBAR_HEIGHT + 8} />
      <UpdatePrompt bottom={TASKBAR_HEIGHT + 8} />
      <StorageNotice bottom={TASKBAR_HEIGHT + 8} />
      <Suspense fallback={null}>
        <WhatsNew bottom={TASKBAR_HEIGHT + 8} />
      </Suspense>
      <AskName />
    </div>
  )
}

/**
 * Op het bureaublad, rechts in de bovenste rij (Dashboard 2.0): je favorieten en de apps die je het
 * vaakst opent, als één rustige strook. Alle apps staan onder het NEXUS-teken (Start); daar zet je
 * met de ster een app bij je favorieten.
 */
function HomeShortcuts({ apps, onOpenApp }: { apps: AppDefinition[]; onOpenApp: (id: AppId) => void }) {
  const favorites = useFavorites()
  const usage = useUsage()
  const byId = new Map(apps.map((a) => [a.id, a]))
  const favoriteApps = favorites.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
  const used = mostUsed(
    usage,
    apps.filter((a) => !favorites.includes(a.id)),
    5,
  )
  const rows = [
    { id: 'favorites', title: 'Favorieten', apps: favoriteApps },
    { id: 'used', title: 'Meest gebruikt', apps: used },
  ].filter((r) => r.apps.length > 0)
  if (rows.length === 0) {
    return <p className="text-xs text-nx-muted">Al je apps staan onder het NEXUS-teken linksonder. Met de ster zet je een app bij je favorieten.</p>
  }
  return (
    <nav aria-label="Apps" className="nx-tile-quiet flex items-center rounded-lg border border-nx-border p-1" title="Alle apps: het NEXUS-teken linksonder">
      {rows.map((row, i) => (
        <section key={row.id} aria-label={row.title} className="flex items-center">
          {i > 0 && <span aria-hidden className="mx-1 h-6 w-px bg-nx-border" />}
          <h2 className="sr-only">{row.title}</h2>
          <ul className="flex gap-0.5">
            {row.apps.map((app) => (
              <li key={app.id}>
                <button
                  type="button"
                  onClick={() => onOpenApp(app.id)}
                  aria-label={app.title}
                  title={app.title}
                  data-trace="bottom"
                  className="grid size-8 place-items-center rounded-md text-nx-muted hover:bg-nx-surface-2 hover:text-nx-accent [&>svg]:size-[18px]"
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
