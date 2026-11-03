import { useState, useSyncExternalStore } from 'react'
import {
  activeShares,
  addCollection,
  addLink,
  addShare,
  addVersion,
  daysLeftInTrash,
  deleteCollection,
  formatSize,
  vaultCollections,
  noteTitle,
  normalizeTag,
  projectsOf,
  removeLink,
  renameCollection,
  restoreFile,
  setInCollection,
  setTags,
  SHARE_DURATIONS,
  studyKind,
  trashFile,
  TRASH_DAYS,
  vaultTags,
  vaultView,
  versionsOf,
  type FileMeta,
  type VaultEntry,
  type VaultLink,
  type VaultState,
} from '@nexus/core'
import { lifeStore } from '../life/store'
import { openApp } from '../shell/openApp'
import { notesStore } from '../state/notesStore'
import { supabase } from '../sync/supabase'
import { createShareLink, deleteForGood, useVault, vaultStore, vaultSyncProblem } from '../vault/store'
import { filesStore, type FileEntry } from './store'

const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const smallButton = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-60'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'
const day = (t: number) => new Date(t).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })
const moment = (t: number) => new Date(t).toLocaleString('nl-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const newId = () => crypto.randomUUID()

export const VAULT_TABS = ['Mijn bestanden', 'Verzamelingen', 'Prullenbak', 'Deellinks', 'Op deze pc'] as const

export interface VaultActions {
  open: (file: FileMeta, how: 'view' | 'study' | 'download') => void
  run: (task: () => Promise<void>) => void
}

/** Changes the vault document; an { error } becomes a thrown Dutch message. */
function change(f: (s: VaultState) => VaultState | { error: string }): void {
  let problem: string | null = null
  vaultStore.update((s) => {
    const next = f(s)
    if ('error' in next) {
      problem = next.error
      return s
    }
    return next
  })
  if (problem) throw new Error(problem)
}

function useFiles() {
  return useSyncExternalStore(filesStore.subscribe, filesStore.getSnapshot)
}

function SyncNote() {
  const problem = useSyncExternalStore(vaultSyncProblem.subscribe, vaultSyncProblem.getSnapshot)
  if (!problem) return null
  return (
    <p className="rounded-lg border border-nx-border bg-nx-surface-2 p-3">
      Tags, verzamelingen en de prullenbak staan nu alleen op dit apparaat. {problem}
    </p>
  )
}

/** Mijn bestanden with Vault: filters, and per file its tags, collections, links, versions and sharing. */
export function VaultFiles({ open, run }: VaultActions) {
  const files = useFiles()
  const vault = useVault()
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [collection, setCollection] = useState<string | null>(null)
  const [details, setDetails] = useState<string | null>(null)
  const entries = vaultView(vault, files, { query, tag, collection })
  const tags = vaultTags(vault, files)
  const collections = vaultCollections(vault)
  return (
    <>
      <SyncNote />
      <div className="flex flex-wrap items-center gap-2">
        <label className={primaryButton}>
          Bestanden toevoegen
          <input type="file" multiple className="sr-only" onChange={(e) => {
            const list = [...(e.target.files ?? [])]
            e.target.value = ''
            run(async () => void (await Promise.all(list.map((f) => filesStore.add(f, f.name)))))
          }} />
        </label>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoeken op naam, tag of koppeling" aria-label="Zoeken in je bestanden" className={`${field} max-w-72 flex-1`} />
        {collections.length > 0 && (
          <select aria-label="Verzameling" className={`${field} max-w-48`} value={collection ?? ''} onChange={(e) => setCollection(e.target.value || null)}>
            <option value="">Alle verzamelingen</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter op tag">
          {tags.map((t) => (
            <button key={t.tag} type="button" aria-pressed={tag === t.tag} onClick={() => setTag(tag === t.tag ? null : t.tag)} className={`rounded-full border border-nx-border px-2 py-0.5 text-xs ${tag === t.tag ? 'bg-nx-accent text-nx-accent-text' : 'hover:bg-nx-surface-2'}`}>
              #{t.tag} <span className="opacity-70">{t.count}</span>
            </button>
          ))}
        </div>
      )}
      {entries.length === 0 ? (
        <p className="text-nx-muted">{files.length === 0 ? 'Nog geen bestanden. Voeg bv. je samenvattingen toe.' : 'Niets gevonden.'}</p>
      ) : (
        <ul className="space-y-2" aria-label="Mijn bestanden">
          {entries.map((e) => (
            <li key={e.file.id} className="rounded-lg border border-nx-border bg-nx-surface-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{e.file.name}</p>
                  <p className="text-xs text-nx-muted">
                    {formatSize(e.file.size)} · {day(e.file.addedAt)}
                    {e.versions > 0 && ` · ${e.versions + 1} versies`}
                    {e.meta.tags.length > 0 && ` · ${e.meta.tags.map((t) => `#${t}`).join(' ')}`}
                    {e.meta.links.length > 0 && ` · gekoppeld aan ${e.meta.links.map((l) => l.title).join(', ')}`}
                  </p>
                </div>
                <button type="button" className={smallButton} onClick={() => open(e.file, 'view')}>
                  Openen
                </button>
                {studyKind(e.file.name, e.file.mediaType) && (
                  <button type="button" className={smallButton} onClick={() => open(e.file, 'study')}>
                    AI-samenvatting
                  </button>
                )}
                <button type="button" className={smallButton} aria-expanded={details === e.file.id} onClick={() => setDetails(details === e.file.id ? null : e.file.id)}>
                  Details
                </button>
                <button type="button" className={`${smallButton} text-red-600 dark:text-red-400`} onClick={() => run(async () => change((s) => trashFile(s, e.file.id, Date.now())))}>
                  Naar prullenbak
                </button>
              </div>
              {details === e.file.id && <Details entry={e} files={files} open={open} run={run} />}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function Details({ entry, files, open, run }: { entry: VaultEntry<FileEntry>; files: FileEntry[]; open: VaultActions['open']; run: VaultActions['run'] }) {
  const vault = useVault()
  const [tagText, setTagText] = useState(entry.meta.tags.join(' '))
  const id = entry.file.id
  const versions = versionsOf(vault, files, id)
  return (
    <div className="mt-3 space-y-3 border-t border-nx-border pt-3">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(ev) => {
          ev.preventDefault()
          run(async () => change((s) => setTags(s, id, tagText.split(/[\s,]+/), Date.now())))
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="block text-xs text-nx-muted">Tags (spatie of komma ertussen)</span>
          <input className={field} value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="examen wiskunde" />
        </label>
        <button type="submit" className={smallButton}>
          Tags bewaren
        </button>
      </form>
      {tagText.trim() && <p className="text-xs text-nx-muted">Wordt: {[...new Set(tagText.split(/[\s,]+/).map(normalizeTag).filter(Boolean))].map((t) => `#${t}`).join(' ')}</p>}

      <Collections fileId={id} run={run} />
      <Links fileId={id} links={entry.meta.links} run={run} />

      <fieldset className="space-y-1">
        <legend className="text-xs font-medium">Versies</legend>
        <ul className="space-y-1">
          {versions.map((v, i) => (
            <li key={v.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="flex-1">
                {i === 0 ? 'Nieuwste' : `Versie ${versions.length - i}`} · {v.name} · {formatSize(v.size)} · {moment(v.addedAt)}
              </span>
              <button type="button" className={smallButton} onClick={() => open(v, 'download')}>
                Downloaden
              </button>
              {i > 0 && (
                <button
                  type="button"
                  className={smallButton}
                  onClick={() =>
                    run(async () => {
                      const blob = await filesStore.blob(v.id)
                      const copy = await filesStore.add(blob, v.name)
                      change((s) => addVersion(s, copy, id, Date.now()))
                    })
                  }
                >
                  Terugzetten als nieuwste
                </button>
              )}
            </li>
          ))}
        </ul>
        <label className={`${smallButton} inline-block cursor-pointer`}>
          Nieuwe versie uploaden
          <input type="file" className="sr-only" onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) run(async () => {
              const added = await filesStore.add(file, file.name)
              change((s) => addVersion(s, added, id, Date.now()))
            })
          }} />
        </label>
      </fieldset>

      <Share file={entry.file} run={run} />
    </div>
  )
}

function Collections({ fileId, run }: { fileId: string; run: VaultActions['run'] }) {
  const vault = useVault()
  const collections = vaultCollections(vault)
  const meta = vaultView(vault, filesStore.getSnapshot()).find((e) => e.file.id === fileId)?.meta
  if (collections.length === 0) return <p className="text-xs text-nx-muted">Maak verzamelingen in de tab Verzamelingen om bestanden te groeperen.</p>
  return (
    <fieldset>
      <legend className="text-xs font-medium">Verzamelingen</legend>
      <div className="flex flex-wrap gap-3">
        {collections.map((c) => (
          <label key={c.id} className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={meta?.collections.includes(c.id) ?? false} onChange={(e) => run(async () => change((s) => setInCollection(s, fileId, c.id, e.target.checked, Date.now())))} />
            {c.name}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function Links({ fileId, links, run }: { fileId: string; links: VaultLink[]; run: VaultActions['run'] }) {
  const notes = useSyncExternalStore(notesStore.subscribe, notesStore.getSnapshot)
  const life = useSyncExternalStore(lifeStore.subscribe, lifeStore.getSnapshot)
  const [pick, setPick] = useState('')
  const options: VaultLink[] = [
    ...projectsOf(life).filter((p) => !p.archived).map((p): VaultLink => ({ kind: 'project', id: p.id, title: p.name })),
    ...notes.map((n): VaultLink => ({ kind: 'note', id: n.id, title: noteTitle(n) })),
  ].filter((o) => !links.some((l) => l.kind === o.kind && l.id === o.id))
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs font-medium">Gekoppeld aan</legend>
      {links.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {links.map((l) => (
            <li key={`${l.kind}:${l.id}`} className="flex items-center gap-1 rounded-full border border-nx-border px-2 py-0.5 text-xs">
              <button type="button" className="underline" onClick={() => (l.kind === 'note' ? openApp('notes', l.id) : openApp('projecthub'))}>
                {l.kind === 'note' ? 'Notitie' : 'Project'}: {l.title}
              </button>
              <button type="button" aria-label={`Koppeling met ${l.title} weghalen`} onClick={() => run(async () => change((s) => removeLink(s, fileId, l, Date.now())))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <select aria-label="Koppelen aan project of notitie" className={`${field} max-w-64`} value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Kies een project of notitie</option>
            {options.map((o) => (
              <option key={`${o.kind}:${o.id}`} value={`${o.kind}:${o.id}`}>
                {o.kind === 'note' ? 'Notitie' : 'Project'}: {o.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={smallButton}
            disabled={!pick}
            onClick={() => {
              const link = options.find((o) => `${o.kind}:${o.id}` === pick)
              if (link) run(async () => change((s) => addLink(s, fileId, link, Date.now())))
              setPick('')
            }}
          >
            Koppelen
          </button>
        </div>
      )}
    </fieldset>
  )
}

function Share({ file, run }: { file: FileEntry; run: VaultActions['run'] }) {
  const [seconds, setSeconds] = useState(SHARE_DURATIONS[0].seconds)
  const [url, setUrl] = useState<string | null>(null)
  if (!supabase) return null
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs font-medium">Delen</legend>
      {!file.remote ? (
        <p className="text-xs text-nx-muted">Delen kan zodra het bestand in je account staat (aangemeld en gesynchroniseerd).</p>
      ) : (
        <>
          <p className="text-xs text-nx-muted">Iedereen met de link kan dit bestand downloaden tot hij vervalt. Intrekken kan niet eerder, dus kies zo kort als het kan.</p>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Geldig voor" className={`${field} max-w-32`} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
              {SHARE_DURATIONS.map((d) => (
                <option key={d.seconds} value={d.seconds}>
                  {d.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={smallButton}
              onClick={() =>
                run(async () => {
                  const now = Date.now()
                  const link = await createShareLink(supabase!, file, seconds)
                  vaultStore.update((s) => addShare(s, { id: newId(), fileId: file.id, fileName: file.name, createdAt: now, expiresAt: now + seconds * 1000 }))
                  setUrl(link)
                  await navigator.clipboard?.writeText(link).catch(() => {})
                })
              }
            >
              Deellink maken
            </button>
          </div>
          {url && (
            <p className="text-xs">
              Gekopieerd naar je klembord: <input readOnly aria-label="Deellink" className={`${field} mt-1 font-mono`} value={url} onFocus={(e) => e.target.select()} />
            </p>
          )}
        </>
      )}
    </fieldset>
  )
}

/** Your collections: make, rename, remove; and how many files each holds. */
export function VaultCollections({ run }: Pick<VaultActions, 'run'>) {
  const vault = useVault()
  const files = useFiles()
  const [name, setName] = useState('')
  const entries = vaultView(vault, files)
  return (
    <>
      <SyncNote />
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          run(async () => {
            change((s) => addCollection(s, newId(), name, Date.now()))
            setName('')
          })
        }}
      >
        <input className={`${field} max-w-64`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Bv. Examens semester 1" aria-label="Naam van de nieuwe verzameling" />
        <button type="submit" className={primaryButton}>
          Verzameling maken
        </button>
      </form>
      {vaultCollections(vault).length === 0 ? (
        <p className="text-nx-muted">Nog geen verzamelingen. Een bestand kan in meerdere verzamelingen zitten.</p>
      ) : (
        <ul className="space-y-2" aria-label="Verzamelingen">
          {vaultCollections(vault).map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-nx-border p-3">
              <span className="flex-1">
                <span className="block font-medium">{c.name}</span>
                <span className="block text-xs text-nx-muted">{entries.filter((e) => e.meta.collections.includes(c.id)).length} bestanden</span>
              </span>
              <button
                type="button"
                className={smallButton}
                onClick={() => {
                  const next = window.prompt('Nieuwe naam', c.name)
                  if (next !== null) run(async () => change((s) => renameCollection(s, c.id, next, Date.now())))
                }}
              >
                Hernoemen
              </button>
              <button type="button" className={smallButton} onClick={() => window.confirm(`Verzameling "${c.name}" weghalen? De bestanden blijven.`) && run(async () => change((s) => deleteCollection(s, c.id, Date.now())))}>
                Weghalen
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/** The trash: back with one click for 30 days, then gone for good (all versions). */
export function VaultTrash({ run }: Pick<VaultActions, 'run'>) {
  const vault = useVault()
  const files = useFiles()
  const now = Date.now()
  const entries = vaultView(vault, files, { trash: true })
  return (
    <>
      <p className="text-nx-muted">Wat je weggooit, blijft hier {TRASH_DAYS} dagen, op al je apparaten. Daarna verdwijnt het met al zijn versies, ook uit je account.</p>
      {entries.length === 0 ? (
        <p className="text-nx-muted">De prullenbak is leeg.</p>
      ) : (
        <ul className="space-y-2" aria-label="Prullenbak">
          {entries.map((e) => (
            <li key={e.file.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-nx-border p-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{e.file.name}</span>
                <span className="block text-xs text-nx-muted">
                  Weggegooid {day(e.meta.trashedAt!)} · nog {daysLeftInTrash(e.meta.trashedAt!, now)} dagen{e.versions > 0 ? ` · ${e.versions + 1} versies` : ''}
                </span>
              </span>
              <button type="button" className={smallButton} onClick={() => run(async () => change((s) => restoreFile(s, e.file.id, Date.now())))}>
                Terugzetten
              </button>
              <button
                type="button"
                className={`${smallButton} text-red-600 dark:text-red-400`}
                onClick={() => window.confirm(`"${e.file.name}" en al zijn versies nu voorgoed verwijderen, ook op je andere apparaten?`) && run(() => deleteForGood(versionsOf(vault, files, e.file.id).map((v) => v.id)))}
              >
                Voorgoed verwijderen
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/** The share links you made and until when they work. */
export function VaultShares() {
  const vault = useVault()
  const now = Date.now()
  const active = activeShares(vault, now)
  const expired = vault.shares.filter((s) => s.expiresAt <= now)
  return (
    <>
      <p className="text-nx-muted">Een deellink werkt tot hij vervalt en kan niet eerder ingetrokken worden. NEXUS bewaart de link zelf niet, alleen dat je hem maakte.</p>
      {vault.shares.length === 0 ? (
        <p className="text-nx-muted">Je maakte nog geen deellinks. Dat kan bij Details van een bestand.</p>
      ) : (
        <ul className="space-y-1" aria-label="Deellinks">
          {[...active, ...expired].map((s) => (
            <li key={s.id} className="flex flex-wrap justify-between gap-2 rounded-md border border-nx-border px-3 py-2">
              <span>{s.fileName}</span>
              <span className="text-xs text-nx-muted">{s.expiresAt > now ? `werkt tot ${moment(s.expiresAt)}` : `vervallen ${moment(s.expiresAt)}`}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
