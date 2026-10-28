import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { CAPTURE_KIND_LABELS, DEFAULT_REMIND, guessCaptureKind, parseCapture, type CaptureKind } from '@nexus/core'
import { MicIcon, QuickNoteIcon } from '../apps/icons'
import { lifeStore } from '../life/store'
import { remindersStore } from '../reminders/store'
import { notesStore } from '../state/notesStore'
import { isDesktopApp } from '../platform/desktop'
import { captureState, closeCapture, openCapture } from './open'
import { appendSpoken, speechSupported, startDictation, type Dictation } from './speech'

const KINDS: CaptureKind[] = ['note', 'deadline', 'reminder']
const SAVED: Record<CaptureKind, string> = { note: 'in Notities', deadline: 'als deadline in de Agenda', reminder: 'als herinnering' }

const pad = (n: number) => String(n).padStart(2, '0')
const toLocalInput = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Opens Snelle notitie on Alt+N from anywhere. */
export function useCaptureShortcut() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyN') {
        e.preventDefault()
        openCapture()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
}

export function CaptureButton({ className = '' }: { className?: string }) {
  return (
    <button
      type="button"
      aria-label="Snelle notitie (Alt+N)"
      title="Snelle notitie (Alt+N)"
      onClick={() => openCapture()}
      className={`grid size-10 place-items-center rounded-lg text-nx-muted hover:bg-nx-surface-2 ${className}`}
    >
      <QuickNoteIcon className="size-5" />
    </button>
  )
}

/** Saves one capture where it belongs; returns where, for the message. */
export async function saveCapture(text: string, kind: CaptureKind, at: number | null, now = Date.now()): Promise<string> {
  const capture = parseCapture(text, kind, now)
  if (!capture.title) throw new Error('Typ eerst iets.')
  const moment = at ?? capture.at ?? now
  if (kind === 'note') {
    await notesStore.ready
    const id = notesStore.add()
    notesStore.update(id, { title: capture.title, body: capture.body })
  } else if (kind === 'deadline') {
    await lifeStore.ready
    await lifeStore.addDeadline({ title: capture.title, dueAt: moment, projectId: null, notes: capture.body, remind: DEFAULT_REMIND, target: 'phone' }, now)
  } else {
    if (moment <= now) throw new Error('Dat tijdstip ligt in het verleden.')
    await remindersStore.add({ title: capture.title, ...(capture.body ? { text: capture.body } : {}), at: moment, repeat: 'none', target: 'phone' }, now)
  }
  return SAVED[kind]
}

/** The Snelle notitie window, shown by every shell when it is open. */
export function QuickCapture() {
  const { open, text: initial, dictate } = useSyncExternalStore(captureState.subscribe, captureState.getSnapshot)
  return open ? <CaptureDialog key={initial} initial={initial} dictate={dictate} /> : null
}

