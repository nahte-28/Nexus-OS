import { useState } from 'react'
import { applyUpdate, dismissUpdate, useUpdateWaiting } from './swUpdate'

/**
 * Says so when a new version of NEXUS is ready, in both shells. "Bijwerken" switches to it at once
 * (one reload, no manual refresh); "Later" keeps working on this version until the next start.
 */
export function UpdatePrompt({ bottom }: { bottom: number }) {
  const waiting = useUpdateWaiting()
  const [busy, setBusy] = useState(false)
  if (!waiting) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-3" style={{ bottom }}>
      <div role="status" aria-live="polite" className="nx-glass nx-enter-toast-up pointer-events-auto flex max-w-md flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-nx-border px-4 py-2 text-sm shadow">
        <p>
          <span className="font-semibold">Nieuwe versie van NEXUS.</span> Bijwerken duurt een paar seconden; wat je bewaarde, blijft staan.
        </p>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={dismissUpdate} className="rounded-md px-3 py-1.5 text-sm text-nx-muted hover:bg-nx-surface-2">
            Later
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void applyUpdate()
            }}
            className="rounded-md bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60"
          >
            {busy ? 'Bijwerken…' : 'Bijwerken'}
          </button>
        </div>
      </div>
    </div>
  )
}
