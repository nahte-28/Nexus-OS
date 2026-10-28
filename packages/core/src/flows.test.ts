import { describe, expect, it } from 'vitest'
import {
  emptyRuntime,
  fillText,
  FLOW_TEMPLATES,
  markHandled,
  mergeFlows,
  MAX_RUNS_PER_HOUR,
  nextScheduledRun,
  planRuns,
  triggerEvents,
  validateFlow,
  type FlowContext,
  type FlowDefinition,
} from './flows'
import { emptyFinance, financeFlowFacts, type FinanceState } from './finance'

const ZONE = 'Europe/Brussels'
const at = (iso: string) => new Date(iso).getTime()

function flow(patch: Partial<FlowDefinition> = {}): FlowDefinition {
  return {
    id: 'f1',
    name: 'School Start',
    enabled: true,
    version: 1,
    trigger: { type: 'schedule.at_time', days: [1, 2, 3, 4, 5], time: '08:30' },
    conditions: [],
    actions: [{ type: 'profile.activate', profile: 'school', duration: 'until-change' }],
    timeZone: ZONE,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  }
}

function ctx(now: number, patch: Partial<FlowContext> = {}): FlowContext {
  return { now, activeProfile: 'personal', online: true, deadlines: [], devices: [], update: null, ...patch }
}

describe('flow schedule', () => {
  // 2026-10-20 is a Tuesday, summer time (UTC+2).
  it('starts at 08:30, not at 08:29, and only once that day', () => {
    expect(planRuns([flow()], ctx(at('2026-10-20T08:29:00+02:00')), emptyRuntime())).toEqual([])
    const runs = planRuns([flow()], ctx(at('2026-10-20T08:30:00+02:00')), emptyRuntime())
    expect(runs).toHaveLength(1)
    expect(runs[0].skipped).toBeUndefined()
    const runtime = markHandled(emptyRuntime(), runs, at('2026-10-20T08:30:00+02:00'))
    expect(planRuns([flow()], ctx(at('2026-10-20T08:45:00+02:00')), runtime)).toEqual([])
    // The next school day runs again.
    expect(planRuns([flow()], ctx(at('2026-10-21T08:31:00+02:00')), runtime)).toHaveLength(1)
  })

  it('catches up a little after waking, but not hours later, and not at the weekend', () => {
    expect(planRuns([flow()], ctx(at('2026-10-20T08:55:00+02:00')), emptyRuntime())).toHaveLength(1)
    expect(planRuns([flow()], ctx(at('2026-10-20T11:00:00+02:00')), emptyRuntime())).toEqual([])
    expect(planRuns([flow()], ctx(at('2026-10-24T08:30:00+02:00')), emptyRuntime())).toEqual([])
  })

  it('keeps local time across the switch to winter time', () => {
    // 2026-11-02 is a Monday in winter time (UTC+1).
    expect(planRuns([flow()], ctx(at('2026-11-02T07:30:00Z')), emptyRuntime())).toHaveLength(1)
    expect(planRuns([flow()], ctx(at('2026-11-02T06:30:00Z')), emptyRuntime())).toEqual([])
  })

  it('shows the next run', () => {
    expect(nextScheduledRun(flow(), at('2026-10-20T09:00:00+02:00'))).toBe(at('2026-10-21T08:30:00+02:00'))
    expect(nextScheduledRun(flow(), at('2026-10-23T09:00:00+02:00'))).toBe(at('2026-10-26T08:30:00+01:00'))
    expect(nextScheduledRun(flow({ trigger: { type: 'manual' } }), 0)).toBeNull()
  })
})

