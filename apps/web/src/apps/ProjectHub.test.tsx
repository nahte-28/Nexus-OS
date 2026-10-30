import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { emptyProjectHub, type Deadline } from '@nexus/core'
import { ProjectHub } from './ProjectHub'
import { setFeature } from '../features/store'
import { lifeStore } from '../life/store'
import { projectHubStore } from '../projecthub/store'

describe('Project Hub', () => {
  beforeEach(() => {
    setFeature('projectHub', true)
    projectHubStore.adopt(emptyProjectHub())
  })
  afterEach(() => {
    cleanup()
    setFeature('projectHub', false)
  })

  it('makes a project, moves a task over the board and puts it in the Agenda', async () => {
    render(<ProjectHub />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Nieuw project' }), { target: { value: 'Robotarm' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Project' }))
    expect(await screen.findByRole('heading', { name: 'Robotarm' })).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Bord' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nieuwe taak' }), { target: { value: 'Motor kiezen' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Taak' }))
    const todo = screen.getByRole('region', { name: 'Te doen' })
    expect(within(todo).getByText('Motor kiezen')).toBeTruthy()
    fireEvent.click(within(todo).getByRole('button', { name: 'Motor kiezen naar Bezig' }))
    expect(within(screen.getByRole('region', { name: 'Bezig' })).getByText('Motor kiezen')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Motor kiezen' }))
    const details = screen.getByRole('region', { name: 'Taak Motor kiezen' })
    fireEvent.change(within(details).getByLabelText('Datum'), { target: { value: '2026-11-20' } })
    fireEvent.click(within(details).getByRole('button', { name: 'In Agenda zetten' }))
    expect((await within(details).findByRole('status')).textContent).toBe('In de Agenda gezet als deadline.')
    const deadline = lifeStore.getSnapshot().find((i): i is Deadline => i.kind === 'deadline' && i.title === 'Motor kiezen')
    expect(deadline?.dueAt).toBe(new Date(2026, 10, 20, 23, 59).getTime())

    fireEvent.click(screen.getByRole('tab', { name: 'Tijdlijn' }))
    // The deadline made from the task shows once, as the task.
    expect(within(screen.getByRole('list', { name: 'Tijdlijn' })).getAllByText('Motor kiezen')).toHaveLength(1)
    fireEvent.click(screen.getByRole('tab', { name: 'Activiteit' }))
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Activiteit' })).getByText('Motor kiezen → Bezig')).toBeTruthy())
  })
})
