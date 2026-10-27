import { useCallback } from 'react'
import type { AppId } from '@nexus/core'
import { getApp, useVisibleApps, type AppDefinition } from '../apps/registry'
import { Dashboard } from '../profiles/Dashboard'
import { useProfiles } from '../profiles/store'
import { useWindows } from '../state/WindowsContext'
import { Taskbar, TASKBAR_HEIGHT } from './Taskbar'
import { Window } from './Window'

const SIDEBAR_WIDTH = 224

export function Desktop() {
  const { state, dispatch } = useWindows()
  const apps = useVisibleApps()

  const openApp = useCallback(
    (appId: AppId) => {
      const app = getApp(appId)
      if (app.launch) return app.launch()
      const offset = (state.windows.length % 6) * 32
      const width = Math.min(app.defaultSize.width, window.innerWidth - SIDEBAR_WIDTH - 40)
      const height = Math.min(app.defaultSize.height, window.innerHeight - TASKBAR_HEIGHT - 40)
      dispatch({ type: 'open', appId, title: app.title, rect: { x: 40 + offset, y: 40 + offset, width, height } })
    },
    [dispatch, state.windows.length],
  )

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
        </main>
      </div>
      <Taskbar onOpenApp={openApp} />
    </div>
  )
}

/** Brand, the active profile and its apps. Switching profiles happens in the Profielen app. */
function Sidebar({ apps, onOpenApp }: { apps: AppDefinition[]; onOpenApp: (id: AppId) => void }) {
  const { active } = useProfiles()
  return (
    <aside style={{ width: SIDEBAR_WIDTH }} className="nx-glass flex shrink-0 flex-col gap-4 overflow-y-auto border-r border-nx-border p-3">
      <div className="px-2 pt-1">
        <p className="text-lg font-bold tracking-wide text-nx-accent">NEXUS</p>
        <p className="text-xs text-nx-muted">{active.name} Mode</p>
      </div>
      <nav aria-label="Apps">
        <ul className="space-y-0.5">
          {apps.map((app) => (
            <li key={app.id}>
              <button
                type="button"
                onClick={() => onOpenApp(app.id)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-nx-surface-2"
              >
                <span className="text-nx-accent [&>svg]:size-5">
                  <app.icon />
                </span>
                {app.title}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}
