import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { assistant, bindTheme } from '../ai/runtime'
import type { ChatItem, ToolRequest } from '../ai/session'
import { useSync } from '../sync/SyncContext'
import { useTheme } from '../theme/ThemeContext'

const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'

const EXAMPLES = [
  'Herinner me morgen om 9u aan mijn verslag',
  'Wat staat er in mijn notities over school?',
  'Stuur "Vergeet je sleutels niet" naar mijn gsm',
]

/** NEXUS AI: chat with actions that only run after you allow them. */
export function Assistant() {
  const state = useSyncExternalStore(assistant.subscribe, assistant.getSnapshot)
  const { setTheme } = useTheme()
  const { state: sync } = useSync()
  const [draft, setDraft] = useState('')
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bindTheme(setTheme)
  }, [setTheme])
  // Braces on purpose: newer browsers return a Promise from scrollIntoView, and React would
  // call a returned value as the cleanup function ("is not a function").
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' })
  }, [state.items.length, state.streaming])

  const signedIn = sync.status !== 'signed-out' && sync.status !== 'unconfigured'
  const submit = (text: string) => {
    if (!text.trim() || state.busy) return
    setDraft('')
    void assistant.send(text)
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div className="flex items-center justify-between gap-2 border-b border-nx-border px-3 py-2">
        <h2 className="font-semibold">NEXUS AI</h2>
        {state.items.length > 0 && (
          <button type="button" className={button} disabled={state.busy} onClick={() => assistant.reset()}>
            Nieuw gesprek
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
        {state.items.length === 0 && (
          <div className="space-y-3 text-nx-muted">
            <p>
              Vraag iets, of laat NEXUS iets voor je doen. Elke actie (een notitie lezen of maken, een herinnering plannen,
              een melding sturen) vraagt eerst je toestemming.
            </p>
            {!signedIn && <p className="text-nx-text">Meld je eerst aan in de Account-app.</p>}
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((e) => (
                <button key={e} type="button" className={button} disabled={!signedIn} onClick={() => submit(e)}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}
        {state.items.map((item) => (
          <Item key={item.id} item={item} />
        ))}
        {state.streaming && <Bubble mine={false} text={state.streaming} />}
        {state.busy && !state.streaming && !state.items.some((i) => i.kind === 'tool' && i.request.status === 'pending') && (
          <p role="status" className="text-nx-muted">
            NEXUS denkt na…
          </p>
        )}
        <div ref={end} />
      </div>

      <form
        className="flex gap-2 border-t border-nx-border p-3"
        onSubmit={(e) => {
          e.preventDefault()
          submit(draft)
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit(draft)
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder={signedIn ? 'Vraag NEXUS iets…' : 'Meld je aan om NEXUS AI te gebruiken'}
          aria-label="Bericht aan NEXUS AI"
          disabled={!signedIn}
          className="min-h-9 min-w-0 flex-1 resize-none rounded-lg border border-nx-border bg-nx-surface-2 px-3 py-2 outline-none placeholder:text-nx-muted"
        />
        <button type="submit" className={primaryButton} disabled={!signedIn || state.busy || !draft.trim()}>
          Versturen
        </button>
      </form>
    </div>
  )
}

function Bubble({ mine, text }: { mine: boolean; text: string }) {
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <p
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 ${
          mine ? 'bg-nx-accent text-nx-accent-text' : 'bg-nx-surface-2'
        }`}
      >
        {text}
      </p>
    </div>
  )
}

function Item({ item }: { item: ChatItem }) {
  switch (item.kind) {
    case 'user':
      return <Bubble mine text={item.text} />
    case 'assistant':
      return <Bubble mine={false} text={item.text} />
    case 'notice':
      return (
        <p role={item.error ? 'alert' : 'status'} className={item.error ? 'text-red-500' : 'text-nx-muted'}>
          {item.text}
        </p>
      )
    case 'tool':
      return <ToolCard request={item.request} />
  }
}

const STATUS_TEXT: Record<ToolRequest['status'], string> = {
  pending: 'Wacht op je toestemming',
  running: 'Bezig…',
  done: 'Uitgevoerd',
  denied: 'Geweigerd',
  failed: 'Niet gelukt',
}

function ToolCard({ request }: { request: ToolRequest }) {
  const [always, setAlways] = useState(false)
  return (
    <div className="space-y-2 rounded-lg border border-nx-border p-3" aria-label={`Actie: ${request.label}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{request.label}</span>
        <span className={`text-xs ${request.status === 'failed' ? 'text-red-500' : 'text-nx-muted'}`}>
          {STATUS_TEXT[request.status]}
        </span>
      </div>
      <p>{request.description}</p>
      {request.result && <p className="text-nx-muted">{request.result}</p>}
      {request.status === 'pending' && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={primaryButton} onClick={() => assistant.decide(request.id, true, always)}>
            Toestaan
          </button>
          <button type="button" className={button} onClick={() => assistant.decide(request.id, false)}>
            Weigeren
          </button>
          <label className="flex items-center gap-1.5 text-xs text-nx-muted">
            <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} className="accent-[var(--nx-accent)]" />
            {request.readOnly ? 'Altijd toestaan' : 'Deze actie voortaan altijd toestaan'}
          </label>
        </div>
      )}
    </div>
  )
}
