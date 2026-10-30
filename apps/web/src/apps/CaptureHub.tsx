import { useState, useSyncExternalStore } from 'react'
import {
  CAPTURE_TARGET_LABELS,
  firstLink,
  INBOX_KIND_LABELS,
  liveTemplates,
  removeCapture,
  removeTemplate,
  saveTemplate,
  sortCapture,
  unsorted,
  type CaptureKind,
  type CaptureTarget,
  type CaptureTemplate,
  type InboxCapture,
} from '@nexus/core'
import { saveCapture } from '../capture/QuickCapture'
import { capturesStore, capturesSyncProblem, useCaptures } from '../capture/hub'
import { openCapture } from '../capture/open'
import { readStorage, writeStorage } from '../state/storage'

const TABS = ['Vastleggen', 'Te sorteren', 'Sjablonen', 'Sneltoetsen', 'Geschiedenis'] as const
type Tab = (typeof TABS)[number]
const TAB_KEY = 'nexus.capture.tab'
const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'
const TARGETS: CaptureTarget[] = ['note', 'deadline', 'reminder', 'later']
const SORT_TO: CaptureKind[] = ['note', 'deadline', 'reminder']
const when = (t: number) => new Date(t).toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Snel vastleggen 2.0: capture now, sort later, with templates and a history. */
export function CaptureHub() {
  const state = useCaptures()
  const problem = useSyncExternalStore(capturesSyncProblem.subscribe, capturesSyncProblem.getSnapshot)
  const [tab, setTabState] = useState<Tab>(() => (TABS.includes(readStorage(TAB_KEY) as Tab) ? (readStorage(TAB_KEY) as Tab) : 'Vastleggen'))
  const setTab = (t: Tab) => {
    setTabState(t)
    writeStorage(TAB_KEY, t)
  }
  const open = unsorted(state)
  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div role="tablist" aria-label="Snel vastleggen" className="flex gap-1 overflow-x-auto border-b border-nx-border px-3 py-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`shrink-0 rounded-md px-3 py-1 ${tab === t ? 'bg-nx-surface-2 font-medium' : 'hover:bg-nx-surface-2'}`}
          >
            {t}
            {t === 'Te sorteren' && open.length > 0 ? ` (${open.length})` : ''}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {problem?.startsWith('setup:') && (
          <p role="alert" className="rounded-md border border-amber-500/40 p-2 text-amber-700 dark:text-amber-300">
            Syncen lukt nog niet: voer eenmalig <code>{problem.slice(6)}</code> uit in de SQL Editor van Supabase (of via Account › Database-check).
          </p>
        )}
        {tab === 'Vastleggen' && <CaptureTab onSorted={() => setTab('Te sorteren')} />}
        {tab === 'Te sorteren' && <InboxTab items={open} />}
        {tab === 'Sjablonen' && <TemplatesTab templates={liveTemplates(state)} />}
        {tab === 'Sneltoetsen' && <ShortcutsTab />}
        {tab === 'Geschiedenis' && <HistoryTab />}
      </div>
    </div>
  )
}

