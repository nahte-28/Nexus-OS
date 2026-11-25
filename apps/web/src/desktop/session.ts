import { useEffect, useRef, type Dispatch } from 'react'
import { parseWindowSession, saveWindowSession, type WindowAction, type WindowsState } from '@nexus/core'
import { getApp, type AppDefinition } from '../apps/registry'
import { readStorage, writeStorage } from '../state/storage'

const KEY = 'nexus.windows.session'
/** Dragging changes the windows on every pointer move: save once it has been still for a moment. */
const SAVE_AFTER_MS = 400

/**
 * Brings back the windows that were open when NEXUS closed, and keeps that list up to date. Call it
 * before the shell registers its app opener, so a link that opens an app at startup lands on top of
 * the restored windows instead of being replaced by them.
 */
export function useWindowSession(state: WindowsState, dispatch: Dispatch<WindowAction>, apps: AppDefinition[], area: () => { width: number; height: number }): void {
  const restored = useRef(false)

  useEffect(() => {
    if (restored.current) return
    restored.current = true
    if (state.windows.length > 0) return
    let raw: unknown = null
    try {
      raw = JSON.parse(readStorage(KEY) ?? 'null')
    } catch {
      raw = null
    }
    const available = new Set(apps.map((a) => a.id as string))
    const windows = parseWindowSession(raw, area(), (id) => available.has(id))
    if (windows.length > 0) dispatch({ type: 'restore', windows: windows.map((w) => ({ ...w, title: getApp(w.appId).title })) })
    // Only on the first render: later changes are saved below, not restored again.
  }, [])

  useEffect(() => {
    if (!restored.current) return
    const timer = setTimeout(() => writeStorage(KEY, JSON.stringify(saveWindowSession(state))), SAVE_AFTER_MS)
    return () => clearTimeout(timer)
  }, [state])
}
