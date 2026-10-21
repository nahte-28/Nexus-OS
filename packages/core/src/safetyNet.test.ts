import { describe, expect, it } from 'vitest'
import { FLOW_TEMPLATES, type FlowDefinition } from './flows'
import type { Reminder } from './reminders'
import { flowRef, MAX_PLANNED, plannedFlowNotices, plannedReminders, reminderRef, safetyPlan } from './safetyNet'

const at = (iso: string) => new Date(iso).getTime()
// Tuesday 20 October 2026, 07:00 in Brussels.
const now = at('2026-10-20T07:00:00+02:00')
const DAY = 24 * 60 * 60_000

function reminder(patch: Partial<Reminder> = {}): Reminder {
  return { id: 'r1', title: 'Labo indienen', at: now + 60 * 60_000, repeat: 'none', target: 'phone', createdAt: 0, ...patch }
}

function fromTemplate(id: string, patch: Partial<FlowDefinition> = {}): FlowDefinition {
  const t = FLOW_TEMPLATES.find((x) => x.id === id)!
  return { id, enabled: true, version: 1, timeZone: 'Europe/Brussels', createdAt: 0, updatedAt: 0, ...structuredClone(t.flow), ...patch }
}

const noQuiet = () => false

describe('safety net plan', () => {
  it('plans phone reminders of the coming days, repeats included, not those for this device only', () => {
    const daily = reminder({ id: 'd', repeat: 'daily', text: 'Elke dag' })
    const plan = plannedReminders([daily, reminder({ id: 'pc', target: 'this_device' })], now)
    expect(plan).toHaveLength(3)
    expect(plan[0]).toEqual({ ref: reminderRef(daily), at: daily.at, title: 'Labo indienen', text: 'Elke dag' })
    expect(plan[2].at).toBe(daily.at + 2 * DAY)
  })

  it('plans the deadline flow with the same ref the runner uses', () => {
    const flow = fromTemplate('deadline-reminder')
    const deadline = { id: 'r1', title: 'Labo indienen', at: now + 3 * 60 * 60_000 }
    const plan = plannedFlowNotices({ flows: [flow], paused: false, quietAt: noQuiet, deadlines: [deadline], now })
    const minutes = flow.trigger.type === 'deadline.upcoming' ? flow.trigger.minutesBefore : 0
    expect(plan).toEqual([
      { ref: flowRef(flow.id, `deadline:r1@${deadline.at}`, 0), at: deadline.at - minutes * 60_000, title: 'Binnen een uur: Labo indienen', text: 'Om 10:00.' },
    ])
  })

  it('plans fixed-time flows on their days and leaves out what cannot be known ahead', () => {
    const daily: FlowDefinition = {
      ...fromTemplate('school-start'),
      id: 'ochtend',
      trigger: { type: 'schedule.at_time', days: [1, 2, 3, 4, 5], time: '08:00' },
      actions: [{ type: 'notification.send', title: 'Goedemorgen', text: '', target: 'phone' }],
      conditions: [],
    }
    const plan = plannedFlowNotices({ flows: [daily], paused: false, quietAt: noQuiet, deadlines: [], now })
    // Tuesday to Thursday fit in three days; the ref has the local date.
    expect(plan.map((n) => n.ref)).toEqual(['flow:ochtend|at:2026-10-20|0', 'flow:ochtend|at:2026-10-21|0', 'flow:ochtend|at:2026-10-22|0'])
    expect(plan[0].at).toBe(at('2026-10-20T08:00:00+02:00'))

    const withProfile = { ...daily, conditions: [{ type: 'profile.is_active' as const, profile: 'school' as const }] }
    expect(plannedFlowNotices({ flows: [withProfile], paused: false, quietAt: noQuiet, deadlines: [], now })).toEqual([])
    expect(plannedFlowNotices({ flows: [daily], paused: true, quietAt: noQuiet, deadlines: [], now })).toEqual([])
    expect(plannedFlowNotices({ flows: [daily], paused: false, quietAt: () => true, deadlines: [], now })).toEqual([])
    const late = { ...daily, conditions: [{ type: 'local_time.in_range' as const, start: '09:00', end: '17:00' }] }
    expect(plannedFlowNotices({ flows: [late], paused: false, quietAt: noQuiet, deadlines: [], now })).toEqual([])
  })

  it('keeps the soonest notices within the limit, each ref once', () => {
    const many = Array.from({ length: MAX_PLANNED + 5 }, (_, i) => ({ ref: `r${i}`, at: now + (MAX_PLANNED + 5 - i) * 60_000, title: 'x' }))
    const plan = safetyPlan([...many, many[0]])
    expect(plan).toHaveLength(MAX_PLANNED)
    expect(plan[0].ref).toBe(`r${MAX_PLANNED + 4}`)
  })
})
