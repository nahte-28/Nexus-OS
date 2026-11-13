import { useEffect, useState } from 'react'
import { PRESENCE_PING_MS, presenceLabel, presenceStatus, type PresenceEntry } from '@nexus/core'
import { supabase } from '../sync/supabase'
import { Presence } from './presence'

export const defaultPresence = supabase ? new Presence(supabase) : null

/** What friends and teammates show, refreshed every minute while the view is open. */
export function usePresence(api: Presence | null = defaultPresence): { presence: Map<string, PresenceEntry>; now: number } {
  const [presence, setPresence] = useState<Map<string, PresenceEntry>>(new Map())
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!api) return
    let live = true
    const load = () => {
      // Without the SQL step everyone simply shows as offline.
      api.list().then(
        (map) => {
          if (!live) return
          setPresence(map)
          setNow(Date.now())
        },
        () => live && setNow(Date.now()),
      )
    }
    load()
    const t = setInterval(load, PRESENCE_PING_MS)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [api])
  return { presence, now }
}

const colour = { online: 'bg-emerald-500', busy: 'bg-amber-500', offline: 'bg-nx-border' } as const

/** A dot with the status in words next to it (or only for screen readers when [compact]). */
export function PresenceDot({ entry, now, compact = false }: { entry: PresenceEntry | undefined; now: number; compact?: boolean }) {
  const status = presenceStatus(entry, now)
  const label = presenceLabel(entry, now)
  const note = status !== 'offline' ? entry?.note : null
  return (
    <span className="inline-flex min-w-0 items-center gap-1 text-xs text-nx-muted" title={note ? `${label} · ${note}` : label}>
      <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 rounded-full ${colour[status]}`} />
      <span className={compact ? 'sr-only' : 'truncate'}>
        {label}
        {note && ` · ${note}`}
      </span>
    </span>
  )
}
