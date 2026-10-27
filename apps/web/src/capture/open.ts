import { sharedText } from '@nexus/core'

/** Whether the Snelle notitie window is open, and with what text; shared by every shell. */
type Listener = () => void

let state: { open: boolean; text: string } = { open: false, text: '' }
const listeners = new Set<Listener>()
const emit = () => listeners.forEach((l) => l())

export const captureState = {
  subscribe(listener: Listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot: () => state,
}

export function openCapture(text = '') {
  state = { open: true, text }
  emit()
}

export function closeCapture() {
  state = { open: false, text: '' }
  emit()
}

/**
 * Opens Snelle notitie when NEXUS was started for it: from the app shortcut on the phone (/snel)
 * or by sharing text to NEXUS (/snel?title=…&text=…&url=…). The address goes back to / afterwards,
 * so a reload does not open it again.
 */
export function openCaptureFromUrl(location: Pick<Location, 'search' | 'pathname' | 'hash'> = window.location): boolean {
  const params = new URLSearchParams(location.search)
  if (location.pathname !== '/snel') return false
  openCapture(sharedText(params))
  history.replaceState(history.state, '', `/${location.hash}`)
  return true
}
