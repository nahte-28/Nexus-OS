import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { registryProblems } from '@nexus/core'
import { APPS } from '../apps/registry'
import { setFeature } from '../features/store'
import { lifeStore } from '../life/store'
import { reveal } from '../search/reveal'
import { setAppOpener } from '../shell/openApp'
import { openFromRef } from './notificationLinks'

const { Agenda } = await import('../apps/Agenda')
const { Finance } = await import('../apps/Finance')

describe('Integratie', () => {
  beforeEach(() => setFeature('integration', true))
  afterEach(() => {
    cleanup()
    setFeature('integration', false)
    setAppOpener(null)
  })

  it('keeps the module register in step with the apps', () => {
    expect(registryProblems(APPS)).toEqual([])
  })

  it('opens a deadline from a deep link and shows what belongs to it', async () => {
    const project = await lifeStore.addProject('Labo integratie', 'blue')
    const id = await lifeStore.addDeadline({ title: 'Verslag integratie', dueAt: Date.now() + 86_400_000, projectId: project, notes: '', remind: [], target: 'this_device' })
    reveal('agenda', id)
    render(<Agenda />)
    expect(screen.getByRole('tab', { name: 'Deadlines', selected: true })).toBeTruthy()
    const row = document.getElementById(`agenda-${id}`)!
    expect(row.className).toContain('ring-2')
    const related = within(row).getByRole('list', { name: 'Hoort erbij' })
    expect(within(related).getByRole('button', { name: /Project: Labo integratie/ })).toBeTruthy()

    // A link from inside the Agenda moves the focus to the project.
    reveal('agenda', project)
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Projecten', selected: true })).toBeTruthy())
    expect(document.getElementById(`agenda-${project}`)!.className).toContain('ring-2')
  })

  it('shows nothing extra with the module off', async () => {
    setFeature('integration', false)
    const id = await lifeStore.addDeadline({ title: 'Zonder integratie', dueAt: Date.now() + 86_400_000, projectId: null, notes: '', remind: [], target: 'this_device' })
    reveal('agenda', id)
    render(<Agenda />)
    expect(screen.queryByRole('list', { name: 'Hoort erbij' })).toBeNull()
    render(<Finance />)
    expect(screen.queryByRole('tab', { name: 'Kalender' })).toBeNull()
  })

  it('shows the payment calendar in Financiën', () => {
    render(<Finance />)
    fireEvent.click(screen.getByRole('tab', { name: 'Kalender' }))
    expect(screen.getByRole('table', { name: /Betaalkalender/ })).toBeTruthy()
    expect(screen.getByText(/Niets gepland deze maand/)).toBeTruthy()
  })

  it('leads a tapped notification to its record, once a shell can open it', () => {
    const opened: string[] = []
    expect(openFromRef('deadline:d1@1-60', () => true)).toBe(true)
    setAppOpener((app) => opened.push(app))
    expect(opened).toEqual(['agenda'])
    expect(openFromRef('deadline:d1@1-60', () => false)).toBe(false)
    expect(openFromRef('nexus-push', () => true)).toBe(false)
    expect(opened).toEqual(['agenda'])
  })
})
