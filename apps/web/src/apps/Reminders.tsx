import { useState, useSyncExternalStore } from 'react'
import { parseReminder, REPEAT_LABELS, TARGET_LABELS, type ReminderRepeat, type ReminderTarget } from '@nexus/core'
import { isDesktopApp } from '../platform/desktop'
import { remindersStore } from '../reminders/store'

const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'

/** A datetime-local value one hour from now, rounded to the quarter. */
function defaultTime(now = new Date()): string {
  const d = new Date(now.getTime() + 60 * 60_000)
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Herinneringen: planned notifications here and on the phone and watch. */
export function Reminders() {
  const reminders = useSyncExternalStore(remindersStore.subscribe, remindersStore.getSnapshot)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [at, setAt] = useState(defaultTime)
  const [repeat, setRepeat] = useState<ReminderRepeat>('none')
  const [target, setTarget] = useState<ReminderTarget>('phone')
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="space-y-4 p-4 text-sm">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Herinneringen</h2>
        <p className="text-nx-muted">
          Ze gaan af zolang NEXUS ergens open is op dit apparaat
          {isDesktopApp ? ', ook als het venster in het systeemvak zit' : '; de Windows-app in het systeemvak is daarvoor het handigst'}.
          Met "Ook op gsm en horloge" krijgt je gsm ze versleuteld door. Ook NEXUS AI kan ze voor je plannen.
        </p>
      </div>

      <form
        className="space-y-2 rounded-lg border border-nx-border p-3"
        aria-label="Nieuwe herinnering"
        onSubmit={(e) => {
          e.preventDefault()
          const parsed = parseReminder({ title, text: text || undefined, at: new Date(at).getTime(), repeat, target }, Date.now())
          if (!parsed.ok) {
            setError(parsed.error)
            return
          }
          setError(null)
          void remindersStore.add(parsed.value).then(() => {
            setTitle('')
            setText('')
            setAt(defaultTime())
          })
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Waaraan herinneren?" aria-label="Titel" className={field} />
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Extra uitleg (optioneel)" aria-label="Tekst" className={field} />
        <div className="grid gap-2 sm:grid-cols-3">
          <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} aria-label="Tijdstip" className={field} />
          <select value={repeat} onChange={(e) => setRepeat(e.target.value as ReminderRepeat)} aria-label="Herhaling" className={field}>
            {Object.entries(REPEAT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select value={target} onChange={(e) => setTarget(e.target.value as ReminderTarget)} aria-label="Waar" className={field}>
            {Object.entries(TARGET_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {error && (
          <p role="alert" className="text-red-500">
            {error}
          </p>
        )}
        <button type="submit" className={primaryButton} disabled={!title.trim()}>
          Plannen
        </button>
      </form>

      {reminders.length === 0 ? (
        <p className="text-nx-muted">Nog geen herinneringen gepland.</p>
      ) : (
        <ul className="space-y-2" aria-label="Geplande herinneringen">
          {reminders.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-nx-border bg-nx-surface-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.title}</p>
                {r.text && <p className="text-nx-muted">{r.text}</p>}
                <p className="text-xs text-nx-muted">
                  {new Date(r.at).toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {' · '}
                  {REPEAT_LABELS[r.repeat]} · {TARGET_LABELS[r.target]}
                </p>
              </div>
              <button type="button" className={`${button} text-red-500`} onClick={() => void remindersStore.remove(r.id)}>
                Verwijderen
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
