import { useEffect, useState, useSyncExternalStore } from 'react'
import { dateKey, entryOn, journalEntries, journalStreak, MOODS, moodEmoji, moodWeeks, type Mood } from '@nexus/core'
import { journalStore, journalSyncProblem, writeEntry } from '../journal/store'

const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const smallButton = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2'

const useJournal = () => useSyncExternalStore(journalStore.subscribe, journalStore.getSnapshot)

const dayTitle = (day: string) => {
  const word = new Date(`${day}T12:00:00`).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' })
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/** Dagboek: how your day was, in a mood and a few lines. */
export function Journal() {
  const state = useJournal()
  const problem = useSyncExternalStore(journalSyncProblem.subscribe, journalSyncProblem.getSnapshot)
  const now = Date.now()
  const [day, setDay] = useState(dateKey(now))
  const entry = entryOn(state, day)
  const [note, setNote] = useState(entry?.note ?? '')
  // Load the note of another day when you pick it, or when it comes in from another device.
  useEffect(() => setNote(entryOn(journalStore.getSnapshot(), day)?.note ?? ''), [day, entry?.updatedAt])
  const entries = journalEntries(state)
  const streak = journalStreak(state, now)
  const weeks = moodWeeks(state, now, 8)
  const [query, setQuery] = useState('')
  const found = query.trim() ? entries.filter((e) => e.note.toLowerCase().includes(query.trim().toLowerCase())) : entries.slice(0, 14)

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4 text-sm">
      {problem?.startsWith('setup:') && (
        <p className="rounded-lg border border-nx-border bg-nx-surface-2 p-3">
          Je dagboek staat alleen op dit apparaat: de database is nog niet bijgewerkt. Voer <code className="font-mono text-xs">{problem.slice(6)}</code> uit in de SQL Editor van Supabase.
        </p>
      )}
      <section aria-label="Vandaag" className="space-y-3 rounded-2xl border border-nx-border bg-nx-surface-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{day === dateKey(now) ? 'Hoe was je dag?' : dayTitle(day)}</h2>
          <input type="date" value={day} max={dateKey(now)} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Dag" className={`${field} w-auto`} />
        </div>
        <div role="radiogroup" aria-label="Stemming" className="flex flex-wrap gap-2">
          {MOODS.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={entry?.mood === m.value}
              aria-label={m.label}
              onClick={() => writeEntry(day, { mood: entry?.mood === m.value ? null : (m.value as Mood), note })}
              className={`flex flex-col items-center rounded-xl border px-3 py-2 ${entry?.mood === m.value ? 'border-nx-accent bg-nx-surface' : 'border-nx-border hover:bg-nx-surface'}`}
            >
              <span className="text-2xl" aria-hidden="true">
                {m.emoji}
              </span>
              <span className="text-xs text-nx-muted">{m.label}</span>
            </button>
          ))}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (entry?.note ?? '') && writeEntry(day, { note })}
          rows={4}
          maxLength={4000}
          placeholder="Wat gebeurde er, waar ben je blij om, wat zit je dwars?"
          aria-label="Notitie"
          className={field}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60" disabled={note === (entry?.note ?? '')} onClick={() => writeEntry(day, { note })}>
            Bewaren
          </button>
          <span className="text-nx-muted">{streak > 0 ? `${streak} ${streak === 1 ? 'dag' : 'dagen'} op rij geschreven` : 'Schrijf vandaag je eerste stukje.'}</span>
        </div>
      </section>

      <section aria-label="Stemming per week" className="space-y-1">
        <h3 className="font-medium">Stemming per week</h3>
        <div className="flex items-end gap-1" role="img" aria-label={weeks.map((w) => `week van ${w.monday}: ${w.average ?? 'geen'}`).join('; ')}>
          {weeks.map((w) => (
            <div key={w.monday} className="flex flex-1 flex-col items-center gap-1" title={w.average === null ? 'Geen stemming' : `Gemiddeld ${String(w.average).replace('.', ',')} van 5 (${w.days} dagen)`}>
              <div className="flex h-20 w-full items-end justify-center">
                <div className="w-full max-w-6 rounded-t bg-nx-accent" style={{ height: `${((w.average ?? 0) / 5) * 100}%` }} />
              </div>
              <span aria-hidden="true">{moodEmoji(w.average)}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-nx-muted">De laatste acht weken, de huidige rechts. Ook te zien in Inzichten.</p>
      </section>

      <section aria-label="Eerdere dagen" className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium">Eerdere dagen</h3>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoeken" aria-label="Zoek in je dagboek" className={`${field} max-w-48`} />
        </div>
        {found.length === 0 && <p className="text-nx-muted">{query ? 'Niets gevonden.' : 'Nog niets geschreven.'}</p>}
        <ul className="space-y-1">
          {found.map((e) => (
            <li key={e.date}>
              <button type="button" onClick={() => setDay(e.date)} className="flex w-full gap-2 rounded-md px-2 py-1.5 text-left hover:bg-nx-surface-2">
                <span aria-hidden="true">{moodEmoji(e.mood)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{dayTitle(e.date)}</span>
                  {e.note && <span className="block truncate text-nx-muted">{e.note}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {day !== dateKey(now) && (
          <button type="button" className={smallButton} onClick={() => setDay(dateKey(now))}>
            Terug naar vandaag
          </button>
        )}
      </section>
      <p className="text-xs text-nx-muted">Met een account staat je dagboek op al je apparaten, alleen voor jou leesbaar (Supabase met RLS). NEXUS AI krijgt het nooit te zien.</p>
    </div>
  )
}