function CaptureTab({ onSorted }: { onSorted: () => void }) {
  const [text, setText] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const later = async () => {
    setError(null)
    try {
      setStatus(`Bewaard ${await saveCapture(text, 'later', null, Date.now(), true)}.`)
      setText('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <>
      <p className="text-nx-muted">
        Snel iets bewaren: een link, een idee, iets wat je niet mag vergeten. Kies nu waar het hoort, of zet het in Te sorteren en geef het later een plek.
      </p>
      <form
        aria-label="Later sorteren"
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          void later()
        }}
      >
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={4000} aria-label="Wat wil je bewaren?" placeholder="bv. https://… of Idee: samenvatting per hoofdstuk" className={field} />
        {status && <p role="status">{status}</p>}
        {error && (
          <p role="alert" className="text-red-500">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primaryButton} disabled={!text.trim()}>
            In Te sorteren
          </button>
          <button type="button" className={button} onClick={() => openCapture(text)}>
            Nu een plek kiezen…
          </button>
          {status && (
            <button type="button" className={button} onClick={onSorted}>
              Naar Te sorteren
            </button>
          )}
        </div>
      </form>
    </>
  )
}

function InboxTab({ items }: { items: InboxCapture[] }) {
  const [error, setError] = useState<string | null>(null)
  if (items.length === 0) return <p className="text-nx-muted">Niets te sorteren. Wat je met "Later sorteren" bewaart, komt hier.</p>
  const sort = async (item: InboxCapture, to: CaptureKind) => {
    setError(null)
    try {
      // The capture lands where it belongs, with the same date reading as Snelle notitie.
      await saveCapture(item.text, to, null)
      capturesStore.update((s) => sortCapture(s, item.id, to, Date.now()))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <>
      {error && (
        <p role="alert" className="text-red-500">
          {error}
        </p>
      )}
      <ul className="space-y-2" aria-label="Te sorteren">
        {items.map((item) => {
          const link = firstLink(item.text)
          return (
            <li key={item.id} className="space-y-2 rounded-lg border border-nx-border bg-nx-surface-2 p-3">
              <div className="flex items-baseline gap-2">
                <span className="rounded-full border border-nx-border px-2 text-xs">{INBOX_KIND_LABELS[item.kind]}</span>
                <span className="text-xs text-nx-muted">{when(item.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap break-words">{item.text}</p>
              <div className="flex flex-wrap gap-1">
                {SORT_TO.map((to) => (
                  <button key={to} type="button" className={small} onClick={() => void sort(item, to)} aria-label={`${item.text.slice(0, 40)} naar ${CAPTURE_TARGET_LABELS[to]}`}>
                    → {CAPTURE_TARGET_LABELS[to]}
                  </button>
                ))}
                <button type="button" className={small} onClick={() => openCapture(item.text)}>
                  Aanpassen…
                </button>
                {link && (
                  <a className={small} href={link} target="_blank" rel="noopener noreferrer">
                    Openen
                  </a>
                )}
                <button type="button" className={`${small} text-red-500`} onClick={() => capturesStore.update((s) => removeCapture(s, item.id, Date.now()))}>
                  Weghalen
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}

function TemplatesTab({ templates }: { templates: CaptureTemplate[] }) {
  const [editing, setEditing] = useState<CaptureTemplate | null>(null)
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [target, setTarget] = useState<CaptureTarget>('note')
  const [error, setError] = useState<string | null>(null)
  const edit = (t: CaptureTemplate | null) => {
    setEditing(t)
    setName(t?.name ?? '')
    setText(t?.text ?? '')
    setTarget(t?.target ?? 'note')
    setError(null)
  }
  return (
    <>
      <p className="text-nx-muted">Sjablonen kies je bovenaan in Snelle notitie (Alt+N): de tekst en de soort staan dan al klaar.</p>
      <form
        aria-label={editing ? 'Sjabloon bewerken' : 'Nieuw sjabloon'}
        className="space-y-2 rounded-lg border border-nx-border p-3"
        onSubmit={(e) => {
          e.preventDefault()
          const next = saveTemplate(capturesStore.getSnapshot(), { id: editing?.id ?? crypto.randomUUID(), name, text, target }, Date.now())
          if ('error' in next) {
            setError(next.error)
            return
          }
          capturesStore.update(() => next)
          edit(null)
        }}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Naam" placeholder="Naam, bv. Labo-verslag" className={field} />
          <select value={target} onChange={(e) => setTarget(e.target.value as CaptureTarget)} aria-label="Soort" className={field}>
            {TARGETS.map((t) => (
              <option key={t} value={t}>
                {CAPTURE_TARGET_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={4000} aria-label="Tekst" placeholder="bv. Verslag labo indienen vrijdag" className={field} />
        {error && (
          <p role="alert" className="text-red-500">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button type="submit" className={primaryButton}>
            {editing ? 'Opslaan' : 'Toevoegen'}
          </button>
          {editing && (
            <button type="button" className={button} onClick={() => edit(null)}>
              Annuleren
            </button>
          )}
        </div>
      </form>
      {templates.length === 0 ? (
        <p className="text-nx-muted">Nog geen sjablonen.</p>
      ) : (
        <ul className="space-y-2" aria-label="Sjablonen">
          {templates.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-nx-border bg-nx-surface-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t.name}</p>
                <p className="truncate text-xs text-nx-muted">
                  {CAPTURE_TARGET_LABELS[t.target]} · {t.text}
                </p>
              </div>
              <button type="button" className={small} onClick={() => openCapture(t.text)}>
                Gebruiken
              </button>
              <button type="button" className={small} onClick={() => edit(t)}>
                Bewerken
              </button>
              <button type="button" className={`${small} text-red-500`} onClick={() => capturesStore.update((s) => removeTemplate(s, t.id, Date.now()))}>
                Verwijderen
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

const SHORTCUTS: Array<[string, string]> = [
  ['Alt+N', 'Snelle notitie openen, overal in NEXUS'],
  ['Ctrl+Shift+Spatie', 'Hetzelfde, als Alt+N al door iets anders gebruikt wordt'],
  ['Ctrl+Enter', 'Bewaren in Snelle notitie'],
  ['Esc', 'Snelle notitie sluiten'],
  ['Ctrl+K', 'Zoeken in NEXUS, ook in je notities'],
]

function ShortcutsTab() {
  return (
    <>
      <table className="w-full text-left">
        <caption className="sr-only">Sneltoetsen</caption>
        <tbody>
          {SHORTCUTS.map(([keys, what]) => (
            <tr key={keys} className="border-b border-nx-border">
              <th scope="row" className="py-1.5 pr-3 font-mono font-normal whitespace-nowrap">
                {keys}
              </th>
              <td className="py-1.5">{what}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="space-y-1 text-nx-muted">
        <p>Op je gsm: houd het NEXUS-icoon ingedrukt voor Snelle notitie of Spraaknotitie, of deel tekst of een link vanuit een andere app naar NEXUS.</p>
        <p>De sneltoetsen werken zolang NEXUS het actieve venster is; een browser laat geen sneltoets toe als je in een ander programma zit.</p>
      </div>
    </>
  )
}

function HistoryTab() {
  const { history } = useCaptures()
  if (history.length === 0) return <p className="text-nx-muted">Nog niets vastgelegd sinds Snel vastleggen aanstaat.</p>
  return (
    <>
      <ul className="space-y-1" aria-label="Geschiedenis">
        {history.map((h) => (
          <li key={h.id} className="flex items-baseline gap-2 rounded-md bg-nx-surface-2 px-2 py-1.5">
            <span className="w-32 shrink-0 text-xs text-nx-muted">{when(h.at)}</span>
            <span className="min-w-0 flex-1 truncate">{h.title}</span>
            <span className="shrink-0 text-xs text-nx-muted">{CAPTURE_TARGET_LABELS[h.to]}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-nx-muted">De laatste 200 keer.</p>
    </>
  )
}
