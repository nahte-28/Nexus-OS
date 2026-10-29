import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
import { initialWindowsState, windowsReducer, type WindowAction, type WindowsState } from '@nexus/core'

const WindowsContext = createContext<{ state: WindowsState; dispatch: Dispatch<WindowAction> } | null>(null)

export function WindowsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(windowsReducer, initialWindowsState)
  return <WindowsContext.Provider value={{ state, dispatch }}>{children}</WindowsContext.Provider>
}

export function useWindows() {
  const ctx = useContext(WindowsContext)
  if (!ctx) throw new Error('useWindows must be used inside WindowsProvider')
  return ctx
}

/** The window manager on the desktop; null on phones, which show one app at a time. */
export function useOptionalWindows() {
  return useContext(WindowsContext)
}
