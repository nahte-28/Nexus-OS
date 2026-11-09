import { useState } from 'react'
import { markChangelogSeen, takeUnseen } from '../about/seen'
import { openApp } from './openApp'

const SHOWN = 3

/**
 * After an update: says once, briefly, what is new (from Over NEXUS › Wat is er nieuw). Closing it
 * or opening Over NEXUS marks it seen on this device.
 */
export function WhatsNew({ bottom }: { bottom: number }) {
  const [entries, setEntries] = useState(() => takeUnseen())
  if (entries.length === 0) return null
  const close = () => {
    markChangelogSeen()
    setEntries([])
  }
  return (
    <section aria-label="NEXUS is bijgewerkt" className="nx-glass fixed right-3 z-50 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-nx-border p-3 text-sm shadow-lg" style={{ bottom }}>
      <h2 className="font-semibold">NEXUS is bijgewerkt</h2>
      <ul className="mt-1 ml-4 list-disc text-nx-muted">
        {entries.slice(0, SHOWN).map((e) => (
          <li key={`${e.date}|${e.title}`}>{e.title}</li>
        ))}
        {entries.length > SHOWN && <li>en nog {entries.length - SHOWN} andere</li>}
      </ul>
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" className="rounded-md px-2 py-1 hover:bg-nx-surface-2" onClick={close}>
          Sluiten
        </button>
        <button
          type="button"
          className="rounded-md bg-nx-accent px-2 py-1 text-nx-accent-text"
          onClick={() => {
            close()
            openApp('about')
          }}
        >
          Wat is er nieuw
        </button>
      </div>
    </section>
  )
}
