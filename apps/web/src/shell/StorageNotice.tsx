import { useFeature } from '../features/store'
import { closeStorageNotice, useStorageNotice } from '../state/storageHealth'
import { openApp } from './openApp'

/**
 * Says so when a save on this device failed because the browser's storage is full, in both shells.
 * Before, such a change was lost without a word.
 */
export function StorageNotice({ bottom }: { bottom: number }) {
  const show = useStorageNotice()
  const offlineCenter = useFeature('offline')
  if (!show) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-3" style={{ bottom }}>
      <div role="alert" className="nx-glass nx-enter-toast-up pointer-events-auto flex max-w-md flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-nx-border px-4 py-2 text-sm shadow">
        <p>
          <span className="font-semibold">Opslaan lukte niet.</span> De opslag van je browser zit vol, dus je laatste wijziging is misschien niet bewaard op dit toestel.
        </p>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={closeStorageNotice} className="rounded-md px-3 py-1.5 text-sm text-nx-muted hover:bg-nx-surface-2">
            Sluiten
          </button>
          {offlineCenter && (
            <button
              type="button"
              onClick={() => {
                closeStorageNotice()
                openApp('offline')
              }}
              className="rounded-md bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text"
            >
              Bekijk opslag
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
