import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createSpace, FLOW_TEMPLATES, liveSpaces, type FlowDefinition } from '@nexus/core'
import { TimeMachine } from './TimeMachine'
import { preloadApps } from './registry'
import { flowsStore } from '../flows/store'
import { profilesStore } from '../profiles/store'
import { spacesStore } from '../spaces/store'
import { restoreSnapshot, takeSnapshot, timeMachineStore } from '../timemachine/store'

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
})