describe('flow conditions and safety', () => {
  const now = at('2026-10-20T08:30:00+02:00')

  it('handles an event once even when a condition fails, so it never fires later', () => {
    const f = flow({ conditions: [{ type: 'profile.is_active', profile: 'gaming' }] })
    const runs = planRuns([f], ctx(now), emptyRuntime())
    expect(runs[0]).toMatchObject({ skipped: 'condition', condition: { type: 'profile.is_active' } })
    const runtime = markHandled(emptyRuntime(), runs, now)
    expect(planRuns([f], ctx(now + 60_000, { activeProfile: 'gaming' }), runtime)).toEqual([])
  })

  it('checks time windows that run past midnight', () => {
    const f = flow({ trigger: { type: 'update.available' }, actions: [{ type: 'update.prompt' }], conditions: [{ type: 'local_time.in_range', start: '22:00', end: '06:00' }] })
    const update = { version: '0.9.1' }
    expect(planRuns([f], ctx(at('2026-10-20T23:30:00+02:00'), { update }), emptyRuntime())[0].skipped).toBeUndefined()
    expect(planRuns([f], ctx(at('2026-10-20T12:00:00+02:00'), { update }), emptyRuntime())[0].skipped).toBe('condition')
  })

  it('skips everything while paused and ignores disabled or broken flows', () => {
    expect(planRuns([flow()], ctx(now), emptyRuntime(), true)[0].skipped).toBe('paused')
    expect(planRuns([flow({ enabled: false })], ctx(now), emptyRuntime())).toEqual([])
    expect(planRuns([flow({ actions: [] })], ctx(now), emptyRuntime())).toEqual([])
  })

  it('limits runs per hour', () => {
    const f = flow({ trigger: { type: 'deadline.upcoming', minutesBefore: 60 } })
    const deadlines = Array.from({ length: MAX_RUNS_PER_HOUR + 2 }, (_, i) => ({ id: `r${i}`, title: `Taak ${i}`, at: now + 10 * 60_000 }))
    const runs = planRuns([f], ctx(now, { deadlines }), emptyRuntime())
    expect(runs.filter((r) => !r.skipped)).toHaveLength(MAX_RUNS_PER_HOUR)
    expect(runs.filter((r) => r.skipped === 'rate-limit')).toHaveLength(2)
  })
})

describe('flow events', () => {
  const now = at('2026-10-20T10:00:00+02:00')

  it('warns once per deadline occurrence', () => {
    const f = flow({ trigger: { type: 'deadline.upcoming', minutesBefore: 60 } })
    const deadlines = [
      { id: 'a', title: 'Labo inleveren', at: now + 30 * 60_000 },
      { id: 'b', title: 'Later', at: now + 3 * 60 * 60_000 },
      { id: 'c', title: 'Voorbij', at: now - 60_000 },
    ]
    const events = triggerEvents(f, ctx(now, { deadlines }))
    expect(events.map((e) => e.vars.titel)).toEqual(['Labo inleveren'])
    expect(fillText('Binnen een uur: {titel} om {tijd} {onbekend}', events[0].vars)).toBe('Binnen een uur: Labo inleveren om 10:30 {onbekend}')
  })

  it('reports an offline device once until it is seen again', () => {
    const f = flow({ trigger: { type: 'device.offline', minutes: 60 } })
    const seen = now - 2 * 60 * 60_000
    const first = triggerEvents(f, ctx(now, { devices: [{ id: 'gsm', name: 'OnePlus', lastSeenAt: seen }] }))
    const later = triggerEvents(f, ctx(now + 60 * 60_000, { devices: [{ id: 'gsm', name: 'OnePlus', lastSeenAt: seen }] }))
    expect(later[0].id).toBe(first[0].id)
    expect(triggerEvents(f, ctx(now, { devices: [{ id: 'gsm', name: 'OnePlus', lastSeenAt: now - 60_000 }] }))).toEqual([])
  })

  it('never starts a manual flow by itself', () => {
    expect(triggerEvents(flow({ trigger: { type: 'manual' } }), ctx(now))).toEqual([])
  })
})

