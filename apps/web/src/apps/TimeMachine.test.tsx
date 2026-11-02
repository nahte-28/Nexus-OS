import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createSpace, FLOW_TEMPLATES, liveSpaces, type FlowDefinition } from '@nexus/core'
import { TimeMachine } from './TimeMachine'
import { preloadApps } from './registry'
import { flowsStore } from '../flows/store'
import { profilesStore } from '../profiles/store'
import { spacesStore } from '../spaces/store'
import { restorePart, restoreSnapshot, takeSnapshot, timeMachineStore } from '../timemachine/store'

const flow = (id: string): FlowDefinition => {
  const t = FLOW_TEMPLATES[0]
  return { id, enabled: true, version: 1, timeZone: 'Europe/Brussels', createdAt: 0, updatedAt: 0, ...structuredClone(t.flow) }
}

describe('Time Machine', () => {
  beforeAll(preloadApps)
  afterEach(cleanup)

  it('restores profiles, flows and Spaces exactly as they were', () => {
    flowsStore.save(flow('tm-keep'))
    const { snapshot } = takeSnapshot('manual', 'Goede staat')
    expect(snapshot).not.toBeNull()
    const name = profilesStore.getSnapshot().state.profiles.school.name

    profilesStore.updateProfile('school', { name: 'Proef' })
    flowsStore.save(flow('tm-new'))
    flowsStore.setEnabled('tm-keep', false)
    spacesStore.update((s) => createSpace(s, { id: 'tm-space', name: 'Weg ermee', profileId: 'school', windows: [] }, Date.now()))

    const { ok, job } = restoreSnapshot(snapshot!.id, ['profiles', 'flows', 'spaces'])
    expect(job.detail ?? '').toBe('')
    expect(ok).toBe(true)
    expect(job.status).toBe('done')
    expect(profilesStore.getSnapshot().state.profiles.school.name).toBe(name)
    const flows = flowsStore.getSnapshot()
    expect(flows.flows.map((f) => f.id)).toContain('tm-keep')
    expect(flows.flows.find((f) => f.id === 'tm-keep')!.enabled).toBe(true)
    expect(flows.flows.some((f) => f.id === 'tm-new')).toBe(false)
    expect(flows.deleted['tm-new']).toBeGreaterThan(0)
    expect(liveSpaces(spacesStore.getSnapshot()).some((s) => s.id === 'tm-space')).toBe(false)
    // The state just before the restore is kept, so the restore can be undone.
    expect(timeMachineStore.getSnapshot().snapshots.some((s) => s.reason === 'before_restore')).toBe(true)
  })

  it('rolls back when a restore point does not come back exactly', () => {
    takeSnapshot('manual', 'Basis')
    const bad = { ...timeMachineStore.getSnapshot().snapshots[0], id: 'tm-bad', label: 'Kapot', scopes: { flows: { flows: [{ id: 'kapot' }], settings: {} } } }
    timeMachineStore.update((s) => ({ ...s, snapshots: [bad, ...s.snapshots] }))
    const before = flowsStore.getSnapshot().flows.map((f) => f.id)
    const { ok, job } = restoreSnapshot('tm-bad', ['flows'])
    expect(ok).toBe(false)
    expect(job.detail).toMatch(/Flows kwam niet exact terug/)
    expect(flowsStore.getSnapshot().flows.map((f) => f.id)).toEqual(before)
    timeMachineStore.update((s) => ({ ...s, snapshots: s.snapshots.filter((x) => x.id !== 'tm-bad') }))
  })

  it('shows what changes before restoring, then restores', () => {
    render(<TimeMachine />)
    fireEvent.click(screen.getByRole('tab', { name: 'Herstelpunten' }))
    fireEvent.change(screen.getByLabelText('Naam van het herstelpunt'), { target: { value: 'Voor de proef' } })
    fireEvent.click(screen.getByRole('button', { name: 'Herstelpunt maken' }))
    expect(screen.getByText('Voor de proef')).toBeTruthy()
    const name = profilesStore.getSnapshot().state.profiles.gaming.name
    profilesStore.updateProfile('gaming', { name: 'Spelen' })

    fireEvent.click(screen.getAllByRole('button', { name: 'Bekijken en herstellen' })[0])
    expect(screen.getByText(`Spelen → ${name}`)).toBeTruthy()
    expect(screen.getAllByText('Al hetzelfde als nu.').length).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: 'Herstellen' }))
    expect(screen.getByRole('status').textContent).toMatch(/Hersteld: Profielen en lesrooster/)
    expect(profilesStore.getSnapshot().state.profiles.gaming.name).toBe(name)

    fireEvent.click(screen.getByRole('tab', { name: 'Geschiedenis' }))
    expect(screen.getAllByText(/Hersteld: Voor de proef/).length).toBeGreaterThan(0)
  })

  it('puts back one flow and leaves the others as they are now', () => {
    flowsStore.save(flow('tm-one'))
    flowsStore.save(flow('tm-two'))
    const { snapshot } = takeSnapshot('manual', 'Twee flows')
    flowsStore.setEnabled('tm-one', false)
    flowsStore.setEnabled('tm-two', false)
    const { ok, job } = restorePart(snapshot!.id, 'flows', 'flow:tm-one', 'Flow een')
    expect(ok).toBe(true)
    expect(job.part).toBe('Flow een')
    const flows = flowsStore.getSnapshot().flows
    expect(flows.find((f) => f.id === 'tm-one')!.enabled).toBe(true)
    expect(flows.find((f) => f.id === 'tm-two')!.enabled).toBe(false)
  })

  it('offers one part to put back in the preview', () => {
    render(<TimeMachine />)
    fireEvent.click(screen.getByRole('tab', { name: 'Herstelpunten' }))
    fireEvent.change(screen.getByLabelText('Naam van het herstelpunt'), { target: { value: 'Twee profielen' } })
    fireEvent.click(screen.getByRole('button', { name: 'Herstelpunt maken' }))
    const gaming = profilesStore.getSnapshot().state.profiles.gaming.name
    const developer = profilesStore.getSnapshot().state.profiles.developer.name
    profilesStore.updateProfile('gaming', { name: 'Spelen' })
    profilesStore.updateProfile('developer', { name: 'Coderen' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Bekijken en herstellen' })[0])
    fireEvent.click(screen.getByText(/Eén onderdeel terugzetten/))
    fireEvent.click(screen.getByRole('button', { name: `Profiel ${gaming} terugzetten` }))
    expect(screen.getByRole('status').textContent).toBe(`Hersteld: Profiel ${gaming}.`)
    expect(profilesStore.getSnapshot().state.profiles.gaming.name).toBe(gaming)
    expect(profilesStore.getSnapshot().state.profiles.developer.name).toBe('Coderen')
    fireEvent.click(screen.getByRole('tab', { name: 'Geschiedenis' }))
    expect(screen.getAllByText(new RegExp(`alleen Profiel ${gaming}`)).length).toBeGreaterThan(0)
    profilesStore.updateProfile('developer', { name: developer })
  })

  it('sets the retention policy and says what it cleared', () => {
    render(<TimeMachine />)
    fireEvent.click(screen.getByRole('tab', { name: 'Instellingen' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Slim uitdunnen/ }))
    expect(timeMachineStore.getSnapshot().settings.thin).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Spaces' }))
    expect(timeMachineStore.getSnapshot().settings.autoScopes).toEqual(['profiles', 'flows'])
    fireEvent.change(screen.getByRole('combobox', { name: 'Eigen herstelpunten' }), { target: { value: '90' } })
    expect(timeMachineStore.getSnapshot().settings.manualDays).toBe(90)
    expect(screen.getByRole('status').textContent).toMatch(/Bewaard|opgeruimd/)
    expect(screen.getByRole('meter', { name: 'Opslag van Time Machine' })).toBeTruthy()
    expect(takeSnapshot('manual', 'Alles').snapshot?.scopes.spaces).toBeDefined()
  })
})
