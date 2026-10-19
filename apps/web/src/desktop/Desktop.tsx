import { useCallback } from 'react'
import type { AppId } from '@nexus/core'
import { getApp, useVisibleApps } from '../apps/registry'
import { useWindows } from '../state/WindowsContext'
import { Taskbar, TASKBAR_HEIGHT } from './Taskbar'
import { Window } from './Window'

export function Desktop() {
  const { state, dispatch } = useWindows()
  const apps = useVisibleApps()

  const openApp = useCallback(
    (appId: AppId) => {
      const app = getApp(appId)
      const offset = (state.windows.length % 6) * 32
      const width = Math.min(app.defaultSize.width, window.innerWidth - 40)
      const height = Math.min(app.defaultSize.height, window.innerHeight - TASKBAR_HEIGHT - 40)
      dispatch({ type: 'open', appId, title: app.title, rect: { x: 120 + offset, y: 40 + offset, width, height } })
    },
    [dispatch, state.windows.length],
  )

  return (
    <div className="nx-wallpaper relative h-full overflow-hidden">
      <main className="absolute inset-x-0 top-0" style={{ bottom: TASKBAR_HEIGHT }} aria-label="Bureaublad">
        <ul className="flex h-full flex-col flex-wrap content-start gap-2 p-3">
          {apps.map((app) => (
            <li key={app.id} className="w-20">
              <button
                type="button"
                onClick={() => openApp(app.id)}
                className="flex w-full flex-col items-center gap-1 rounded-lg p-2 text-xs hover:bg-nx-surface-2"
              >
                <span className="nx-glass grid size-11 place-items-center rounded-xl border border-nx-border text-nx-accent">
                  <app.icon />
                </span>
                <span className="text-center">{app.title}</span>
              </button>
            </li>
          ))}
        </ul>

        {state.windows.map((win) => (
          <Window key={win.id} win={win} focused={state.focusedId === win.id} />
        ))}
      </main>
      <Taskbar onOpenApp={openApp} />
    </div>
  )
}
