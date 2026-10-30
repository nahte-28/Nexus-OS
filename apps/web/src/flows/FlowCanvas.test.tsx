import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { ACTION_LABELS, TRIGGER_LABELS, type FlowDefinition } from '@nexus/core'
import { FlowCanvas } from './FlowCanvas'

const start: FlowDefinition = {
  id: 'f1',
  name: 'Test',
  enabled: true,
  version: 1,
  timeZone: 'Europe/Brussels',
  createdAt: 0,
  updatedAt: 0,
  trigger: { type: 'manual' },
  conditions: [],
  actions: [{ type: 'update.prompt' }],
}

let latest = start
function Harness() {
  const [flow, setFlow] = useState(start)
  latest = flow
  return <FlowCanvas flow={flow} onChange={setFlow} editors={{ trigger: () => <p>trigger-editor</p>, condition: () => <p>condition-editor</p>, action: () => <p>action-editor</p> }} />
}

/** A drag in jsdom: one shared DataTransfer from dragstart to drop. */
function drag(from: Element, to: Element) {
  const data: Record<string, string> = {}
  const dataTransfer = {
    setData: (k: string, v: string) => (data[k] = v),
    getData: (k: string) => data[k] ?? '',
    get types() {
      return Object.keys(data)
    },
    effectAllowed: 'all',
  }
  fireEvent.dragStart(from, { dataTransfer })
  fireEvent.dragOver(to, { dataTransfer })
  fireEvent.drop(to, { dataTransfer })
  fireEvent.dragEnd(from, { dataTransfer })
}

describe('FlowCanvas', () => {
  afterEach(cleanup)

  it('adds blocks by dragging or clicking, and reorders and removes them', () => {
    render(<Harness />)
    const canvas = screen.getByRole('group', { name: 'Canvas' })
    drag(screen.getByRole('button', { name: `Doe dit: ${ACTION_LABELS['app.open_prompt']} toevoegen` }), within(canvas).getByRole('region', { name: 'Doe dit' }))
    expect(latest.actions).toHaveLength(2)

    // A condition dropped on the actions lane is refused with a reason.
    drag(screen.getAllByRole('button', { name: /^Alleen als: .* toevoegen$/ })[0], within(canvas).getByRole('region', { name: 'Doe dit' }))
    expect(latest.conditions).toHaveLength(0)
    expect(screen.getByRole('status').textContent).toContain('Alleen als')

    fireEvent.click(screen.getAllByRole('button', { name: /^Alleen als: .* toevoegen$/ })[0])
    expect(latest.conditions).toHaveLength(1)
    expect(screen.getByText('condition-editor')).toBeTruthy()

    fireEvent.click(within(canvas).getByRole('button', { name: /^Doe dit 2:/ }))
    const second = latest.actions[1]
    fireEvent.click(screen.getByRole('button', { name: 'Naar boven' }))
    expect(latest.actions[0]).toEqual(second)
    fireEvent.click(screen.getByRole('button', { name: 'Weghalen' }))
    expect(latest.actions).toHaveLength(1)
    fireEvent.click(within(canvas).getByRole('button', { name: /^Doe dit 1:/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Weghalen' }))
    expect(latest.actions).toHaveLength(1)
    expect(screen.getByRole('status').textContent).toBe('Een flow heeft minstens één actie.')
  })

  it('replaces the trigger with one from the palette', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: `Wanneer: ${TRIGGER_LABELS['update.available']} kiezen` }))
    expect(latest.trigger).toEqual({ type: 'update.available' })
    expect(screen.getByText('trigger-editor')).toBeTruthy()
  })
})
