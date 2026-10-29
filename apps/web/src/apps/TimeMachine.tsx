import { useMemo, useState } from 'react'
import {
  diffScope,
  keepSnapshot,
  removeSnapshot,
  renameSnapshot,
  SCOPE_NAMES,
  setTmSettings,
  SNAPSHOT_SCOPES,
  THEMES,
  TM_COUNT_CHOICES,
  TM_DAYS_CHOICES,
  type ConfigSnapshot,
  type SnapshotReason,
  type SnapshotScope,
} from '@nexus/core'
import { readStorage, writeStorage } from '../state/storage'
import { captureScope, restoreSnapshot, takeSnapshot, timeMachineStore, useTimeMachine, type RestoreResult } from '../timemachine/store'
import { APPS } from './registry'

const TABS = ['Herstelpunten', 'Geschiedenis', 'Herstellen', 'Instellingen'] as const
type Tab = (typeof TABS)[number]
const TAB_KEY = 'nexus.timemachine.tab'

const button = 'rounded-lg border border-nx-border px-3 py-1.5 hover:bg-nx-surface-2 disabled:opacity-60'
const primary = 'rounded-lg bg-nx-accent px-3 py-1.5 font-medium text-nx-accent-text disabled:opacity-60'
const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2'
const field = 'min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5'
const when = (t: number) => new Date(t).toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const REASONS: Record<SnapshotReason, string> = { auto: 'automatisch', manual: 'handmatig', start: 'bij openen', update: 'update', before_restore: 'voor herstel' }
const names = { app: (id: string) => APPS.find((a) => a.id === id)?.title ?? id, theme: (id: string) => THEMES.find((t) => t.id === id)?.label ?? id }

/** Time Machine: restore points of profiles, flows and Spaces, with a preview before restoring. */
export function TimeMachine() {
  const [tab, setTabState] = useState<Tab>(() => ((TABS as readonly string[]).includes(readStorage(TAB_KEY) ?? '') ? (readStorage(TAB_KEY) as Tab) : 'Herstelpunten'))
  const [picked, setPicked] = useState<string | null>(null)
  const setTab = (t: Tab) => {
    setTabState(t)
    writeStorage(TAB_KEY, t)
  }
  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div role="tablist" aria-label="Time Machine" className="flex gap-1 overflow-x-auto border-b border-nx-border px-3 py-2">
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
        {tab === 'Herstelpunten' ? (
          <Snapshots
            onPick={(id) => {
              setPicked(id)
              setTab('Herstellen')
            }}
          />
        ) : tab === 'Geschiedenis' ? (
          <History />
        ) : tab === 'Herstellen' ? (
          <Restore picked={picked} onPick={setPicked} />
        ) : (
          <Settings />
        )}
      </div>
    </div>
  )
}

const scopeList = (s: ConfigSnapshot) => SNAPSHOT_SCOPES.filter((x) => s.scopes[x] !== undefined).map((x) => SCOPE_NAMES[x]).join(', ')

