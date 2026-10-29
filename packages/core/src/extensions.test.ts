import { describe, expect, it } from 'vitest'
import {
  addProject,
  checkCall,
  compareVersions,
  editProject,
  emptyDevHub,
  installedVersion,
  installVersion,
  parseDevHub,
  parseManifest,
  publishVersion,
  removeProject,
  reviewProject,
  rollbackTarget,
  SAMPLE_CODE,
  SAMPLE_MANIFEST,
  uninstall,
} from './extensions'

const manifest = (patch: Record<string, unknown> = {}) => JSON.stringify({ ...JSON.parse(SAMPLE_MANIFEST), ...patch })
const failed = (m: string, code: string, published = [] as Parameters<typeof reviewProject>[2]) =>
  reviewProject(m, code, published)
    .filter((c) => !c.ok)
    .map((c) => c.id)

describe('Developer Hub', () => {
  it('refuses malformed manifests', () => {
    expect('manifest' in parseManifest(SAMPLE_MANIFEST)).toBe(true)
    expect(parseManifest('{nope')).toEqual({ error: 'Het manifest is geen geldige JSON.' })
    expect(parseManifest('[]')).toMatchObject({ error: expect.stringContaining('object') })
    expect(parseManifest(manifest({ entry: 'https://x' }))).toMatchObject({ error: expect.stringContaining('entry') })
    expect(parseManifest(manifest({ id: 'Bad id' }))).toMatchObject({ error: expect.stringContaining('id') })
    expect(parseManifest(manifest({ version: '1.0' }))).toMatchObject({ error: expect.stringContaining('version') })
    expect(parseManifest(manifest({ permissions: ['supabase.token'] }))).toMatchObject({ error: expect.stringContaining('supabase.token') })
    expect(parseManifest(manifest({ permissions: ['notify', 'notify'] }))).toMatchObject({ error: expect.stringContaining('één keer') })
    expect(parseManifest(manifest({ permissions: 'notify' }))).toMatchObject({ error: expect.stringContaining('permissions') })
  })

  it('lets a call through only with its permission', () => {
    expect(checkCall(['agenda.read'], 'agenda.deadlines')).toBe('ok')
    expect(checkCall(['agenda.read'], 'notes.recent')).toBe('denied')
    expect(checkCall([], 'notify')).toBe('denied')
    expect(checkCall(['notify'], 'supabase.session')).toBe('unknown')
    expect(checkCall(['notify'], 'constructor')).toBe('unknown')
    expect(checkCall(['notify'], '__proto__')).toBe('unknown')
  })

  it('reviews code before it can be published', () => {
    expect(failed(SAMPLE_MANIFEST, SAMPLE_CODE)).toEqual([])
    expect(failed(SAMPLE_MANIFEST, "await nexus.call('notes.recent')")).toEqual(['calls', 'unused'])
    expect(failed(SAMPLE_MANIFEST, "await nexus.call('agenda.deadlines'); fetch('https://x')")).toEqual(['forbidden'])
    expect(failed(SAMPLE_MANIFEST, "await nexus.call('agenda.deadlines'); localStorage.x = 1")).toEqual(['forbidden'])
    expect(failed(SAMPLE_MANIFEST, "await nexus.call('agenda.deadlines'); parent.document.body")).toEqual(['forbidden'])
    expect(failed(SAMPLE_MANIFEST, "const m = 'agenda.deadlines'; await nexus.call(m)")).toEqual(['calls', 'unused'])
    expect(failed(SAMPLE_MANIFEST, '')).toEqual(['size', 'unused'])
    expect(failed(manifest({ permissions: ['agenda.read', 'notify'] }), SAMPLE_CODE)).toEqual(['unused'])
  })

  it('publishes, installs with the approved permissions and rolls back', () => {
    let s = addProject(emptyDevHub(), 'p1', 1)
    s = publishVersion(s, 'p1', 2)
    expect(() => publishVersion(s, 'p1', 3)).toThrow(/Versie/)
    s = installVersion(s, 'p1', '1.0.0', 3)
    expect(installedVersion(s, 'p1')?.install.permissions).toEqual(['agenda.read'])
    expect(rollbackTarget(s, 'p1')).toBeNull()

    s = editProject(s, 'p1', { manifest: manifest({ version: '1.1.0', permissions: ['agenda.read', 'notify'] }), code: `${SAMPLE_CODE}\nawait nexus.call('notify', { title: 'Hoi' })` }, 4)
    s = publishVersion(s, 'p1', 5)
    // Publishing does not change what is installed; installing the new version asks again.
    expect(installedVersion(s, 'p1')?.version.version).toBe('1.0.0')
    s = installVersion(s, 'p1', '1.1.0', 6)
    expect(installedVersion(s, 'p1')?.install.permissions).toEqual(['agenda.read', 'notify'])
    expect(rollbackTarget(s, 'p1')?.version).toBe('1.0.0')
    s = installVersion(s, 'p1', rollbackTarget(s, 'p1')!.version, 7)
    expect(installedVersion(s, 'p1')?.install.permissions).toEqual(['agenda.read'])
    expect(installedVersion(s, 'p1')?.version.code).toBe(SAMPLE_CODE)

    // The id stays the same across versions.
    const renamed = editProject(s, 'p1', { manifest: manifest({ id: 'iets-anders', version: '2.0.0' }) }, 8)
    expect(() => publishVersion(renamed, 'p1', 9)).toThrow(/Versie/)
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1)

    expect(uninstall(s, 'p1').installs).toEqual([])
    expect(removeProject(s, 'p1')).toEqual(emptyDevHub())
  })

  it('never lets stored data grant more than the installed version asks', () => {
    let s = publishVersion(addProject(emptyDevHub(), 'p1', 1), 'p1', 2)
    s = installVersion(s, 'p1', '1.0.0', 3)
    const tampered = JSON.parse(JSON.stringify(s))
    tampered.installs[0].permissions = ['agenda.read', 'notes.read', 'notify']
    tampered.installs.push({ projectId: 'p1', version: '1.0.0', permissions: ['notify'] }, { projectId: 'ghost', version: '1.0.0', permissions: ['notify'] })
    tampered.projects[0].versions.push({ version: '9.0.0', manifest: { ...tampered.projects[0].versions[0].manifest, extra: 1 }, code: 'x', publishedAt: 4 })
    const back = parseDevHub(tampered)
    expect(back.installs).toEqual([{ projectId: 'p1', version: '1.0.0', permissions: ['agenda.read'], installedAt: 3 }])
    expect(back.projects[0].versions.map((v) => v.version)).toEqual(['1.0.0'])
    expect(parseDevHub(null)).toEqual(emptyDevHub())
  })
})
