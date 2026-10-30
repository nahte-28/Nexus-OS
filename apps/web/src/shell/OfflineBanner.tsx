import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
}

/**
 * Says so when the device is offline, in both shells. Everything on the device keeps working; what
 * needs the internet waits and catches up by itself. A live region, so screen readers hear it too.
 */
export function OfflineBanner({ bottom }: { bottom: number }) {
  const online = useOnline()
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-3" style={{ bottom }}>
      {!online && (
        <p className="nx-glass max-w-md rounded-full border border-nx-border px-4 py-1.5 text-center text-xs shadow">
          <span className="font-semibold">Offline.</span> Alles op dit toestel blijft werken; sync, NEXUS AI en Connect gaan verder zodra je weer online bent.
        </p>
      )}
    </div>
  )
}
