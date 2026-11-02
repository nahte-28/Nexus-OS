import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { IntelFacts } from '@nexus/core'
import { Intelligence } from './Intelligence'
import { preloadApps } from './registry'
import { flowsStore, flowStudioEnabled, setFlowStudioEnabled } from '../flows/store'
import { intelStore, refreshNow } from '../intelligence/store'
import { approvalLog } from '../ai/context'

const now = Date.now()
const facts = (patch: Partial<IntelFacts> = {}): IntelFacts => ({
  now,
  firstLessons: { 1: '08:30', 3: '09:00' },
  scheduleOn: false,
  flows: [],
  deadlinesSoon: 1,
  isDesktop: false,
  updateAvailable: null,
  ...patch,
})

describe('Intelligence app', () => {
  beforeAll(preloadApps)
  afterEach(cleanup)

  it('explains a proposal and turns it into a flow only after approval', () => {
    setFlowStudioEnabled(false)
    const before = flowsStore.getSnapshot().flows.length
    refreshNow(now, facts())
    render(<Intelligence />)
    fireEvent.click(screen.getByRole('tab', { name: 'Voorstellen' }))
    expect(screen.getByText('School Mode aanzetten voor je lessen')).toBeTruthy()
    expect(screen.getByText(/Je hebt les op ma, wo/)).toBeTruthy()
    expect(screen.getByText(/alleen de dagen en het beginuur/)).toBeTruthy()
    expect(screen.getByText('Wanneer: op ma, wo om 08:15')).toBeTruthy()
    expect(flowsStore.getSnapshot().flows.length).toBe(before)

    fireEvent.click(screen.getByRole('button', { name: 'Aanpassen' }))
    fireEvent.change(screen.getByLabelText('Tijd'), { target: { value: '07:50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Wijziging bewaren' }))
    expect(screen.getByText('Wanneer: op ma, wo om 07:50')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Goedkeuren' }))
    const flow = flowsStore.getSnapshot().flows.find((f) => f.name === 'School Mode voor de les')
    expect(flow?.trigger).toEqual({ type: 'schedule.at_time', days: [1, 3], time: '07:50' })
    expect(flow?.enabled).toBe(true)
    expect(flowStudioEnabled()).toBe(true)
    expect(screen.getByRole('status').textContent).toMatch(/staat in Flow Studio/)
  })

  it('declines a proposal and keeps the rule quiet', () => {
    refreshNow(now + 2 * 60 * 60_000, facts({ firstLessons: {} }))
    render(<Intelligence />)
    expect(screen.getByText('Een seintje voor je deadlines')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Weigeren' }))
    expect(screen.getByRole('status').textContent).toMatch(/14 dagen/)
    expect(intelStore.getSnapshot().rules.deadlines.cooldownUntil).toBeGreaterThan(now)
    fireEvent.click(screen.getByRole('tab', { name: 'Geschiedenis' }))
    const list = screen.getByRole('list', { name: 'Geschiedenis van goedkeuringen' })
    const declined = within(list).getByText('Een seintje voor je deadlines').closest('li')!
    expect(within(declined).getByText('Geweigerd')).toBeTruthy()
    const approved = within(list).getByText('School Mode aanzetten voor je lessen').closest('li')!
    expect(within(approved).getByText('Goedgekeurd')).toBeTruthy()
    // Approving and declining also went into the shared history, once each.
    expect(approvalLog.getSnapshot().filter((e) => e.source === 'intelligence').map((e) => e.outcome)).toEqual(['dismissed', 'accepted'])
    fireEvent.click(screen.getByRole('button', { name: 'NEXUS AI' }))
    expect(screen.getByText('Nog geen beslissingen.')).toBeTruthy()
  })
})
