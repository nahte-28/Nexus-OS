/**
 * Developer Hub (blueprint fase 6): your own widgets, built with a small SDK, tried out in a
 * sandbox and installed only after a review and a permission dialog. First-party only: projects
 * live on this device and nothing is uploaded or shared. Pure logic; the web app runs the sandbox.
 */

/** What a widget may ask for. Each one is a dialog line when you install it. */
export type ExtPermission = 'agenda.read' | 'notes.read' | 'profile.read' | 'notify'

export const PERMISSION_INFO: Record<ExtPermission, { title: string; detail: string }> = {
  'agenda.read': { title: 'Je deadlines lezen', detail: 'De titel en het tijdstip van je volgende vijf open deadlines.' },
  'notes.read': { title: 'Je notities lezen', detail: 'De titel en de datum van je vijf laatst gewijzigde notities, niet de tekst.' },
  'profile.read': { title: 'Je actieve profiel zien', detail: 'Welk profiel nu aan staat, zoals School of Gaming.' },
  notify: { title: 'Meldingen sturen', detail: 'Een melding in je Inbox, hoogstens drie per minuut.' },
}

export const PERMISSIONS = Object.keys(PERMISSION_INFO) as ExtPermission[]

/** The SDK: every method a widget can call with nexus.call, and the permission it needs. */
export const SDK_METHODS: Record<string, { permission: ExtPermission; summary: string; returns: string }> = {
  'agenda.deadlines': { permission: 'agenda.read', summary: 'Je volgende open deadlines.', returns: '[{ title, dueAt }]' },
  'notes.recent': { permission: 'notes.read', summary: 'Je laatst gewijzigde notities.', returns: '[{ title, updatedAt }]' },
  'profile.active': { permission: 'profile.read', summary: 'Het profiel dat nu aan staat.', returns: '{ id, name }' },
  notify: { permission: 'notify', summary: 'Stuurt een melding naar je Inbox. Geef { title, body } mee.', returns: 'true' },
}

export type CallCheck = 'ok' | 'denied' | 'unknown'

/** The permission broker: a call goes through only for a known method whose permission you granted. */
export function checkCall(granted: readonly ExtPermission[], method: string): CallCheck {
  const m = Object.prototype.hasOwnProperty.call(SDK_METHODS, method) ? SDK_METHODS[method] : undefined
  if (!m) return 'unknown'
  return granted.includes(m.permission) ? 'ok' : 'denied'
}

export interface ExtensionManifest {
  id: string
  name: string
  version: string
  description: string
  permissions: ExtPermission[]
}

export const MANIFEST_KEYS = ['id', 'name', 'version', 'description', 'permissions'] as const
export const CODE_MAX = 20_000
export const PROJECTS_MAX = 20
export const VERSIONS_KEPT = 10

const VERSION_RE = /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/

/** A manifest from the editor, or why it is not one. Unknown keys are refused, not ignored. */
export function parseManifest(text: string): { manifest: ExtensionManifest } | { error: string } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { error: 'Het manifest is geen geldige JSON.' }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { error: 'Het manifest moet een object zijn.' }
  const m = raw as Record<string, unknown>
  const extra = Object.keys(m).filter((k) => !(MANIFEST_KEYS as readonly string[]).includes(k))
  if (extra.length) return { error: `Onbekend veld in het manifest: ${extra.join(', ')}.` }
  if (typeof m.id !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(m.id)) return { error: 'id: 3 tot 40 kleine letters, cijfers of streepjes.' }
  if (typeof m.name !== 'string' || !m.name.trim() || m.name.length > 40) return { error: 'name: 1 tot 40 tekens.' }
  if (typeof m.version !== 'string' || !VERSION_RE.test(m.version)) return { error: 'version: drie getallen, zoals 1.0.0.' }
  if (m.description !== undefined && (typeof m.description !== 'string' || m.description.length > 200)) return { error: 'description: hoogstens 200 tekens.' }
  if (!Array.isArray(m.permissions)) return { error: 'permissions: een lijst, eventueel leeg.' }
  for (const p of m.permissions) if (!PERMISSIONS.includes(p as ExtPermission)) return { error: `Onbekende permissie: ${String(p)}.` }
  if (new Set(m.permissions).size !== m.permissions.length) return { error: 'Elke permissie hoogstens één keer.' }
  return { manifest: { id: m.id, name: m.name.trim(), version: m.version, description: (m.description as string | undefined)?.trim() ?? '', permissions: m.permissions as ExtPermission[] } }
}