describe('flow events from Financiën', () => {
  const now = at('2026-10-20T12:00:00+02:00')
  const money: FinanceState = {
    ...emptyFinance(),
    budgets: [{ id: 'b1', category: 'Uitgaan', limit: 10000, threshold: 80, rolloverFrom: null, updatedAt: 1, deletedAt: null }],
    subscriptions: [{ id: 's1', name: 'Spotify', amount: 1199, category: 'Abonnementen', cycle: 'monthly', next: '2026-10-21', remindDays: null, createdAt: 1, updatedAt: 1, deletedAt: null }],
    transactions: [
      { id: 't1', kind: 'expense', amount: 9500, category: 'Uitgaan', note: 'Concert', date: '2026-10-20', subscriptionId: null, createdAt: now - 60_000, updatedAt: 1, deletedAt: null },
      { id: 'import-x-1', kind: 'expense', amount: 9000, category: 'Andere', note: '', date: '2026-10-20', subscriptionId: null, createdAt: now - 60_000, updatedAt: 1, deletedAt: null },
    ],
  }
  const c = ctx(now, { finance: financeFlowFacts(money, now) })

  it('starts once per budget per month when it passes the percentage', () => {
    const f = flow({ trigger: { type: 'finance.budget_used', percent: 90 } })
    expect(triggerEvents(f, c)).toEqual([{ id: 'budget:2026-10:b1@90', label: 'Uitgaan', vars: { categorie: 'Uitgaan', procent: '95', over: expect.stringMatching(/^€\s5,00$/) } }])
    expect(triggerEvents(flow({ trigger: { type: 'finance.budget_used', percent: 100 } }), c)).toEqual([])
  })

  it('starts the given number of days before a payment', () => {
    const f = (daysBefore: number) => flow({ trigger: { type: 'finance.payment_due', daysBefore } })
    expect(triggerEvents(f(0), c)).toEqual([])
    const [e] = triggerEvents(f(1), c)
    expect(e).toMatchObject({ id: 'payment:s1@2026-10-21', vars: { naam: 'Spotify', bedrag: expect.stringMatching(/11,99/) } })
  })

  it('starts on a new expense typed in by hand, not on old ones or bank imports', () => {
    const f = (patch: Partial<FlowDefinition>) => flow({ trigger: { type: 'finance.expense_added', minAmount: 5000 }, ...patch })
    expect(triggerEvents(f({ updatedAt: now - 120_000 }), c).map((e) => e.id)).toEqual(['expense:t1'])
    // Saved after the expense, or the expense too small: nothing.
    expect(triggerEvents(f({ updatedAt: now }), c)).toEqual([])
    expect(triggerEvents(flow({ trigger: { type: 'finance.expense_added', minAmount: 10000 } }), c)).toEqual([])
    // Long after: no catching up.
    expect(triggerEvents(f({ updatedAt: 0 }), ctx(now + 2 * 60 * 60_000, { finance: financeFlowFacts(money, now + 2 * 60 * 60_000) }))).toEqual([])
    expect(validateFlow(flow({ trigger: { type: 'finance.budget_used', percent: 0 } }))).toMatch(/percentage/)
  })
})

describe('flow validation and templates', () => {
  it('rejects broken flows with a readable reason', () => {
    expect(validateFlow(flow({ name: ' ' }))).toBe('Geef de flow een naam.')
    expect(validateFlow(flow({ trigger: { type: 'schedule.at_time', days: [], time: '08:30' } }))).toBe('Kies minstens één dag.')
    expect(validateFlow(flow({ trigger: { type: 'schedule.at_time', days: [1], time: '25:00' } }))).toBe('Kies een geldig tijdstip.')
    expect(validateFlow(flow({ actions: [{ type: 'update.prompt' }] }))).toMatch(/update/)
    expect(validateFlow(flow({ actions: Array(6).fill({ type: 'app.open_prompt', app: 'notes' }) }))).toMatch(/Hoogstens/)
    expect(validateFlow(flow({ actions: [{ type: 'app.open_prompt', app: 'developer' }] }))).toBe('Kies een app.')
  })

  it('ships valid templates', () => {
    for (const t of FLOW_TEMPLATES) expect(validateFlow(flow(t.flow)), t.id).toBeNull()
  })
})

describe('flow sync merge', () => {
  it('keeps the newest change per flow, a deletion included', () => {
    const mine = [flow({ id: 'a', name: 'Hier nieuwer', updatedAt: 20 }), flow({ id: 'b', name: 'Hier ouder', updatedAt: 5 })]
    const stored = [
      { id: 'a', definition: flow({ id: 'a', name: 'Account', updatedAt: 10 }), revision: 10 },
      { id: 'b', definition: null, revision: 8 }, // deleted on the phone after this device's change
      { id: 'c', definition: flow({ id: 'c', name: 'Van de gsm', createdAt: 3 }), revision: 12 },
    ]
    const merged = mergeFlows(mine, { d: 30 }, stored)
    expect(merged.flows.map((f) => [f.id, f.name])).toEqual([
      ['a', 'Hier nieuwer'],
      ['c', 'Van de gsm'],
    ])
    expect(merged.flows[1].updatedAt).toBe(12)
    expect(merged.deleted).toEqual({ b: 8, d: 30 })
    expect(merged.push.map((s) => s.id).sort()).toEqual(['a', 'd'])
  })

  it('ignores a copy from the account that does not pass validation', () => {
    const broken = { ...flow({ id: 'x' }), actions: [] }
    const merged = mergeFlows([], {}, [{ id: 'x', definition: broken, revision: 50 }])
    expect(merged.flows).toEqual([])
    expect(merged.push).toEqual([])
  })

  it('has nothing to do when both sides match', () => {
    const f = flow({ id: 'a', updatedAt: 10 })
    const merged = mergeFlows([f], {}, [{ id: 'a', definition: f, revision: 10 }])
    expect(merged.push).toEqual([])
    expect(merged.flows).toEqual([f])
  })
})