function Snapshots({ onPick }: { onPick: (id: string) => void }) {
  const { snapshots } = useTimeMachine()
  const [label, setLabel] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [name, setName] = useState('')
  return (
    <>
      <p className="text-nx-muted">
        Een herstelpunt bewaart je profielen en lesrooster, flows en Spaces zoals ze nu zijn. Je notities, deadlines en bestanden horen er niet bij: daarvoor
        is de back-up in Instellingen.
      </p>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const r = takeSnapshot('manual', label)
          setMessage(r.error ?? 'Herstelpunt gemaakt.')
          if (r.snapshot) setLabel('')
        }}
      >
        <input aria-label="Naam van het herstelpunt" placeholder="Naam (bv. Voor examens)" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} className={`${field} flex-1`} />
        <button type="submit" className={primary}>
          Herstelpunt maken
        </button>
      </form>
      {message && <p role="status" className="text-nx-muted">{message}</p>}
      {snapshots.length === 0 ? (
        <p className="text-nx-muted">Nog geen herstelpunten.</p>
      ) : (
        <ul className="space-y-2" aria-label="Herstelpunten">
          {snapshots.map((s) => (
            <li key={s.id} className="rounded-lg border border-nx-border p-3">
              {renaming === s.id ? (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    timeMachineStore.update((st) => renameSnapshot(st, s.id, name))
                    setRenaming(null)
                  }}
                >
                  <input aria-label="Nieuwe naam" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={`${field} flex-1`} autoFocus />
                  <button type="submit" className={small}>
                    Bewaren
                  </button>
                </form>
              ) : (
                <div className="font-medium">{s.label}</div>
              )}
              <div className="text-xs text-nx-muted">
                {when(s.at)} · {REASONS[s.reason]} · {scopeList(s)}
                {s.appVersion && ` · versie ${s.appVersion}`}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className={small} onClick={() => onPick(s.id)}>
                  Bekijken en herstellen
                </button>
                <button
                  type="button"
                  className={small}
                  onClick={() => {
                    setName(s.label)
                    setRenaming(s.id)
                  }}
                >
                  Hernoemen
                </button>
                {s.reason !== 'manual' && (
                  <button type="button" className={small} onClick={() => timeMachineStore.update((st) => keepSnapshot(st, s.id))}>
                    Bewaren
                  </button>
                )}
                <button type="button" className={small} onClick={() => timeMachineStore.update((st) => removeSnapshot(st, s.id))}>
                  Verwijderen
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function History() {
  const { history } = useTimeMachine()
  if (history.length === 0) return <p className="text-nx-muted">Je hebt nog niets hersteld.</p>
  return (
    <ul className="space-y-2" aria-label="Geschiedenis">
      {history.map((j) => (
        <li key={j.id} className="rounded-lg border border-nx-border p-3">
          <div className="font-medium">
            {j.status === 'done' ? 'Hersteld' : 'Teruggedraaid'}: {j.snapshotLabel}
          </div>
          <div className="text-xs text-nx-muted">
            {when(j.at)} · {j.scopes.map((s) => SCOPE_NAMES[s]).join(', ')}
          </div>
          {j.detail && <p className="mt-1 text-xs">{j.detail}</p>}
        </li>
      ))}
    </ul>
  )
}

function Restore({ picked, onPick }: { picked: string | null; onPick: (id: string) => void }) {
  const { snapshots } = useTimeMachine()
  const snapshot = snapshots.find((s) => s.id === picked) ?? snapshots[0]
  const [scopes, setScopes] = useState<Set<SnapshotScope>>(new Set(SNAPSHOT_SCOPES))
  const [result, setResult] = useState<RestoreResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Recomputed after a restore too, so the preview then says everything is the same.
  const diffs = useMemo(
    () => (snapshot ? SNAPSHOT_SCOPES.filter((s) => snapshot.scopes[s] !== undefined).map((s) => ({ scope: s, changes: diffScope(s, captureScope(s), snapshot.scopes[s], names) })) : []),
    [snapshot, result],
  )
  if (!snapshot) return <p className="text-nx-muted">Nog geen herstelpunten. Maak er een in Herstelpunten.</p>
  const chosen = diffs.filter((d) => scopes.has(d.scope) && d.changes.length > 0)
  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-nx-muted">Herstelpunt</span>
        <select
          value={snapshot.id}
          onChange={(e) => {
            onPick(e.target.value)
            setResult(null)
          }}
          className={field}
        >
          {snapshots.map((s) => (
            <option key={s.id} value={s.id}>
              {when(s.at)}: {s.label}
            </option>
          ))}
        </select>
      </label>
      <div className="space-y-3">
        {diffs.map(({ scope, changes }) => (
          <fieldset key={scope} className="rounded-lg border border-nx-border p-3">
            <legend className="px-1">
              <label className="flex items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={scopes.has(scope)}
                  disabled={changes.length === 0}
                  onChange={(e) => {
                    const next = new Set(scopes)
                    if (e.target.checked) next.add(scope)
                    else next.delete(scope)
                    setScopes(next)
                  }}
                  className="accent-[var(--nx-accent)]"
                />
                {SCOPE_NAMES[scope]}
              </label>
            </legend>
            {changes.length === 0 ? (
              <p className="text-nx-muted">Al hetzelfde als nu.</p>
            ) : (
              <ul className="space-y-1" aria-label={`Wat verandert in ${SCOPE_NAMES[scope]}`}>
                {changes.map((c, i) => (
                  <li key={i}>
                    <span className="text-nx-muted">{c.where}:</span> {c.what}
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        ))}
      </div>
      <p className="text-nx-muted">
        Voor het herstel maakt NEXUS een herstelpunt van hoe het nu is, zodat je altijd terug kan. Je andere toestellen nemen het herstel over bij hun volgende
        sync.
      </p>
      <button
        type="button"
        className={primary}
        disabled={chosen.length === 0}
        onClick={() => {
          try {
            setError(null)
            setResult(restoreSnapshot(snapshot.id, chosen.map((d) => d.scope)))
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
          }
        }}
      >
        Herstellen
      </button>
      {result && (
        <p role="status" className={result.ok ? '' : 'text-red-500'}>
          {result.ok ? `Hersteld: ${result.job.scopes.map((s) => SCOPE_NAMES[s]).join(', ')}.` : result.job.detail}
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-500">
          {error}
        </p>
      )}
    </>
  )
}

function Settings() {
  const { settings, snapshots } = useTimeMachine()
  const change = (patch: Parameters<typeof setTmSettings>[1]) => timeMachineStore.update((s) => setTmSettings(s, patch, Date.now()))
  const size = snapshots.reduce((n, s) => n + s.size, 0)
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={settings.auto} onChange={(e) => change({ auto: e.target.checked })} className="accent-[var(--nx-accent)]" />
        Automatisch een herstelpunt maken bij het openen van NEXUS, na een update en na een wijziging
      </label>
      <label className="flex flex-wrap items-center gap-2">
        Automatische herstelpunten bewaren: hoogstens
        <select aria-label="Aantal" value={settings.maxCount} onChange={(e) => change({ maxCount: Number(e.target.value) })} className={field}>
          {TM_COUNT_CHOICES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        , en niet ouder dan
        <select aria-label="Dagen" value={settings.retentionDays} onChange={(e) => change({ retentionDays: Number(e.target.value) })} className={field}>
          {TM_DAYS_CHOICES.map((n) => (
            <option key={n} value={n}>
              {n} dagen
            </option>
          ))}
        </select>
      </label>
      <p className="text-nx-muted">
        Herstelpunten die je zelf maakt of bewaart, blijven tot je ze verwijdert. Ze staan alleen op dit toestel ({snapshots.length} herstelpunten, {Math.ceil(size / 1024)} kB).
        Configuratieherstel is geen volledige back-up van je pc of je bestanden.
      </p>
      <button type="button" className={button} onClick={() => timeMachineStore.update((s) => ({ ...s, snapshots: s.snapshots.filter((x) => x.reason === 'manual') }))}>
        Automatische herstelpunten wissen
      </button>
    </div>
  )
}
