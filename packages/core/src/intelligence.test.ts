import { describe, expect, it } from 'vitest'
import { FLOW_TEMPLATES, validateFlow } from './flows'
import {
  adjustDraft,
  decide,
  describeFlow,
  draftToFlow,
  emptyIntel,
  evaluateRules,
  parseIntel,
  refreshSuggestions,
  resetFeedback,
  setRule,
  NEW_GAP_MS,
  type IntelFacts,
} from './intelligence'

const day = 86_400_000
const facts = (patch: Partial<IntelFacts> = {}): IntelFacts => ({
  now: 10 * day,
  firstLessons: { 1: '08:30', 2: '10:15', 4: '08:30' },
  scheduleOn: false,
  flows: [],
  deadlinesSoon: 2,
  isDesktop: true,
  updateAvailable: '1.0.9',
  ...patch,
})
let n = 0
const id = () => `s${++n}`

describe('Intelligence rules', () => {
  it('proposes School Mode before the first lesson, deadline warnings and an update moment', () => {
    const c = evaluateRules(facts())
    expect(c.map((x) => x.rule)).toEqual(['school', 'deadlines', 'updates'])
    expect(c[0].flow.trigger).toEqual({ type: 'schedule.at_time', days: [1, 2, 4], time: '08:15' })
    expect(c[0].reason).toContain('ma, di, do')
    expect(c[2].reason).toContain('1.0.9')
    // Every proposal is a flow that Flow Studio accepts as it is.
    for (const x of c) expect(validateFlow(draftToFlow(x.flow, 'f', 0))).toBeNull()
    expect(describeFlow(c[0].flow)[0]).toBe('Wanneer: op ma, di, do om 08:15')
  })

  it('stays quiet when there is nothing to improve', () => {
    const school = FLOW_TEMPLATES.find((t) => t.id === 'school-start')!.flow
    const deadline = FLOW_TEMPLATES.find((t) => t.id === 'deadline-reminder')!.flow
    const update = FLOW_TEMPLATES.find((t) => t.id === 'update-window')!.flow
    const flows = [school, deadline, update].map((f, i) => draftToFlow(f, `f${i}`, 0))
    expect(evaluateRules(facts({ flows }))).toEqual([])
    expect(evaluateRules(facts({ scheduleOn: true, deadlinesSoon: 0, isDesktop: false }))).toEqual([])
    expect(evaluateRules(facts({ firstLessons: { 1: '08:30' }, deadlinesSoon: 0, isDesktop: false }))).toEqual([])
  })

  it('shows one new proposal per hour, and never one you declined', () => {
    const c = evaluateRules(facts())
    let { state, added } = refreshSuggestions(emptyIntel(), c, 10 * day, id)
    expect(added?.rule).toBe('school')
    expect(refreshSuggestions(state, c, 10 * day + 1000, id).added).toBeNull()
    state = decide(state, added!.id, 'dismiss', 10 * day + 2000)
    ;({ state, added } = refreshSuggestions(state, c, 10 * day + NEW_GAP_MS, id))
    expect(added?.rule).toBe('deadlines')
    // School is in its cooldown; after it, the same situation (same key) still stays declined.
    ;({ state, added } = refreshSuggestions(decide(state, added!.id, 'accept', 11 * day, 'flow-1'), c, 30 * day, id))
    expect(added?.rule).toBe('updates')
    expect(state.suggestions.find((s) => s.rule === 'deadlines')).toMatchObject({ status: 'accepted', flowId: 'flow-1' })
  })

  it('snoozes until tomorrow, expires after a week, and drops proposals whose situation is gone', () => {
    const c = evaluateRules(facts())
    let { state, added } = refreshSuggestions(emptyIntel(), c, 0, id)
    state = decide(state, added!.id, 'snooze', 0)
    expect(refreshSuggestions(state, c, day / 2, id).state.suggestions.find((s) => s.id === added!.id)?.status).toBe('snoozed')
    state = refreshSuggestions(state, c, day + 1, id).state
    expect(state.suggestions.find((s) => s.id === added!.id)?.status).toBe('open')
    const expired = refreshSuggestions(state, c, 9 * day, id).state
    expect(expired.suggestions.find((s) => s.id === added!.id)?.status).toBe('expired')
    expect(expired.rules.school.cooldownUntil).toBeGreaterThan(9 * day)
    // You set up the schedule yourself: the open proposal disappears.
    const gone = refreshSuggestions(state, evaluateRules(facts({ scheduleOn: true })), day + 2, id).state
    expect(gone.suggestions.some((s) => s.id === added!.id)).toBe(false)
  })

  it('keeps your changes, rule switches and a reset', () => {
    const c = evaluateRules(facts())
    let { state, added } = refreshSuggestions(emptyIntel(), c, 0, id)
    state = adjustDraft(state, added!.id, { ...added!.flow, trigger: { type: 'schedule.at_time', days: [1], time: '07:45' } })
    expect(refreshSuggestions(state, c, 1000, id).state.suggestions.find((x) => x.id === added!.id)!.flow.trigger).toMatchObject({ time: '07:45' })
    state = setRule(state, 'school', false)
    expect(state.suggestions).toEqual([])
    expect(refreshSuggestions(state, c, 2 * NEW_GAP_MS, id).added?.rule).toBe('deadlines')
    const back = parseIntel(JSON.parse(JSON.stringify(resetFeedback(state))))
    expect(back.rules.school.enabled).toBe(false)
    expect(back.suggestions).toEqual([])
  })
})
