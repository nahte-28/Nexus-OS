import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DeveloperHub } from './DeveloperHub'
import { preloadApps } from './registry'
import { makeBroker, type CallLog } from '../devhub/broker'
import { buildSrcdoc, SANDBOX_POLICY } from '../devhub/SandboxFrame'
import { devHubStore } from '../devhub/store'
import { eventBus } from '../events/bus'
import { capabilities } from '../platform/capabilities'

describe('Developer Hub broker', () => {
  it('blocks calls without permission and unknown methods', () => {
    const log: CallLog[] = []
    const call = makeBroker({ extId: 'x', name: 'Test', granted: ['profile.read'], onLog: (e) => log.push(e) })
    expect(call('profile.active', null)).toMatchObject({ ok: true, value: { id: expect.any(String) } })
    expect(call('notes.recent', null)).toEqual({ ok: false, error: 'Geen permissie voor notes.recent' })
    expect(call('supabase.session', null)).toMatchObject({ ok: false })
    expect(call({ toString: () => 'profile.active' }, null)).toMatchObject({ ok: false })
    expect(log.map((e) => e.outcome)).toEqual(['ok', 'geweigerd', 'onbekend', 'onbekend'])
  })

  it('sends at most three notices a minute to the Inbox', () => {
    let t = 1_000_000
    const call = makeBroker({ extId: 'ext-1', name: 'Teller', granted: ['notify'], now: () => t })
    expect(call('notify', {})).toEqual({ ok: false, error: 'Geef een title mee' })
    for (let i = 0; i < 3; i++) expect(call('notify', { title: `Hoi ${i}` }).ok).toBe(true)
    expect(call('notify', { title: 'Te veel' })).toMatchObject({ ok: false, error: expect.stringContaining('3 meldingen') })
    t += 61_000
    expect(call('notify', { title: 'Weer', body: 'b' }).ok).toBe(true)
    const e = eventBus.getSnapshot().find((x) => x.title === 'Teller: Weer')
    expect(e).toMatchObject({ source: 'system', type: 'extension.notify', link: { app: 'devhub', id: 'ext-1' }, body: 'b' })
  })

  it('builds a sandbox page that cannot reach the network and keeps the code inside its script', () => {
    const doc = buildSrcdoc("document.body.textContent = '</script><script>alert(1)</script>'", '')
    expect(doc).toContain(`content="${SANDBOX_POLICY}"`)
    expect(SANDBOX_POLICY).toContain("default-src 'none'")
    expect(doc).not.toContain('</script><script>alert(1)')
    expect(doc.match(/<\/script>/g)).toHaveLength(2)
  })
})

describe('Developer Hub app', () => {
  beforeAll(preloadApps)
  afterEach(cleanup)

  it('takes the sample project through review, permission dialog and rollback', () => {
    render(<DeveloperHub />)
    fireEvent.click(screen.getByRole('tab', { name: 'Projecten' }))
    fireEvent.click(screen.getByRole('button', { name: 'Voorbeeldproject maken' }))
    expect(screen.getByText('Het manifest is geldig.')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Reviews' }))
    expect(screen.getByText(/Eerste versie: 1.0.0/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Versie publiceren' }))
    fireEvent.click(screen.getByRole('button', { name: 'Installeren' }))
    const dialog = screen.getByRole('dialog', { name: 'Permissies' })
    expect(dialog.textContent).toContain('Je deadlines lezen')
    fireEvent.click(screen.getByRole('button', { name: 'Toestaan en installeren' }))
    expect(screen.getByText(/Op je dashboard: versie 1.0.0/)).toBeTruthy()

    // A change that asks for a permission it does not use is refused.
    fireEvent.click(screen.getByRole('tab', { name: 'Projecten' }))
    const manifest = screen.getByLabelText('Manifest') as HTMLTextAreaElement
    fireEvent.change(manifest, { target: { value: manifest.value.replace('1.0.0', '1.1.0').replace('"agenda.read"', '"agenda.read", "notes.read"') } })
    fireEvent.click(screen.getByRole('tab', { name: 'Reviews' }))
    expect(screen.getByText(/Vraagt maar gebruikt niet: notes.read/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Versie publiceren' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('tab', { name: 'Projecten' }))
    fireEvent.change(screen.getByLabelText('Manifest'), { target: { value: manifest.value.replace(', "notes.read"', '') } })
    fireEvent.click(screen.getByRole('tab', { name: 'Reviews' }))
    fireEvent.click(screen.getByRole('button', { name: 'Versie publiceren' }))
    fireEvent.click(screen.getByRole('button', { name: 'Installeren' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toestaan en installeren' }))
    expect(screen.getByText(/Op je dashboard: versie 1.1.0/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Terugdraaien naar 1.0.0' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toestaan en installeren' }))
    expect(screen.getByText(/Op je dashboard: versie 1.0.0/)).toBeTruthy()
    expect(devHubStore.getSnapshot().installs).toMatchObject([{ version: '1.0.0', permissions: ['agenda.read'] }])
  })

  it('runs the sandbox in a frame without same-origin', () => {
    render(<DeveloperHub />)
    fireEvent.click(screen.getByRole('tab', { name: 'Sandbox' }))
    if (capabilities.sandbox) {
      const frame = screen.getByTitle('Sandbox') as HTMLIFrameElement
      expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
    } else {
      expect(screen.getByText(/draaien niet in de Windows-app/)).toBeTruthy()
    }
    expect(screen.getByText('Nog geen aanroepen.')).toBeTruthy()
  })
})
