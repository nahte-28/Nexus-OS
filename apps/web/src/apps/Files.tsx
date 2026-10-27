import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { DEFAULT_STUDY_OPTIONS, formatSize, previewKind, studyKind, studyNoteTitle, type StudyOptions } from '@nexus/core'
import { addFolder, allowRead, canOpenFolders, forgetFolder, listFolder, savedFolders, type FolderEntry, type SavedFolder } from '../files/folders'
import { filesStore } from '../files/store'
import { saveStudyNote, studyFile, studyPayload } from '../files/study'
import { filesSyncProblem } from '../files/sync'

const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const smallButton = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-60'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'
const TABS = ['Mijn bestanden', 'Op deze pc'] as const

/** A file to show or to study: from your files in NEXUS or straight from a folder. */
interface Opened {
  name: string
  blob: Blob
  /** Set for a file that is not in Mijn bestanden yet. */
  keep?: () => Promise<void>
}

const day = (t: number) => new Date(t).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Bestanden: your own files in NEXUS, folders on this pc, and NEXUS AI to study from them. */
export function Files() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Mijn bestanden')
  const [viewing, setViewing] = useState<Opened | null>(null)
  const [studying, setStudying] = useState<Opened | null>(null)
  const [error, setError] = useState<string | null>(null)
  const problem = useSyncExternalStore(filesSyncProblem.subscribe, filesSyncProblem.getSnapshot)
  const run = (task: () => Promise<void>) => {
    setError(null)
    task().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }
  const actions = { view: (o: Opened) => setViewing(o), study: (o: Opened) => setStudying(o), run }

  if (viewing) return <Viewer opened={viewing} onClose={() => setViewing(null)} onStudy={() => (setStudying(viewing), setViewing(null))} />
  if (studying) return <Study opened={studying} onClose={() => setStudying(null)} />
  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div role="tablist" className="flex gap-1 border-b border-nx-border px-3 py-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1 ${tab === t ? 'bg-nx-surface-2 font-medium' : 'hover:bg-nx-surface-2'}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {problem === 'setup' && (
          <p className="rounded-lg border border-nx-border bg-nx-surface-2 p-3">
            Je bestanden staan alleen op dit apparaat: de opslag in je account is nog niet ingesteld. Voer{' '}
            <code className="font-mono text-xs">supabase/migrations/20261027130000_files.sql</code> uit in de SQL Editor van Supabase.
          </p>
        )}
        {error && (
          <p role="alert" className="text-red-500">
            {error}
          </p>
        )}
        {tab === 'Mijn bestanden' ? <MyFiles {...actions} /> : <ThisPc {...actions} />}
      </div>
    </div>
  )
}

interface Actions {
  view: (o: Opened) => void
  study: (o: Opened) => void
  run: (task: () => Promise<void>) => void
}

function PickFiles({ label, onFiles }: { label: string; onFiles: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <button type="button" className={primaryButton} onClick={() => input.current?.click()}>
        {label}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        aria-label={label}
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
    </>
  )
}

