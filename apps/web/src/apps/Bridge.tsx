import { useEffect, useState } from 'react'
import {
  BRIDGE_EXPIRY_CHOICES,
  BRIDGE_MAX_CONTENT,
  bridgeType,
  canCancel,
  canRetry,
  checkContent,
  checkFile,
  fileSize,
  PLATFORM_LABELS,
  REASON_LABELS,
  safeLink,
  STATUS_LABELS,
  type AppId,
  type BridgeResume,
  type Transfer,
} from '@nexus/core'
import { bridgeStore, bridgeTargets, cancelTransfer, markOpened, receiveFile, retryTransfer, richTargets, sendFile, sendResume, sendTransfer, useBridge, type BridgeLink } from '../bridge/store'
import { useConnect } from '../connect/ConnectContext'
import { filesStore } from '../files/store'
import { capabilities } from '../platform/capabilities'
import { openWebApp } from '../platform/desktop'
import { onReveal, takeReveal } from '../search/reveal'
import { openApp } from '../shell/openApp'
import { notesStore } from '../state/notesStore'
import { useNotes } from '../state/useNotes'
import { readStorage, writeStorage } from '../state/storage'
import { useNow } from '../state/useNow'
import { useOptionalWindows } from '../state/WindowsContext'
import { APPS, useVisibleApps } from './registry'

const TABS = ['Versturen', 'Apparaten', 'Overdrachten', 'Toestemmingen'] as const
type Tab = (typeof TABS)[number]
const TAB_KEY = 'nexus.bridge.tab'

const primary = 'rounded-lg bg-nx-accent px-3 py-1.5 font-medium text-nx-accent-text disabled:opacity-60'
const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50'
const field = 'min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5'
const when = (t: number) => new Date(t).toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const hours = (h: number) => (h === 1 ? '1 uur' : h === 24 ? '1 dag' : `${h / 24} dagen`)

/** Bridge: text and links to one of your own devices, end-to-end encrypted through NEXUS Connect. */
export function Bridge() {
  const { engine, state } = useConnect()
  const [tab, setTabState] = useState<Tab>(() => ((TABS as readonly string[]).includes(readStorage(TAB_KEY) ?? '') ? (readStorage(TAB_KEY) as Tab) : 'Versturen'))
  const [focus, setFocus] = useState<string | null>(null)
  const setTab = (t: Tab) => {
    setTabState(t)
    writeStorage(TAB_KEY, t)
  }
  // From the Inbox: show the received transfer.
  useEffect(() => {
    const check = () => {
      const id = takeReveal('bridge')
      if (!id) return
      setFocus(id)
      setTab('Overdrachten')
    }
    check()
    return onReveal(check)
  }, [])
  const ready = state.status === 'ready'
  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div role="tablist" aria-label="Bridge" className="flex gap-1 overflow-x-auto border-b border-nx-border px-3 py-2">
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
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {!ready && (
          <p role="alert" className="rounded-md border border-nx-border p-2 text-nx-muted">
            Bridge werkt via NEXUS Connect. Meld je aan en koppel dit toestel in{' '}
            <button type="button" className="underline" onClick={() => openApp('devices')}>
              Apparaten
            </button>
            ; daarna kan je hier tekst en links sturen.
          </p>
        )}
        {tab === 'Versturen' ? (
          <Send link={engine} onSent={() => setTab('Overdrachten')} />
        ) : tab === 'Apparaten' ? (
          <Devices />
        ) : tab === 'Overdrachten' ? (
          <Transfers link={engine} focus={focus} />
        ) : (
          <Permissions />
        )}
      </div>
    </div>
  )
}

const KINDS = [
  { id: 'text', label: 'Tekst of link' },
  { id: 'file', label: 'Bestand' },
  { id: 'resume', label: 'Verdergaan' },
] as const
type Kind = (typeof KINDS)[number]['id']

