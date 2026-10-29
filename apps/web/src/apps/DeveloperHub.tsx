import { useEffect, useState } from 'react'
import {
  installedVersion,
  MANIFEST_KEYS,
  parseManifest,
  PERMISSION_INFO,
  PERMISSIONS,
  reviewProject,
  rollbackTarget,
  SDK_METHODS,
  type ExtPermission,
  type ExtProject,
  type ExtVersion,
} from '@nexus/core'
import type { CallLog } from '../devhub/broker'
import { SandboxFrame, SANDBOX_POLICY } from '../devhub/SandboxFrame'
import { createProject, deleteProject, install, publish, removeWidget, saveProject, useDevHub } from '../devhub/store'
import { onReveal, takeReveal } from '../search/reveal'
import { readStorage, writeStorage } from '../state/storage'

const TABS = ['Projecten', 'SDK', 'Sandbox', 'Reviews'] as const
type Tab = (typeof TABS)[number]
const TAB_KEY = 'nexus.devhub.tab'
const PROJECT_KEY = 'nexus.devhub.project'

const primary = 'rounded-lg bg-nx-accent px-3 py-1.5 font-medium text-nx-accent-text disabled:opacity-60'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 hover:bg-nx-surface-2 disabled:opacity-60'
const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2'
const area = 'w-full rounded-md border border-nx-border bg-nx-surface p-2 font-mono text-xs'
const when = (t: number) => new Date(t).toLocaleString('nl-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export const projectName = (p: ExtProject) => {
  const parsed = parseManifest(p.manifest)
  return 'manifest' in parsed ? parsed.manifest.name : (p.versions.at(-1)?.manifest.name ?? 'Project zonder geldig manifest')
}

