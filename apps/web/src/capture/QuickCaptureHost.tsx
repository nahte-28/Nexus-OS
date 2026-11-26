import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react'
import { QuickNoteIcon } from '../apps/icons'
import { isDesktopApp } from '../platform/desktop'
import { captureState, openCapture } from './open'

// Small on purpose: the shell needs only this; the Snelle notitie window loads the first time it opens.

/** Opens Snelle notitie on Alt+N (or Ctrl+Shift+Space) from anywhere in NEXUS. */
export function useCaptureShortcut() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyN') || (e.ctrlKey && e.shiftKey && !e.altKey && e.code === 'Space')) {
        e.preventDefault()
        openCapture()
      }
    }
    document.addEventListener('keydown', onKey)
    // In the Windows/Linux app the same Ctrl+Shift+Space works from any program (shortcut.rs).
    let stop: (() => void) | undefined
    let gone = false
    if (isDesktopApp) {
      void import('@tauri-apps/api/event').then(({ listen }) =>
        listen(QUICK_CAPTURE_EVENT, () => openCapture()).then((unlisten) => {
          if (gone) unlisten()
          else stop = unlisten
        }),
      )
    }
    return () => {
      gone = true
      stop?.()
      document.removeEventListener('keydown', onKey)
    }
  }, [])
}

/** Sent by the desktop app when Ctrl+Shift+Space is pressed in another program. */
export const QUICK_CAPTURE_EVENT = 'nexus-quick-capture'

export function CaptureButton({ className = '' }: { className?: string }) {
  return (
    <button
      type="button"
      aria-label="Snelle notitie (Alt+N)"
      title="Snelle notitie (Alt+N)"
      onClick={() => openCapture()}
      className={`grid size-10 place-items-center rounded-lg text-nx-muted hover:bg-nx-surface-2 ${className}`}
    >
      <QuickNoteIcon className="size-5" />
    </button>
  )
}

const QuickCapture = lazy(() => import('./QuickCapture').then((m) => ({ default: m.QuickCapture })))

/** Snelle notitie in the shell: nothing is loaded until it opens for the first time. */
export function QuickCaptureHost() {
  const { open } = useSyncExternalStore(captureState.subscribe, captureState.getSnapshot)
  if (!open) return null
  return (
    <Suspense fallback={null}>
      <QuickCapture />
    </Suspense>
  )
}
