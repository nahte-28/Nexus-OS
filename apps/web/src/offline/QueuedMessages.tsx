import type { OutboxItem } from '@nexus/core'
import { cancelQueued, retryQueued } from './outbox'

/** Your messages that wait on this device, under the conversation, with Annuleren and Opnieuw. */
export function QueuedMessages({ items, label = 'Berichten die wachten' }: { items: OutboxItem[]; label?: string }) {
  if (items.length === 0) return null
  return (
    <ol aria-label={label} className="space-y-1.5">
      {items.map((m) => (
        <li key={m.id} className="flex flex-col items-end">
          <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl border border-dashed border-nx-accent/60 px-3 py-1.5 opacity-75">{m.text}</p>
          <span className="flex flex-wrap items-center justify-end gap-2 px-1 text-[11px] text-nx-muted">
            {m.error ? <span className="text-red-600 dark:text-red-400">Niet verstuurd: {m.error}</span> : <span>⏳ Wacht op internet, gaat vanzelf weg</span>}
            {m.error && (
              <button type="button" className="underline hover:text-nx-accent" onClick={() => void retryQueued(m.id)}>
                Opnieuw
              </button>
            )}
            <button type="button" className="underline hover:text-red-600" onClick={() => cancelQueued(m.id)}>
              Annuleren
            </button>
          </span>
        </li>
      ))}
    </ol>
  )
}
