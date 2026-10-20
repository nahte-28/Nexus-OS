import { describe, expect, it } from 'vitest'
import {
  emptyRuntime,
  fillText,
  FLOW_TEMPLATES,
  markHandled,
  MAX_RUNS_PER_HOUR,
  nextScheduledRun,
  planRuns,
  triggerEvents,
  validateFlow,
  type FlowContext,
  type FlowDefinition,
} from './flows'

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
