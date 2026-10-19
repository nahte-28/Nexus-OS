import { useEffect, useRef, useState } from 'react'
import type { AppId } from '@nexus/core'
import { APPS } from '../apps/registry'

interface Props {
  onClose: () => void
  onOpenApp: (id: AppId) => void
}

export function StartMenu({ onClose, onOpenApp }: Props) {
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const results = APPS.filter((a) => a.title.toLowerCase().includes(query.trim().toLowerCase()))

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
        onKeyDown={(e) => e.key === 'Enter' && results[0] && onOpenApp(results[0].id)}
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
        {results.length === 0 && <li className="col-span-3 p-2 text-sm text-nx-muted">Geen apps gevonden.</li>}
      </ul>
    </div>
  )
}