function MyFiles({ view, study, run }: Actions) {
  const files = useSyncExternalStore(filesStore.subscribe, filesStore.getSnapshot)
  const [query, setQuery] = useState('')
  const shown = files.filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase()))
  const open = (id: string, name: string, then: (o: Opened) => void) => run(async () => then({ name, blob: await filesStore.blob(id) }))
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <PickFiles label="Bestanden toevoegen" onFiles={(list) => run(async () => void (await Promise.all(list.map((f) => filesStore.add(f, f.name)))))} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoeken" aria-label="Zoeken in je bestanden" className={`${field} max-w-60 flex-1`} />
      </div>
      <p className="text-nx-muted">Je bestanden werken offline. Met een account staan ze ook op je andere apparaten, alleen voor jou.</p>
      {shown.length === 0 ? (
        <p className="text-nx-muted">{files.length === 0 ? 'Nog geen bestanden. Voeg bv. je samenvattingen toe.' : 'Niets gevonden.'}</p>
      ) : (
        <ul className="space-y-2" aria-label="Mijn bestanden">
          {shown.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-nx-border bg-nx-surface-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{f.name}</p>
                <p className="text-xs text-nx-muted">
                  {formatSize(f.size)} · {day(f.addedAt)} · {f.remote ? (f.offline ? 'in je account en hier' : 'in je account') : 'alleen hier'}
                </p>
              </div>
              <button type="button" className={smallButton} onClick={() => open(f.id, f.name, view)}>
                Openen
              </button>
              {studyKind(f.name, f.mediaType) && (
                <button type="button" className={smallButton} onClick={() => open(f.id, f.name, study)}>
                  AI-samenvatting
                </button>
              )}
              <button type="button" className={smallButton} onClick={() => open(f.id, f.name, (o) => download(o.name, o.blob))}>
                Downloaden
              </button>
              <button type="button" className={`${smallButton} text-red-500`} onClick={() => window.confirm(`"${f.name}" verwijderen, ook op je andere apparaten?`) && run(() => filesStore.remove(f.id))}>
                Verwijderen
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function ThisPc({ view, study, run }: Actions) {
  const [folders, setFolders] = useState<SavedFolder[]>([])
  // The folders you went into, from the saved folder down.
  const [path, setPath] = useState<Array<{ name: string; handle: FileSystemDirectoryHandle }>>([])
  const [entries, setEntries] = useState<FolderEntry[] | null>(null)
  const [needsPermission, setNeedsPermission] = useState<SavedFolder | null>(null)
  const supported = canOpenFolders()

  useEffect(() => {
    void savedFolders().then(setFolders)
  }, [])
  useEffect(() => {
    const current = path.at(-1)
    if (!current) return setEntries(null)
    let cancelled = false
    listFolder(current.handle).then(
      (list) => !cancelled && setEntries(list),
      () => !cancelled && setEntries([]),
    )
    return () => {
      cancelled = true
    }
  }, [path])

  const enter = (folder: SavedFolder) =>
    run(async () => {
      if (!(await allowRead(folder.handle))) return setNeedsPermission(folder)
      setNeedsPermission(null)
      setPath([{ name: folder.name, handle: folder.handle }])
    })
  const fileOf = async (entry: FolderEntry): Promise<Opened> => {
    const file = await (entry.handle as FileSystemFileHandle).getFile()
    return { name: entry.name, blob: file, keep: async () => void (await filesStore.add(file, entry.name)) }
  }

  if (!supported) {
    return (
      <>
        <p className="text-nx-muted">Deze browser kan geen mappen van je computer openen (dat kan in Chrome of Edge op een computer en in de Windows-app). Je kunt wel losse bestanden kiezen om te bekijken of samen te vatten.</p>
        <PickFiles label="Bestand kiezen" onFiles={(list) => list[0] && view({ name: list[0].name, blob: list[0], keep: async () => void (await filesStore.add(list[0], list[0].name)) })} />
      </>
    )
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={primaryButton}
          onClick={() =>
            run(async () => {
              const folder = await addFolder()
              if (!folder) return
              setFolders(await savedFolders())
              setPath([{ name: folder.name, handle: folder.handle }])
            })
          }
        >
          Map toevoegen
        </button>
        {folders.map((f) => (
          <span key={f.id} className="flex items-center rounded-lg border border-nx-border">
            <button type="button" className="px-2 py-1" onClick={() => enter(f)}>
              📁 {f.name}
            </button>
            <button
              type="button"
              aria-label={`${f.name} vergeten`}
              className="border-l border-nx-border px-2 py-1 text-nx-muted"
              onClick={() =>
                run(async () => {
                  await forgetFolder(f.id)
                  setFolders(await savedFolders())
                  if (path[0]?.name === f.name) setPath([])
                })
              }
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <p className="text-nx-muted">NEXUS leest alleen de mappen die je kiest, en past er niets in aan.</p>
      {needsPermission && (
        <button type="button" className={button} onClick={() => enter(needsPermission)}>
          Toegang geven tot {needsPermission.name}
        </button>
      )}
      {path.length > 0 && (
        <nav aria-label="Map" className="flex flex-wrap items-center gap-1 text-nx-muted">
          {path.map((p, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && '›'}
              <button type="button" className={i === path.length - 1 ? 'font-medium text-nx-text' : 'hover:underline'} onClick={() => setPath(path.slice(0, i + 1))}>
                {p.name}
              </button>
            </span>
          ))}
        </nav>
      )}
      {entries && (
        <ul className="divide-y divide-nx-border rounded-lg border border-nx-border" aria-label="Inhoud van de map">
          {entries.length === 0 && <li className="p-3 text-nx-muted">Deze map is leeg.</li>}
          {entries.map((e) => (
            <li key={e.name} className="flex flex-wrap items-center gap-2 px-3 py-2">
              {e.kind === 'directory' ? (
                <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => setPath([...path, { name: e.name, handle: e.handle as FileSystemDirectoryHandle }])}>
                  📁 {e.name}
                </button>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate">📄 {e.name}</span>
                  <button type="button" className={smallButton} onClick={() => run(async () => view(await fileOf(e)))}>
                    Openen
                  </button>
                  {studyKind(e.name) && (
                    <button type="button" className={smallButton} onClick={() => run(async () => study(await fileOf(e)))}>
                      AI-samenvatting
                    </button>
                  )}
                  <button type="button" className={smallButton} onClick={() => run(async () => (await fileOf(e)).keep?.())}>
                    Naar Mijn bestanden
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function useObjectUrl(blob: Blob, type?: string): string {
  const [url] = useState(() => URL.createObjectURL(type && blob.type !== type ? new Blob([blob], { type }) : blob))
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  return url
}

function Header({ title, onClose, children }: { title: string; onClose: () => void; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-nx-border px-3 py-2">
      <button type="button" className={smallButton} onClick={onClose}>
        ‹ Terug
      </button>
      <h2 className="min-w-0 flex-1 truncate font-medium">{title}</h2>
      {children}
    </div>
  )
}

function Viewer({ opened, onClose, onStudy }: { opened: Opened; onClose: () => void; onStudy: () => void }) {
  const kind = previewKind(opened.name, opened.blob.type)
  const url = useObjectUrl(opened.blob, kind === 'pdf' ? 'application/pdf' : undefined)
  const [text, setText] = useState<string | null>(null)
  const [kept, setKept] = useState(false)
  useEffect(() => {
    if (kind === 'text') void opened.blob.slice(0, 500_000).text().then(setText)
  }, [kind, opened.blob])
  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <Header title={opened.name} onClose={onClose}>
        {studyKind(opened.name, opened.blob.type) && (
          <button type="button" className={smallButton} onClick={onStudy}>
            AI-samenvatting
          </button>
        )}
        {opened.keep && (
          <button type="button" className={smallButton} disabled={kept} onClick={() => void opened.keep?.().then(() => setKept(true))}>
            {kept ? 'In Mijn bestanden' : 'Naar Mijn bestanden'}
          </button>
        )}
        <button type="button" className={smallButton} onClick={() => download(opened.name, opened.blob)}>
          Downloaden
        </button>
      </Header>
      <div className="min-h-0 flex-1 overflow-auto">
        {kind === 'pdf' && <iframe title={opened.name} src={url} className="h-full w-full border-0" />}
        {kind === 'image' && <img src={url} alt={opened.name} className="mx-auto max-h-full max-w-full object-contain p-2" />}
        {kind === 'text' && <pre className="p-4 font-mono text-xs whitespace-pre-wrap">{text ?? 'Laden…'}</pre>}
        {kind === 'none' && (
          <p className="p-4 text-nx-muted">
            NEXUS kan dit soort bestand niet tonen. Download het om het te openen{studyKind(opened.name) ? ', of laat NEXUS AI het samenvatten' : ''}.
          </p>
        )}
      </div>
    </div>
  )
}

function Study({ opened, onClose }: { opened: Opened; onClose: () => void }) {
  const [options, setOptions] = useState<StudyOptions>(DEFAULT_STUDY_OPTIONS)
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const start = () => {
    setError(null)
    setText('')
    setState('busy')
    void (async () => {
      try {
        const payload = await studyPayload(opened.name, opened.blob)
        const result = await studyFile(opened.name, payload, options, setText)
        saveStudyNote(studyNoteTitle(opened.name), opened.name, result)
        setState('done')
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setState('idle')
      }
    })()
  }
  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <Header title={`AI-samenvatting: ${opened.name}`} onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <p className="text-nx-muted">NEXUS AI leest dit bestand en maakt er een eigen samenvatting van om mee te studeren. Het resultaat komt in Notities. Het bestand wordt alleen voor deze vraag naar de AI gestuurd.</p>
        <fieldset className="space-y-1" disabled={state === 'busy'}>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={options.additions} onChange={(e) => setOptions({ ...options, additions: e.target.checked })} />
            Interessante aanvullingen toevoegen
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={options.feedback} onChange={(e) => setOptions({ ...options, feedback: e.target.checked })} />
            Feedback geven op deze samenvatting
          </label>
          <input
            value={options.focus}
            onChange={(e) => setOptions({ ...options, focus: e.target.value })}
            maxLength={500}
            placeholder="Wens (optioneel), bv. focus op de formules van hoofdstuk 3"
            aria-label="Wens"
            className={field}
          />
        </fieldset>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={primaryButton} disabled={state === 'busy'} onClick={start}>
            {state === 'busy' ? 'Bezig…' : state === 'done' ? 'Opnieuw maken' : 'Samenvatting maken'}
          </button>
          {state === 'done' && <span className="text-nx-muted">Bewaard in Notities als "{studyNoteTitle(opened.name)}".</span>}
        </div>
        {error && (
          <p role="alert" className="text-red-500">
            {error}
          </p>
        )}
        {text && (
          <article aria-label="Samenvatting" className="rounded-lg border border-nx-border bg-nx-surface-2 p-3 whitespace-pre-wrap">
            {text}
          </article>
        )}
      </div>
    </div>
  )
}