/** Developer Hub: build your own widgets with the SDK, try them in the sandbox, review and install them. */
export function DeveloperHub() {
  const [tab, setTabState] = useState<Tab>(() => ((TABS as readonly string[]).includes(readStorage(TAB_KEY) ?? '') ? (readStorage(TAB_KEY) as Tab) : 'Projecten'))
  const setTab = (t: Tab) => {
    setTabState(t)
    writeStorage(TAB_KEY, t)
  }
  const { projects } = useDevHub()
  const [selectedId, setSelectedState] = useState<string | null>(() => readStorage(PROJECT_KEY))
  const select = (id: string | null) => {
    setSelectedState(id)
    writeStorage(PROJECT_KEY, id ?? '')
  }
  const selected = projects.find((p) => p.id === selectedId) ?? projects[0] ?? null
  // Opened from a widget's notice in the Inbox: show that project's review and versions.
  useEffect(() => {
    const check = () => {
      const id = takeReveal('devhub')
      if (!id) return
      select(id)
      setTab('Reviews')
    }
    check()
    return onReveal(check)
  }, [])
  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div role="tablist" aria-label="Developer Hub" className="flex gap-1 overflow-x-auto border-b border-nx-border px-3 py-2">
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
        {tab === 'SDK' ? (
          <Sdk />
        ) : (
          <>
            {projects.length > 1 && (
              <label className="flex items-center gap-2">
                <span className="text-nx-muted">Project</span>
                <select value={selected?.id ?? ''} onChange={(e) => select(e.target.value)} className="min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5">
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {projectName(p)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {tab === 'Projecten' ? (
              <Projects project={selected} onSelect={select} />
            ) : !selected ? (
              <p className="text-nx-muted">Maak eerst een project in het tabblad Projecten.</p>
            ) : tab === 'Sandbox' ? (
              <Sandbox key={selected.id} project={selected} />
            ) : (
              <Reviews project={selected} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Projects({ project, onSelect }: { project: ExtProject | null; onSelect: (id: string | null) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [sure, setSure] = useState(false)
  const create = () => {
    try {
      onSelect(createProject())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mislukt')
    }
  }
  if (!project) {
    return (
      <div className="space-y-2">
        <p className="text-nx-muted">Bouw je eigen widget voor het dashboard. Je begint met een voorbeeldproject dat je deadlines van deze week telt. Alles blijft op dit toestel; er wordt niets geüpload.</p>
        <button type="button" className={primary} onClick={create}>
          Voorbeeldproject maken
        </button>
        {error && <p role="alert">{error}</p>}
      </div>
    )
  }
  const parsed = parseManifest(project.manifest)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{projectName(project)}</h2>
        <div className="flex gap-2">
          <button type="button" className={small} onClick={create}>
            Nieuw project
          </button>
          {sure ? (
            <>
              <button
                type="button"
                className={small}
                onClick={() => {
                  deleteProject(project.id)
                  onSelect(null)
                  setSure(false)
                }}
              >
                Ja, verwijderen
              </button>
              <button type="button" className={small} onClick={() => setSure(false)}>
                Nee
              </button>
            </>
          ) : (
            <button type="button" className={small} onClick={() => setSure(true)}>
              Project verwijderen
            </button>
          )}
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      <label className="block space-y-1">
        <span className="font-medium">Manifest</span>
        <textarea aria-label="Manifest" spellCheck={false} rows={8} className={area} value={project.manifest} onChange={(e) => saveProject(project.id, { manifest: e.target.value })} />
      </label>
      <p className={'manifest' in parsed ? 'text-xs text-nx-muted' : 'text-xs'}>{'manifest' in parsed ? 'Het manifest is geldig.' : parsed.error}</p>
      <label className="block space-y-1">
        <span className="font-medium">Code</span>
        <textarea aria-label="Code" spellCheck={false} rows={14} className={area} value={project.code} onChange={(e) => saveProject(project.id, { code: e.target.value })} />
      </label>
      <p className="text-xs text-nx-muted">Wijzigingen worden meteen bewaard. Probeer ze uit in Sandbox; je dashboard verandert pas als je een nieuwe versie publiceert en installeert in Reviews.</p>
    </div>
  )
}

function Sdk() {
  return (
    <div className="space-y-4">
      <section className="space-y-1">
        <h2 className="font-semibold">Zo werkt een widget</h2>
        <p className="text-nx-muted">
          Je code draait in een afgeschermd venster zonder netwerk, opslag of toegang tot NEXUS en je account. Het enige wat ze kan, is gegevens vragen met <code>await nexus.call(&apos;methode&apos;)</code>, en dat lukt alleen met de permissie
          uit het manifest die jij hebt toegestaan. Toon iets met gewone DOM-code, zoals <code>document.body.append(...)</code>. De klassen <code>big</code> en <code>muted</code> volgen je thema.
        </p>
      </section>
      <section className="space-y-1">
        <h2 className="font-semibold">Methodes</h2>
        <table className="w-full text-left text-xs">
          <thead className="text-nx-muted">
            <tr>
              <th className="py-1 pr-2">Methode</th>
              <th className="py-1 pr-2">Permissie</th>
              <th className="py-1">Geeft terug</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(SDK_METHODS).map(([name, m]) => (
              <tr key={name} className="border-t border-nx-border align-top">
                <td className="py-1 pr-2 font-mono">{name}</td>
                <td className="py-1 pr-2 font-mono">{m.permission}</td>
                <td className="py-1">
                  {m.summary} <span className="font-mono">{m.returns}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="space-y-1">
        <h2 className="font-semibold">Permissies</h2>
        <ul className="space-y-1">
          {PERMISSIONS.map((p) => (
            <li key={p}>
              <span className="font-mono text-xs">{p}</span>: {PERMISSION_INFO[p].title}. <span className="text-nx-muted">{PERMISSION_INFO[p].detail}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-1">
        <h2 className="font-semibold">Manifest</h2>
        <p className="text-nx-muted">
          Velden: {MANIFEST_KEYS.join(', ')}. Het id blijft gelijk over versies, de versie heeft drie getallen (1.0.0) en gaat bij elke publicatie omhoog. Vraag alleen de permissies die je code gebruikt; de review weigert andere velden en ongebruikte
          permissies.
        </p>
      </section>
      <section className="space-y-1">
        <h2 className="font-semibold">Wat de review weigert</h2>
        <p className="text-nx-muted">Netwerk (fetch, WebSocket), code uit tekst (eval, Function, import()), opslag (localStorage, cookies), NEXUS zelf aanspreken (parent, top) en nexus.call met een berekende naam. De sandbox blokkeert die dingen ook zelf.</p>
        <p className="font-mono text-xs text-nx-muted">{SANDBOX_POLICY}</p>
      </section>
    </div>
  )
}

function Sandbox({ project }: { project: ExtProject }) {
  const parsed = parseManifest(project.manifest)
  const asked = 'manifest' in parsed ? parsed.manifest.permissions : []
  const [off, setOff] = useState<ExtPermission[]>([])
  const [run, setRun] = useState(0)
  const [log, setLog] = useState<CallLog[]>([])
  const granted = asked.filter((p) => !off.includes(p))
  const restart = () => {
    setLog([])
    setRun((n) => n + 1)
  }
  return (
    <div className="space-y-3">
      <p className="text-nx-muted">De code uit Projecten, met de permissies uit het manifest. Zet er een uit om te zien wat de widget doet als ze geweigerd wordt.</p>
      {'error' in parsed && <p role="alert">{parsed.error} De sandbox draait zonder permissies.</p>}
      {asked.length > 0 && (
        <fieldset className="flex flex-wrap gap-3">
          <legend className="sr-only">Permissies in de sandbox</legend>
          {asked.map((p) => (
            <label key={p} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={!off.includes(p)}
                onChange={(e) => {
                  setOff((o) => (e.target.checked ? o.filter((x) => x !== p) : [...o, p]))
                  restart()
                }}
              />
              {PERMISSION_INFO[p].title}
            </label>
          ))}
        </fieldset>
      )}
      <div className="flex gap-2">
        <button type="button" className={button} onClick={restart}>
          Opnieuw starten
        </button>
      </div>
      <SandboxFrame
        key={`${run}:${granted.join(',')}`}
        extId={project.id}
        name={'manifest' in parsed ? parsed.manifest.name : 'Sandbox'}
        code={project.code}
        granted={granted}
        title="Sandbox"
        onLog={(e) => setLog((l) => [e, ...l].slice(0, 50))}
      />
      <section aria-label="Aanroepen" className="space-y-1">
        <h2 className="font-semibold">Aanroepen</h2>
        {log.length === 0 ? (
          <p className="text-nx-muted">Nog geen aanroepen.</p>
        ) : (
          <ul className="space-y-0.5 font-mono text-xs">
            {log.map((e, i) => (
              <li key={i}>
                {new Date(e.at).toLocaleTimeString('nl-BE')} {e.method}: {e.outcome}
                {e.detail ? ` (${e.detail})` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Reviews({ project }: { project: ExtProject }) {
  const hub = useDevHub()
  const checks = reviewProject(project.manifest, project.code, project.versions)
  const ready = checks.every((c) => c.ok)
  const current = installedVersion(hub, project.id)
  const back = rollbackTarget(hub, project.id)
  const [asking, setAsking] = useState<ExtVersion | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const doPublish = () => {
    try {
      publish(project.id)
      setMessage('Gepubliceerd. Installeer de nieuwe versie om ze op je dashboard te zetten.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Mislukt')
    }
  }
  return (
    <div className="space-y-4">
      {message && (
        <p role="status" className="text-nx-muted">
          {message}
        </p>
      )}
      <section aria-label="Review" className="space-y-2">
        <h2 className="font-semibold">Review van de huidige code</h2>
        <ul className="space-y-1">
          {checks.map((c) => (
            <li key={c.id}>
              <span aria-hidden>{c.ok ? '✓' : '✗'}</span> <span className="font-medium">{c.title}</span>: <span className={c.ok ? 'text-nx-muted' : ''}>{c.detail}</span>
            </li>
          ))}
        </ul>
        <button type="button" className={primary} disabled={!ready} onClick={doPublish}>
          Versie publiceren
        </button>
      </section>

      <section aria-label="Versies" className="space-y-2">
        <h2 className="font-semibold">Versies</h2>
        {current ? (
          <div className="flex flex-wrap items-center gap-2">
            <p>
              Op je dashboard: versie {current.install.version}, geïnstalleerd {when(current.install.installedAt)}.
            </p>
            {back && (
              <button type="button" className={small} onClick={() => setAsking(back)}>
                Terugdraaien naar {back.version}
              </button>
            )}
            <button
              type="button"
              className={small}
              onClick={() => {
                removeWidget(project.id)
                setMessage('Van je dashboard gehaald. De versies blijven bewaard.')
              }}
            >
              Van dashboard halen
            </button>
          </div>
        ) : (
          <p className="text-nx-muted">Nog niet op je dashboard.</p>
        )}
        {project.versions.length === 0 ? (
          <p className="text-nx-muted">Nog niets gepubliceerd.</p>
        ) : (
          <ul className="space-y-1">
            {[...project.versions].reverse().map((v) => (
              <li key={v.version} className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{v.version}</span>
                <span className="text-nx-muted">{when(v.publishedAt)}</span>
                {current?.install.version !== v.version && (
                  <button type="button" className={small} onClick={() => setAsking(v)}>
                    Installeren
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {asking && (
        <div role="dialog" aria-label="Permissies" className="space-y-2 rounded-xl border border-nx-border bg-nx-surface-2 p-3">
          <p className="font-medium">
            {asking.manifest.name} {asking.version} op je dashboard zetten?
          </p>
          {asking.manifest.permissions.length === 0 ? (
            <p className="text-nx-muted">Deze versie vraagt geen gegevens van NEXUS.</p>
          ) : (
            <>
              <p className="text-nx-muted">Deze versie mag:</p>
              <ul className="list-disc space-y-1 pl-5">
                {asking.manifest.permissions.map((p) => (
                  <li key={p}>
                    {PERMISSION_INFO[p].title}. <span className="text-nx-muted">{PERMISSION_INFO[p].detail}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="text-xs text-nx-muted">Ze draait afgeschermd, zonder netwerk of toegang tot je account. Terugdraaien of weghalen kan altijd.</p>
          <div className="flex gap-2">
            <button
              type="button"
              className={primary}
              onClick={() => {
                install(project.id, asking.version)
                setMessage(`Versie ${asking.version} staat op je dashboard.`)
                setAsking(null)
              }}
            >
              Toestaan en installeren
            </button>
            <button type="button" className={button} onClick={() => setAsking(null)}>
              Annuleren
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
