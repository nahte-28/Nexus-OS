import { rememberedRect, type AppId, type Rect } from '@nexus/core'

/** Where each app's window was last: it opens there again, at that size. Only on this device. */
const KEY = 'nexus.windows.places'

function readAll(): Record<string, unknown> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown
    return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export function rememberPlace(appId: AppId, rect: Rect): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [appId]: rect }))
  } catch {
    // Private window: the window opens at its usual place next time.
  }
}

export const placeOf = (appId: AppId, area: { width: number; height: number }): Rect | null => rememberedRect(readAll()[appId], area)

