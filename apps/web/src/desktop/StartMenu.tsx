import { useEffect, useRef, useState } from 'react'
import type { AppId } from '@nexus/core'
import { useVisibleApps } from '../apps/registry'
import { PowerIcon, TerminalIcon } from '../apps/icons'
import { filterLinuxApps, openLinuxApp, sessionPower, useLinuxApps, useNexusSession, type PowerAction } from '../platform/session'

interface Props {
  onClose: () => void
  onOpenApp: (id: AppId) => void
}

export function StartMenu({ onClose, onOpenApp }: Props) {
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const results = useVisibleApps().filter((a) => a.title.toLowerCase().includes(query.trim().toLowerCase()))
  const linux = useLinuxApps()
  // Linux apps only show while searching, so the menu stays NEXUS's own.
  const linuxResults = query.trim() ? filterLinuxApps(linux.apps, query).slice(0, 6) : []
  const session = useNexusSession()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement
      if (!ref.current?.contains(target) && !target.closest('[aria-label="Start"]')) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Startmenu"
      className="nx-glass absolute bottom-full left-2 mb-2 w-80 rounded-xl border border-nx-border p-3"
    >
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          if (results[0]) onOpenApp(results[0].id)
          else if (linuxResults[0]) void openLinuxApp(linuxResults[0].id).then(onClose, (err) => setError(String(err)))
        }}
        placeholder="Zoek apps…"
        aria-label="Zoek apps"
        className="w-full rounded-lg border border-nx-border bg-nx-surface-2 px-3 py-2 text-sm outline-none placeholder:text-nx-muted"
      />
      <ul className="mt-3 grid grid-cols-3 gap-1">
        {results.map((app) => (
          <li key={app.id}>
            <button
              type="button"
              role="menuitem"
              onClick={() => onOpenApp(app.id)}
              className="flex w-full flex-col items-center gap-1 rounded-lg p-2 text-xs hover:bg-nx-surface-2"
            >
              <app.icon className="text-nx-accent" />
              {app.title}
            </button>
          </li>
        ))}
        {results.length === 0 && linuxResults.length === 0 && <li className="col-span-3 p-2 text-sm text-nx-muted">Geen apps gevonden.</li>}
      </ul>
      {linuxResults.length > 0 && (
        <>
          <p className="mt-3 px-1 text-xs font-semibold text-nx-muted">Linux-apps</p>
          <ul className="mt-1 space-y-0.5">
            {linuxResults.map((app) => (
              <li key={app.id}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void openLinuxApp(app.id).then(onClose, (err) => setError(String(err)))}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-nx-surface-2"
                >
                  <TerminalIcon className="size-4 shrink-0 text-nx-accent" />
                  <span className="truncate">{app.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-500">{error}</p>}
      {session && <PowerRow onError={setError} />}
    </div>
  )
}

const POWER: Array<{ action: PowerAction; label: string; confirm?: string }> = [
  { action: 'logout', label: 'Afmelden', confirm: 'Afmelden? Open Linux-apps sluiten.' },
  { action: 'suspend', label: 'Slaapstand' },
  { action: 'reboot', label: 'Opnieuw opstarten', confirm: 'Opnieuw opstarten?' },
  { action: 'poweroff', label: 'Uitschakelen', confirm: 'Uitschakelen?' },
]

/** In the NEXUS session, NEXUS is the desktop, so logging out and shutting down live here. */
function PowerRow({ onError }: { onError: (error: string) => void }) {
  const [asking, setAsking] = useState<PowerAction | null>(null)
  const ask = POWER.find((p) => p.action === asking)
  const run = (action: PowerAction) => {
    setAsking(null)
    sessionPower(action).catch((err) => onError(String(err)))
  }
  return (
    <div className="mt-3 border-t border-nx-border pt-2">
      {ask ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="flex-1">{ask.confirm}</span>
          <button type="button" onClick={() => run(ask.action)} className="rounded-lg bg-nx-accent px-3 py-1 font-medium text-nx-accent-text">
            Ja
          </button>
          <button type="button" onClick={() => setAsking(null)} className="rounded-lg border border-nx-border px-3 py-1 hover:bg-nx-surface-2">
            Nee
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          <PowerIcon className="mr-1 size-4 text-nx-muted" />
          {POWER.map((p) => (
            <button
              key={p.action}
              type="button"
              role="menuitem"
              onClick={() => (p.confirm ? setAsking(p.action) : run(p.action))}
              className="rounded-lg px-2 py-1 text-xs hover:bg-nx-surface-2"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