function CaptureDialog({ initial, dictate }: { initial: string; dictate: boolean }) {
  const [text, setText] = useState(initial)
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState('')
  const dictation = useRef<Dictation | null>(null)
  // The Windows app's WebView has no speech recognition of its own; Windows dictation (Win+H) works there.
  const canSpeak = speechSupported() && !isDesktopApp
  const [picked, setPicked] = useState<CaptureKind | null>(null)
  const [edited, setEdited] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const now = Date.now()
  const kind = picked ?? guessCaptureKind(text, now)
  const parsed = parseCapture(text, kind, now)
  const when = edited ?? (parsed.at !== null ? toLocalInput(parsed.at) : '')

  const listen = () => {
    if (dictation.current) {
      dictation.current.stop()
      return
    }
    setError(null)
    dictation.current = startDictation({
      onFinal: (spoken) => {
        setText((t) => appendSpoken(t, spoken))
        setEdited(null)
      },
      onInterim: setHeard,
      onError: setError,
      onEnd: () => {
        dictation.current = null
        setListening(false)
      },
    })
    setListening(dictation.current !== null)
  }
  useEffect(() => {
    if (dictate && canSpeak) listen()
    return () => dictation.current?.stop()
    // Only when the window opens.
  }, [])

  const save = async () => {
    dictation.current?.stop()
    setError(null)
    setBusy(true)
    try {
      const at = kind === 'note' ? null : Date.parse(when)
      if (at !== null && !Number.isFinite(at)) throw new Error('Kies een geldig tijdstip.')
      setSaved(`Bewaard ${await saveCapture(text, kind, at)}.`)
      setTimeout(closeCapture, 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') closeCapture()
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void save()
    else return
    e.preventDefault()
  }

  return (
    <div className="fixed inset-0 z-[20000] flex items-start justify-center bg-black/40 p-3 pt-[10vh]" onPointerDown={(e) => e.target === e.currentTarget && closeCapture()}>
      <div role="dialog" aria-modal="true" aria-label="Snelle notitie" onKeyDown={onKeyDown} className="nx-glass w-full max-w-lg space-y-3 rounded-xl border border-nx-border p-4 text-sm">
        <h2 className="font-semibold">Snelle notitie</h2>
        <textarea
          autoFocus
          aria-label="Wat wil je bewaren?"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setEdited(null)
          }}
          rows={3}
          placeholder="bv. Verslag labo indienen vrijdag, of Mama bellen morgen om 14u"
          className="w-full resize-none rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 text-base outline-none"
        />
        {canSpeak ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-pressed={listening}
              onClick={listen}
              className={`flex items-center gap-1.5 rounded-full border border-nx-border px-3 py-1 ${listening ? 'bg-red-600 font-medium text-white' : 'hover:bg-nx-surface-2'}`}
            >
              <MicIcon className="size-4" />
              {listening ? 'Stoppen' : 'Inspreken'}
            </button>
            <span aria-live="polite" className="min-w-0 flex-1 truncate text-nx-muted">
              {listening ? heard || 'Ik luister…' : ''}
            </span>
          </div>
        ) : (
          isDesktopApp && <p className="text-xs text-nx-muted">Inspreken: klik in het tekstvak en druk op Windows+H.</p>
        )}
        <div role="group" aria-label="Soort" className="flex gap-1">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => {
                setPicked(k)
                setEdited(null)
              }}
              className={`rounded-full border border-nx-border px-3 py-1 ${kind === k ? 'bg-nx-accent font-medium text-nx-accent-text' : 'hover:bg-nx-surface-2'}`}
            >
              {CAPTURE_KIND_LABELS[k]}
            </button>
          ))}
        </div>
        {kind !== 'note' && (
          <label className="flex items-center gap-2">
            <span className="w-20 shrink-0">{kind === 'deadline' ? 'Tegen' : 'Om'}</span>
            <input type="datetime-local" aria-label="Tijdstip" value={when} onChange={(e) => setEdited(e.target.value)} className="rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none" />
          </label>
        )}
        {kind !== 'note' && parsed.title && parsed.title !== text.trim().split('\n')[0] && <p className="text-nx-muted">Titel: {parsed.title}</p>}
        {saved && <p role="status">{saved}</p>}
        {error && (
          <p role="alert" className="text-red-500">
            {error}
          </p>
        )}
        <div className="flex items-center justify-end gap-2">
          <span className="mr-auto hidden text-xs text-nx-muted sm:block">Ctrl+Enter bewaart, Esc sluit</span>
          <button type="button" onClick={closeCapture} className="rounded-lg border border-nx-border px-3 py-1.5 hover:bg-nx-surface-2">
            Annuleren
          </button>
          <button type="button" disabled={busy || saved !== null || !text.trim()} onClick={() => void save()} className="rounded-lg bg-nx-accent px-3 py-1.5 font-medium text-nx-accent-text disabled:opacity-60">
            Bewaren
          </button>
        </div>
      </div>
    </div>
  )
}