/** -1, 0 or 1, like a sort. */
export function compareVersions(a: string, b: string): number {
  const pa = VERSION_RE.exec(a)?.slice(1).map(Number) ?? [0, 0, 0]
  const pb = VERSION_RE.exec(b)?.slice(1).map(Number) ?? [0, 0, 0]
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1
  return 0
}

/**
 * Things a widget never needs. The sandbox blocks them anyway (no network, no storage, no access
 * to NEXUS); the review refuses them so a widget that tries is caught before you install it.
 */
const FORBIDDEN: Array<{ re: RegExp; what: string }> = [
  { re: /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bsendBeacon\b/, what: 'netwerk' },
  { re: /\beval\s*\(|\bFunction\s*\(|\bimport\s*\(|\bimportScripts\b/, what: 'code laden of uitvoeren uit tekst' },
  { re: /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|\bdocument\.cookie\b/, what: 'opslag' },
  { re: /\b(?:parent|top|opener)\s*\.(?!postMessage\b)|\bwindow\.(?:parent|top|opener)\b/, what: 'NEXUS zelf aanspreken' },
  { re: /\bpostMessage\b/, what: 'eigen berichten (gebruik nexus.call)' },
]

export interface ReviewCheck {
  id: 'manifest' | 'size' | 'calls' | 'forbidden' | 'unused' | 'version'
  title: string
  ok: boolean
  detail: string
}

/** The methods a piece of code calls with a fixed name, and whether it also calls with a computed one. */
export function scanCalls(code: string): { methods: string[]; dynamic: boolean } {
  const methods = new Set<string>()
  for (const m of code.matchAll(/nexus\.call\(\s*(['"`])([\w.]+)\1/g)) methods.add(m[2])
  const all = code.match(/nexus\.call\(/g)?.length ?? 0
  const fixed = [...code.matchAll(/nexus\.call\(\s*(['"`])[\w.]+\1/g)].length
  return { methods: [...methods], dynamic: all > fixed }
}

/** The review before publishing: every check must pass. */
export function reviewProject(manifestText: string, code: string, published: ExtVersion[] = []): ReviewCheck[] {
  const parsed = parseManifest(manifestText)
  const manifest = 'manifest' in parsed ? parsed.manifest : null
  const { methods, dynamic } = scanCalls(code)
  const unknown = methods.filter((m) => checkCall(PERMISSIONS, m) === 'unknown')
  const missing = manifest ? methods.filter((m) => checkCall(manifest.permissions, m) === 'denied') : []
  const used = new Set(methods.map((m) => SDK_METHODS[m]?.permission).filter(Boolean))
  const unused = manifest ? manifest.permissions.filter((p) => !used.has(p)) : []
  const forbidden = FORBIDDEN.filter((f) => f.re.test(code)).map((f) => f.what)
  const last = published[published.length - 1]
  const checks: ReviewCheck[] = [
    { id: 'manifest', title: 'Manifest', ok: !!manifest, detail: manifest ? 'Geldig.' : (parsed as { error: string }).error },
    { id: 'size', title: 'Grootte', ok: code.trim().length > 0 && code.length <= CODE_MAX, detail: code.trim() ? `${code.length} van ${CODE_MAX} tekens.` : 'Er is nog geen code.' },
    {
      id: 'calls',
      title: 'SDK-aanroepen',
      ok: !dynamic && unknown.length === 0 && missing.length === 0,
      detail: dynamic
        ? 'Roep nexus.call aan met een vaste naam, zodat de review ziet wat de widget doet.'
        : unknown.length
          ? `Onbekende methode: ${unknown.join(', ')}.`
          : missing.length
            ? `Zonder permissie in het manifest: ${missing.join(', ')}.`
            : methods.length
              ? `Gebruikt ${methods.join(', ')}.`
              : 'Gebruikt geen gegevens van NEXUS.',
    },
    { id: 'forbidden', title: 'Verboden code', ok: forbidden.length === 0, detail: forbidden.length ? `Niet toegelaten: ${forbidden.join(', ')}.` : 'Geen netwerk, opslag of toegang tot NEXUS.' },
    { id: 'unused', title: 'Alleen wat nodig is', ok: unused.length === 0, detail: unused.length ? `Vraagt maar gebruikt niet: ${unused.join(', ')}.` : 'Elke gevraagde permissie wordt gebruikt.' },
    {
      id: 'version',
      title: 'Versie',
      ok: !!manifest && (!last || (manifest.id === last.manifest.id && compareVersions(manifest.version, last.version) > 0)),
      detail: !manifest
        ? 'Eerst een geldig manifest.'
        : !last
          ? `Eerste versie: ${manifest.version}.`
          : manifest.id !== last.manifest.id
            ? `Het id moet ${last.manifest.id} blijven.`
            : compareVersions(manifest.version, last.version) > 0
              ? `${last.version} wordt ${manifest.version}.`
              : `Verhoog de versie boven ${last.version}.`,
    },
  ]
  return checks
}

export interface ExtVersion {
  version: string
  manifest: ExtensionManifest
  code: string
  publishedAt: number
}

export interface ExtProject {
  id: string
  manifest: string
  code: string
  createdAt: number
  updatedAt: number
  versions: ExtVersion[]
}

export interface ExtInstall {
  projectId: string
  version: string
  /** Exactly what you approved in the permission dialog. */
  permissions: ExtPermission[]
  installedAt: number
}

export interface DevHubState {
  projects: ExtProject[]
  installs: ExtInstall[]
}

export const emptyDevHub = (): DevHubState => ({ projects: [], installs: [] })

export const SAMPLE_MANIFEST = JSON.stringify(
  { id: 'deadline-teller', name: 'Deadline-teller', version: '1.0.0', description: 'Toont hoeveel deadlines je deze week hebt.', permissions: ['agenda.read'] },
  null,
  2,
)

export const SAMPLE_CODE = `// Voorbeeld: tel je deadlines van de komende zeven dagen.
const deadlines = await nexus.call('agenda.deadlines')
const week = deadlines.filter((d) => d.dueAt - Date.now() < 7 * 24 * 60 * 60 * 1000)

const big = document.createElement('p')
big.className = 'big'
big.textContent = String(week.length)
const label = document.createElement('p')
label.textContent = week.length === 1 ? 'deadline deze week' : 'deadlines deze week'
document.body.append(big, label)
`

export function addProject(state: DevHubState, id: string, now: number, manifest = SAMPLE_MANIFEST, code = SAMPLE_CODE): DevHubState {
  if (state.projects.length >= PROJECTS_MAX) throw new Error(`Hoogstens ${PROJECTS_MAX} projecten.`)
  return { ...state, projects: [...state.projects, { id, manifest, code, createdAt: now, updatedAt: now, versions: [] }] }
}

export function editProject(state: DevHubState, id: string, patch: { manifest?: string; code?: string }, now: number): DevHubState {
  return { ...state, projects: state.projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: now } : p)) }
}

/** Removing a project also removes its widget from the dashboard. */
export function removeProject(state: DevHubState, id: string): DevHubState {
  return { projects: state.projects.filter((p) => p.id !== id), installs: state.installs.filter((i) => i.projectId !== id) }
}

/** Publishing freezes the reviewed manifest and code as a version; only when every check passes. */
export function publishVersion(state: DevHubState, id: string, now: number): DevHubState {
  const p = state.projects.find((x) => x.id === id)
  if (!p) throw new Error('Dit project is er niet meer.')
  const failed = reviewProject(p.manifest, p.code, p.versions).filter((c) => !c.ok)
  if (failed.length) throw new Error(`Nog niet klaar: ${failed.map((c) => c.title).join(', ')}.`)
  const manifest = (parseManifest(p.manifest) as { manifest: ExtensionManifest }).manifest
  const version: ExtVersion = { version: manifest.version, manifest, code: p.code, publishedAt: now }
  return { ...state, projects: state.projects.map((x) => (x.id === id ? { ...x, versions: [...x.versions, version].slice(-VERSIONS_KEPT) } : x)) }
}

/** After the permission dialog: the version runs with exactly the permissions its manifest lists. */
export function installVersion(state: DevHubState, id: string, version: string, now: number): DevHubState {
  const v = state.projects.find((x) => x.id === id)?.versions.find((x) => x.version === version)
  if (!v) throw new Error('Deze versie bestaat niet.')
  const install: ExtInstall = { projectId: id, version, permissions: [...v.manifest.permissions], installedAt: now }
  return { ...state, installs: [...state.installs.filter((i) => i.projectId !== id), install] }
}

export function uninstall(state: DevHubState, id: string): DevHubState {
  return { ...state, installs: state.installs.filter((i) => i.projectId !== id) }
}

/** The published version just before the installed one: what a rollback installs. */
export function rollbackTarget(state: DevHubState, id: string): ExtVersion | null {
  const p = state.projects.find((x) => x.id === id)
  const install = state.installs.find((i) => i.projectId === id)
  if (!p || !install) return null
  const older = p.versions.filter((v) => compareVersions(v.version, install.version) < 0)
  return older[older.length - 1] ?? null
}

/** The installed version of a project, as it was published. */
export function installedVersion(state: DevHubState, id: string): { install: ExtInstall; version: ExtVersion } | null {
  const install = state.installs.find((i) => i.projectId === id)
  const version = install && state.projects.find((p) => p.id === id)?.versions.find((v) => v.version === install.version)
  return install && version ? { install, version } : null
}

/** Stored state, dropping anything that does not fit. Installed permissions never grow beyond their version. */
export function parseDevHub(value: unknown): DevHubState {
  if (typeof value !== 'object' || value === null) return emptyDevHub()
  const v = value as { projects?: unknown; installs?: unknown }
  const projects: ExtProject[] = []
  for (const p of Array.isArray(v.projects) ? v.projects : []) {
    if (typeof p !== 'object' || p === null) continue
    const r = p as Record<string, unknown>
    if (typeof r.id !== 'string' || typeof r.manifest !== 'string' || typeof r.code !== 'string') continue
    const versions: ExtVersion[] = []
    for (const x of Array.isArray(r.versions) ? r.versions : []) {
      const xv = x as Record<string, unknown>
      if (typeof xv?.code !== 'string' || typeof xv.publishedAt !== 'number') continue
      const parsed = parseManifest(JSON.stringify(xv.manifest))
      if (!('manifest' in parsed) || parsed.manifest.version !== xv.version) continue
      versions.push({ version: parsed.manifest.version, manifest: parsed.manifest, code: xv.code, publishedAt: xv.publishedAt })
    }
    projects.push({ id: r.id, manifest: r.manifest, code: r.code.slice(0, CODE_MAX * 2), createdAt: Number(r.createdAt) || 0, updatedAt: Number(r.updatedAt) || 0, versions })
  }
  const state: DevHubState = { projects: projects.slice(0, PROJECTS_MAX), installs: [] }
  for (const i of Array.isArray(v.installs) ? v.installs : []) {
    const r = i as Record<string, unknown>
    if (typeof r?.projectId !== 'string' || typeof r.version !== 'string') continue
    const version = state.projects.find((p) => p.id === r.projectId)?.versions.find((x) => x.version === r.version)
    if (!version || state.installs.some((x) => x.projectId === r.projectId)) continue
    const granted = Array.isArray(r.permissions) ? (r.permissions as unknown[]) : []
    state.installs.push({ projectId: r.projectId, version: version.version, permissions: version.manifest.permissions.filter((p) => granted.includes(p)), installedAt: Number(r.installedAt) || 0 })
  }
  return state
}
