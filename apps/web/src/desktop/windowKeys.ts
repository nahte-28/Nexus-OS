import { useEffect, useRef, type Dispatch } from 'react'
import { windowCommand, windowCommandActions, type WindowAction, type WindowsState } from '@nexus/core'

/** The desktop windows by keyboard: Alt+² to switch, Alt+Shift+arrows to place, Alt+Shift+W to close. */
export function useWindowKeys(state: WindowsState, dispatch: Dispatch<WindowAction>, area: () => { width: number; height: number }): void {
  const latest = useRef(state)
  latest.current = state
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const command = windowCommand(e)
      if (!command) return
      const actions = windowCommandActions(command, latest.current, area())
      if (actions.length === 0) return
      e.preventDefault()
      actions.forEach(dispatch)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch, area])
}
