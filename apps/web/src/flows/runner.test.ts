import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FLOW_TEMPLATES, type FlowContext, type FlowDefinition } from '@nexus/core'
import { runNow, tickFlows, type FlowEffects } from './runner'
import { FlowsStore } from './store'

const now = new Date('2026-10-20T08:31:00+02:00').getTime()
const ctx = (patch: Partial<FlowContext> = {}): FlowContext => ({ now, activeProfile: 'personal', online: true, deadlines: [], devices: [], update: null, ...patch })

function fromTemplate(id: string, patch: Partial<FlowDefinition> = {}): FlowDefinition {
  const t = FLOW_TEMPLATES.find((x) => x.id === id)!
  return { id, enabled: true, version: 1, timeZone: 'Europe/Brussels', createdAt: 0, updatedAt: 0, ...structuredClone(t.flow), ...patch }
}

function effects(): FlowEffects & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    activateProfile: (p, d) => void calls.push(`profile:${p}:${d}`),
    notify: async (title, _text, target) => void calls.push(`notify:${title}:${target}`),
    prompt: (p) => void calls.push(`prompt:${p.kind}:${p.app ?? ''}`),
  }
}

describe('flow runner', () => {
  let store: FlowsStore
  beforeEach(() => {
    localStorage.clear()
    store = new FlowsStore()
  })

  it('runs School Start once and records the run', async () => {
    store.save(fromTemplate('school-start'))
    const fx = effects()
    const runs = await tickFlows(ctx(), fx, store)
    expect(fx.calls).toEqual(['profile:school:until-change', 'prompt:app:klashub'])
    expect(runs[0]).toMatchObject({ flowName: 'School Start', status: 'ok' })
    expect(store.getRuns()).toHaveLength(1)
    // A second tick and a fresh store (a reload) do nothing more.
    await tickFlows(ctx({ now: now + 60_000 }), fx, store)
    await tickFlows(ctx({ now: now + 120_000 }), fx, new FlowsStore())
    expect(fx.calls).toHaveLength(2)
  })

  it('keeps notifications quiet during quiet hours but does the rest', async () => {
    store.save(fromTemplate('deadline-reminder'))
    store.update((s) => ({ ...s, settings: { ...s.settings, quiet: { enabled: true, start: '08:00', end: '09:00' } } }))
    const fx = effects()
    const runs = await tickFlows(ctx({ deadlines: [{ id: 'r', title: 'Labo', at: now + 30 * 60_000 }] }), fx, store)
    expect(fx.calls).toEqual([])
    expect(runs[0].steps[0]).toMatchObject({ status: 'skipped', detail: 'Stille uren' })
  })

  it('fills in the deadline and reports a failing action without stopping', async () => {
    store.save(fromTemplate('deadline-reminder'))
    const fx = effects()
    fx.notify = vi.fn(async () => {
      throw new Error('Geen gsm gekoppeld.')
    })
    const runs = await tickFlows(ctx({ deadlines: [{ id: 'r', title: 'Labo', at: now + 30 * 60_000 }] }), fx, store)
    expect(fx.notify).toHaveBeenCalledWith('Binnen een uur: Labo', 'Om 09:01.', 'phone', expect.stringMatching(/^flow:deadline-reminder\|deadline:r@\d+\|0$/))
    expect(runs[0]).toMatchObject({ status: 'failed', steps: [{ status: 'failed', detail: 'Geen gsm gekoppeld.' }] })
  })

  it('does nothing while paused, and a manual run still checks pause', async () => {
    const flow = store.save(fromTemplate('study-session'))
    store.update((s) => ({ ...s, settings: { ...s.settings, paused: true } }))
    const fx = effects()
    const run = await runNow(flow, ctx(), fx, store)
    expect(run).toMatchObject({ status: 'skipped', reason: 'Alles gepauzeerd', manual: true })
    expect(fx.calls).toEqual([])
    store.update((s) => ({ ...s, settings: { ...s.settings, paused: false } }))
    await runNow(flow, ctx(), fx, store)
    expect(fx.calls).toEqual(['profile:school:hour', 'prompt:app:reminders'])
  })

  it('drops flows that are broken in storage', () => {
    localStorage.setItem('nexus.flows', JSON.stringify({ flows: [{ id: 'x', name: '', enabled: true, trigger: { type: 'manual' }, conditions: [], actions: [] }] }))
    expect(new FlowsStore().getSnapshot().flows).toEqual([])
  })

  it('warns on the phone when a budget is almost up, with the numbers filled in, once a month', async () => {
    store.save(fromTemplate('budget-almost-up'))
    const finance = { budgets: [{ id: 'b1', month: '2026-10', label: 'Uitgaan', used: 92, left: '€ 8' }], payments: [], expenses: [] }
    const fx = effects()
    await tickFlows(ctx({ finance }), fx, store)
    await tickFlows(ctx({ now: now + 60_000, finance }), fx, store)
    expect(fx.calls).toEqual(['notify:Uitgaan: 92% gebruikt:phone'])
  })
})
