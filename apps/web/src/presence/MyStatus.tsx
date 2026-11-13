import { useEffect, useState } from 'react'
import { PRESENCE_NOTE_MAX, type PresenceState } from '@nexus/core'
import type { MyPresence, Presence } from './presence'

const LABELS: Record<PresenceState, string> = { available: 'Beschikbaar', busy: 'Bezet', invisible: 'Onzichtbaar' }
const HELP: Record<PresenceState, string> = {
  available: 'Je vrienden en teamgenoten zien wanneer NEXUS bij jou openstaat.',
  busy: 'Ze zien dat je online bent, maar liever niet gestoord wordt.',
  invisible: 'Je staat voor iedereen offline en niemand ziet wanneer je laatst online was.',
}
const field = 'min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'

/** Your status for friends and teammates: available, busy or invisible, with a short note. */
export function MyStatus({ api }: { api: Presence }) {
  const [mine, setMine] = useState<MyPresence | null | undefined>(undefined)
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    api.mine().then(
      (m) => {
        if (!live) return
        setMine(m ?? { state: 'available', note: null })
        setNote(m?.note ?? '')
      },
      (err: unknown) => {
        if (!live) return
        setMine(null)
        setProblem(err instanceof Error ? err.message : String(err))
      },
    )
    return () => {
      live = false
    }
  }, [api])

  if (mine === undefined) return null
  if (problem?.startsWith('setup:'))
    return (
      <p role="alert" className="rounded-md border border-amber-500/40 p-2 text-amber-700 dark:text-amber-300">
        Wie is er online heeft nog een stap in de database nodig: voer eenmalig <code>{problem.slice(6)}</code> uit in de SQL Editor van Supabase (of via Account › Database-check).
      </p>
    )
  const state = mine?.state ?? 'available'
  const save = (next: PresenceState, text: string) => {
    setBusy(true)
    api.set(next, text).then(
      (m) => {
        setMine(m)
        setNote(m.note ?? '')
        setProblem(null)
      },
      (err: unknown) => setProblem(err instanceof Error ? err.message : String(err)),
    ).finally(() => setBusy(false))
  }

  return (
    <section className="space-y-2 rounded-lg border border-nx-border p-3">
      <h3 className="font-medium">Jouw status</h3>
      {problem && <p role="alert" className="text-xs text-red-600">{problem}</p>}
      <div role="radiogroup" aria-label="Jouw status" className="flex flex-wrap gap-1">
        {(Object.keys(LABELS) as PresenceState[]).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={state === s} disabled={busy} onClick={() => save(s, note)} className={`rounded-md border border-nx-border px-2.5 py-1 text-xs ${state === s ? 'bg-nx-surface-2 font-medium' : 'hover:bg-nx-surface-2'}`}>
            {LABELS[s]}
          </button>
        ))}
      </div>
      <p className="text-xs text-nx-muted">{HELP[state]}</p>
      {state !== 'invisible' && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            save(state, note)
          }}
        >
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={PRESENCE_NOTE_MAX} placeholder="Korte status, bv. Aan het studeren" aria-label="Korte status" className={`${field} flex-1`} />
          {note.trim() !== (mine?.note ?? '') && (
            <button type="submit" disabled={busy} className="rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50">
              {note.trim() ? 'Opslaan' : 'Wissen'}
            </button>
          )}
        </form>
      )}
    </section>
  )
}