/** What you can continue on another device: the open windows here, and your recent notes. */
function useResumeChoices(): BridgeResume[] {
  const windows = useOptionalWindows()
  const { notes } = useNotes()
  const apps = useVisibleApps()
  const title = (id: AppId) => apps.find((a) => a.id === id)?.title ?? APPS.find((a) => a.id === id)?.title ?? id
  const open = (windows?.state.windows ?? []).filter((w) => w.appId !== 'bridge').map((w): BridgeResume => ({ app: w.appId, title: title(w.appId) }))
  const recent = notes
    .filter((n) => n.deletedAt === null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5)
    .map((n): BridgeResume => ({ app: 'notes', id: n.id, title: `Notitie ${n.title.trim() || '(zonder titel)'}`.slice(0, 120) }))
  return [...open, ...recent]
}

function Send({ link, onSent }: { link: BridgeLink; onSent: () => void }) {
  const { state } = useConnect()
  const [kind, setKind] = useState<Kind>('text')
  const targets = kind === 'text' ? bridgeTargets(state) : richTargets(state)
  const [content, setContent] = useState('')
  const [fromClip, setFromClip] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [resume, setResume] = useState(0)
  const choices = useResumeChoices()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const chosen = targets.filter((d) => picked.has(d.id) || targets.length === 1)
  const { settings } = useBridge()
  const paste = async () => {
    try {
      setContent((await navigator.clipboard.readText()).slice(0, BRIDGE_MAX_CONTENT))
      setFromClip(true)
    } catch {
      setError('Plakken lukte niet; plak met Ctrl+V of lang drukken.')
    }
  }
  const send = async (): Promise<Transfer[]> => {
    const ids = chosen.map((d) => d.id)
    if (kind === 'file') return sendFile(link, ids, file!)
    if (kind === 'resume') return sendResume(link, ids, choices[resume])
    return sendTransfer(link, ids, content, { extra: fromClip ? { clip: true } : {} })
  }
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault()
        const problem = kind === 'text' ? checkContent(content) : kind === 'file' ? (file ? checkFile(file) : 'Kies eerst een bestand.') : choices[resume] ? null : 'Er is hier niets open om verder te zetten.'
        if (problem) return setError(problem)
        if (chosen.length === 0) return setError('Kies een toestel om naar te sturen.')
        setBusy(true)
        setError(null)
        try {
          const sent = await send()
          const failed = sent.filter((t) => t.status === 'failed')
          if (failed.length) setError(`Versturen mislukt naar ${failed.map((t) => t.deviceName).join(', ')}: ${failed[0].error ?? ''}`)
          else {
            setContent('')
            setFromClip(false)
            setFile(null)
            onSent()
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err))
        } finally {
          setBusy(false)
        }
      }}
    >
      <div role="radiogroup" aria-label="Wat stuur je" className="flex flex-wrap gap-1">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="radio"
            aria-checked={kind === k.id}
            onClick={() => (setKind(k.id), setError(null))}
            className={`rounded-md border border-nx-border px-3 py-1 ${kind === k.id ? 'bg-nx-surface-2 font-medium' : 'hover:bg-nx-surface-2'}`}
          >
            {k.label}
          </button>
        ))}
      </div>
      {kind === 'text' && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-nx-muted">Tekst of link</span>
            <textarea
              value={content}
              onChange={(e) => (setContent(e.target.value), setFromClip(false))}
              maxLength={BRIDGE_MAX_CONTENT}
              rows={4}
              placeholder="Plak een link of typ een tekst"
              className={field}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2 text-xs text-nx-muted">
            <span>
              {content.trim() ? (bridgeType(content) === 'link' ? 'Wordt verstuurd als link' : 'Wordt verstuurd als tekst') : `Hoogstens ${BRIDGE_MAX_CONTENT} tekens`}
              {content.trim() && fromClip ? ', van je klembord.' : content.trim() ? '.' : '.'}
            </span>
            {capabilities.clipboardRead && (
              <button type="button" className={small} onClick={() => void paste()}>
                Klembord ophalen
              </button>
            )}
          </div>
        </>
      )}
      {kind === 'file' && (
        <label className="flex flex-col gap-1">
          <span className="text-nx-muted">Bestand (tot 10 MB)</span>
          <input type="file" aria-label="Bestand" onChange={(e) => (setFile(e.target.files?.[0] ?? null), setError(null))} className={field} />
          {file && (
            <span className="text-xs text-nx-muted">
              {file.name} · {fileSize(file.size)}
            </span>
          )}
        </label>
      )}
      {kind === 'resume' &&
        (choices.length === 0 ? (
          <p className="text-nx-muted">Er staat hier niets open om verder te zetten. Open een app of een notitie en kom terug.</p>
        ) : (
          <fieldset className="space-y-1">
            <legend className="mb-1 text-nx-muted">Waar ga je verder?</legend>
            {choices.map((c, i) => (
              <label key={`${c.app}:${c.id ?? ''}`} className="flex items-center gap-2">
                <input type="radio" name="resume" checked={resume === i} onChange={() => setResume(i)} className="accent-[var(--nx-accent)]" />
                {c.title}
              </label>
            ))}
          </fieldset>
        ))}
      <fieldset className="space-y-1">
        <legend className="mb-1 text-nx-muted">Naar</legend>
        {targets.length === 0 ? (
          <p className="text-nx-muted">
            {kind === 'text'
              ? 'Er is nog geen ander toestel met NEXUS gekoppeld. Open NEXUS op je gsm of pc, meld je aan en koppel het in Apparaten.'
              : 'Bestanden en verdergaan gaan naar NEXUS in de browser of de Windows-app. Er is nog geen ander zo een toestel gekoppeld.'}
          </p>
        ) : (
          targets.map((d) => (
            <label key={d.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={targets.length === 1 || picked.has(d.id)}
                disabled={targets.length === 1}
                onChange={(e) => {
                  const next = new Set(picked)
                  if (e.target.checked) next.add(d.id)
                  else next.delete(d.id)
                  setPicked(next)
                }}
                className="accent-[var(--nx-accent)]"
              />
              {d.name}
              <span className="text-xs text-nx-muted">
                {PLATFORM_LABELS[d.platform]}
                {d.push ? ', ook als NEXUS dicht is' : ''}
              </span>
            </label>
          ))
        )}
      </fieldset>
      <label className="flex items-center gap-2">
        Beschikbaar voor
        <select aria-label="Beschikbaar voor" value={settings.expiryHours} onChange={(e) => bridgeStore.setSettings({ expiryHours: Number(e.target.value) })} className={field}>
          {BRIDGE_EXPIRY_CHOICES.map((h) => (
            <option key={h} value={h}>
              {hours(h)}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className={primary} disabled={busy || targets.length === 0}>
        {busy ? 'Versturen…' : 'Versturen'}
      </button>
      {error && (
        <p role="alert" className="text-red-500">
          {error}
        </p>
      )}
      <p className="text-xs text-nx-muted">
        {kind === 'file'
          ? 'Het bestand wordt op dit toestel versleuteld en wacht versleuteld in je eigen opslag; de sleutel gaat alleen mee in het versleutelde bericht. Na het opslaan of als de tijd voorbij is, verdwijnt het.'
          : 'Alles wordt op dit toestel versleuteld; de server ziet alleen dat er iets onderweg is, nooit wat.'}
      </p>
    </form>
  )
}

function Devices() {
  const { state } = useConnect()
  const targets = new Set(bridgeTargets(state).map((d) => d.id))
  const devices = state.devices.filter((d) => !d.revokedAt)
  if (devices.length === 0) return <p className="text-nx-muted">Nog geen gekoppelde toestellen.</p>
  return (
    <ul className="space-y-2" aria-label="Toestellen">
      {devices.map((d) => (
        <li key={d.id} className="rounded-lg border border-nx-border p-3">
          <div className="font-medium">
            {d.name}
            {d.isThisDevice && <span className="ml-2 text-xs text-nx-muted">(dit toestel)</span>}
          </div>
          <div className="text-xs text-nx-muted">
            {PLATFORM_LABELS[d.platform]} · laatst gezien {when(Date.parse(d.lastSeenAt))} · sleutel {d.fingerprint}
          </div>
          <div className="mt-1 text-xs">
            {d.isThisDevice
              ? 'Ontvangt wat je andere toestellen sturen.'
              : !targets.has(d.id)
                ? ''
                : d.platform === 'android'
                  ? 'Toont tekst en links als melding (met de nieuwste gsm-app of horloge-app). Bestanden en verdergaan niet.'
                  : d.push
                    ? 'Kan tekst, links, bestanden en verdergaan ontvangen, ook met NEXUS dicht (via een melding).'
                    : 'Kan tekst, links, bestanden en verdergaan ontvangen zodra NEXUS daar open is.'}
          </div>
        </li>
      ))}
    </ul>
  )
}

function Transfers({ link, focus }: { link: BridgeLink; focus: string | null }) {
  const { transfers } = useBridge()
  const now = useNow(30_000)
  const [filter, setFilter] = useState<'all' | 'out' | 'in'>('all')
  const [message, setMessage] = useState<string | null>(null)
  const shown = transfers.filter((t) => filter === 'all' || t.direction === filter)
  useEffect(() => {
    if (focus) document.getElementById(`transfer-${focus}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [focus])
  const act = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn()
      setMessage(done)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <>
      <label className="flex items-center gap-2">
        Toon
        <select aria-label="Toon" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className={field}>
          <option value="all">Alles</option>
          <option value="out">Verstuurd</option>
          <option value="in">Ontvangen</option>
        </select>
      </label>
      {message && (
        <p role="status" className="text-nx-muted">
          {message}
        </p>
      )}
      {shown.length === 0 ? (
        <p className="text-nx-muted">Nog geen overdrachten.</p>
      ) : (
        <ul className="space-y-2" aria-label="Overdrachten">
          {shown.map((t) => (
            <TransferRow key={`${t.direction}:${t.id}`} t={t} now={now} focused={t.id === focus} link={link} act={act} />
          ))}
        </ul>
      )}
    </>
  )
}

/** Hands a received file to the browser as a download. */
function download(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(href), 10_000)
}

function TransferRow({ t, now, focused, link, act }: { t: Transfer; now: number; focused: boolean; link: BridgeLink; act: (fn: () => Promise<unknown>, done: string) => Promise<void> }) {
  const apps = useVisibleApps()
  const url = t.type === 'link' ? safeLink(t.content) : null
  const fileReady = t.direction === 'in' && t.type === 'file' && !!t.file?.key && t.expiresAt > now
  const resumeApp = t.direction === 'in' && t.type === 'resume' && t.resume && t.content ? APPS.find((a) => a.id === t.resume!.app) : undefined
  const status = `${STATUS_LABELS[t.status]}${t.reason ? `: ${REASON_LABELS[t.reason]}` : ''}${t.error ? `: ${t.error}` : ''}`
  return (
    <li id={`transfer-${t.id}`} className={`rounded-lg border p-3 ${focused ? 'border-nx-accent' : 'border-nx-border'}`}>
      <div className="text-xs text-nx-muted">
        {t.direction === 'out' ? `Naar ${t.deviceName}` : `Van ${t.deviceName}`} · {when(t.sentAt)} · {status}
      </div>
      {t.type === 'file' && t.file ? (
        <p className="mt-1 break-words">
          <span className="font-medium">Bestand:</span> {t.file.name} · {fileSize(t.file.size)}
          {t.direction === 'in' && !t.file.key && t.status === 'opened' ? ' · opgeslagen' : ''}
        </p>
      ) : t.type === 'resume' && t.resume && t.content ? (
        <p className="mt-1 break-words">
          <span className="font-medium">Verdergaan:</span> {t.resume.title}
        </p>
      ) : t.content ? (
        <p className="mt-1 whitespace-pre-wrap break-words">
          {t.clip && <span className="mr-1 text-xs text-nx-muted">[klembord]</span>}
          {t.content}
        </p>
      ) : (
        <p className="mt-1 text-nx-muted">{t.status === 'cancelled' ? 'De afzender heeft dit ingetrokken.' : 'Verlopen: de inhoud is van dit toestel verwijderd.'}</p>
      )}
      {t.direction === 'in' && t.content && t.expiresAt > now && (t.type !== 'file' || fileReady) && <div className="text-xs text-nx-muted">Beschikbaar tot {when(t.expiresAt)}</div>}
      <div className="mt-2 flex flex-wrap gap-2">
        {fileReady && (
          <>
            <button type="button" className={small} onClick={() => void act(async () => download(await receiveFile(link, t), t.file!.name), 'Opgeslagen in je downloads.')}>
              Opslaan
            </button>
            <button type="button" className={small} onClick={() => void act(async () => filesStore.add(await receiveFile(link, t), t.file!.name), 'In Bestanden gezet.')}>
              In Bestanden zetten
            </button>
          </>
        )}
        {resumeApp && (
          <button
            type="button"
            className={small}
            onClick={() =>
              void act(async () => {
                if (!apps.some((a) => a.id === resumeApp.id)) throw new Error(`${resumeApp.title} staat niet aan in je profiel op dit toestel.`)
                openApp(resumeApp.id, t.resume!.id)
                await markOpened(link, t)
              }, `${resumeApp.title} geopend.`)
            }
          >
            Verdergaan
          </button>
        )}
        {t.direction === 'in' && url && (
          <button
            type="button"
            className={small}
            onClick={() =>
              void act(async () => {
                await openWebApp(url)
                await markOpened(link, t)
              }, 'Link geopend.')
            }
          >
            Link openen
          </button>
        )}
        {t.direction === 'in' && t.content && (t.type === 'text' || t.type === 'link') && capabilities.clipboardWrite && (
          <button
            type="button"
            className={small}
            onClick={() =>
              void act(async () => {
                await navigator.clipboard.writeText(t.content)
                await markOpened(link, t)
              }, 'Gekopieerd.')
            }
          >
            Kopiëren
          </button>
        )}
        {t.direction === 'in' && t.content && (t.type === 'text' || t.type === 'link') && (
          <button
            type="button"
            className={small}
            onClick={() =>
              void act(async () => {
                const id = notesStore.add()
                notesStore.update(id, { title: `Van ${t.deviceName}`, body: t.content })
                await markOpened(link, t)
              }, 'Bewaard als notitie.')
            }
          >
            Als notitie bewaren
          </button>
        )}
        {canCancel(t, now) && (
          <button type="button" className={small} onClick={() => void act(() => cancelTransfer(link, t), 'Ingetrokken.')}>
            Annuleren
          </button>
        )}
        {canRetry(t) && (
          <button type="button" className={small} onClick={() => void act(() => retryTransfer(link, t), 'Opnieuw verstuurd.')}>
            Opnieuw
          </button>
        )}
      </div>
    </li>
  )
}

function Permissions() {
  const { state } = useConnect()
  const { settings } = useBridge()
  const others = state.devices.filter((d) => !d.revokedAt && !d.isThisDevice && d.platform !== 'android')
  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-1 font-medium">Wie mag naar dit toestel sturen</legend>
        {others.length === 0 ? (
          <p className="text-nx-muted">Nog geen andere toestellen met NEXUS gekoppeld.</p>
        ) : (
          others.map((d) => (
            <label key={d.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!settings.blocked.includes(d.id)}
                onChange={(e) => bridgeStore.setBlocked(d.id, !e.target.checked)}
                className="accent-[var(--nx-accent)]"
              />
              {d.name}
            </label>
          ))
        )}
        <p className="text-xs text-nx-muted">Een toestel dat je uitvinkt, krijgt "geweigerd" terug. Alleen toestellen van je eigen account kunnen iets sturen.</p>
      </fieldset>
      <div className="space-y-1 text-nx-muted">
        <p>Links openen nooit vanzelf: jij kiest Link openen, Kopiëren of Als notitie bewaren.</p>
        <p>Ontvangen tekst blijft alleen op dit toestel, en verdwijnt als de tijd die de afzender koos voorbij is.</p>
        <p>Bestanden (tot 10 MB) openen nooit vanzelf: jij kiest Opslaan of In Bestanden zetten, en daarna verdwijnt het versleutelde bestand uit je opslag. Verdergaan opent pas iets als jij erop drukt.</p>
      </div>
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={settings.autoClipboard} onChange={(e) => bridgeStore.setSettings({ autoClipboard: e.target.checked })} className="mt-1 accent-[var(--nx-accent)]" />
        <span>
          <span className="font-medium">Klembord meteen overnemen</span>
          <span className="block text-xs text-nx-muted">Tekst die een ander toestel van zijn klembord stuurt, komt meteen op het klembord van dit toestel, als NEXUS hier open en actief is. Anders kies je zelf Kopiëren.</span>
        </span>
      </label>
    </div>
  )
}
