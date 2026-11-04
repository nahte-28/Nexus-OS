import { describe, expect, it } from 'vitest'
import { makeEvent, toEvent } from './events'
import { FEATURES, STABLE_FEATURES } from './features'
import { emptyFinance, type FinanceState, type RecurringItem, type Subscription } from './finance'
import { eventChains, eventCounts, monthGrid, paymentCalendar, platformHealth, relatedTo, type RelatedInput } from './integration'
import type { LifeItem } from './life'
import { MODULES, moduleStatus, registryProblems } from './modules'
import { emptyProjectHub, type HubTask } from './projectHub'

const base = { updatedAt: 1, deletedAt: null }
const life: LifeItem[] = [
  { ...base, id: 'p1', kind: 'project', name: 'Labo', color: null, archived: false },
  { ...base, id: 'd1', kind: 'deadline', title: 'Verslag', dueAt: 100, projectId: 'p1', notes: '', doneAt: null, remind: [], target: 'phone' },
  { ...base, id: 'd2', kind: 'deadline', title: 'Klaar', dueAt: 50, projectId: 'p1', notes: '', doneAt: 60, remind: [], target: 'phone' },
  { ...base, id: 'd3', kind: 'deadline', title: 'Weg', dueAt: 50, projectId: 'p1', notes: '', doneAt: null, remind: [], target: 'phone', deletedAt: 5 },
]
const task: HubTask = { id: 't1', projectId: 'p1', title: 'Schrijven', notes: '', column: 'doing', priority: 'normal', order: 0, dueAt: null, milestoneId: null, dependsOn: [], deadlineId: 'd1', createdAt: 1, updatedAt: 1, deletedAt: null }
const input = (over: Partial<RelatedInput> = {}): RelatedInput => ({
  life,
  inbox: [
    { id: 'deadline:d1@100', title: 'Deadline binnen een dag: Verslag', at: 10, link: { app: 'agenda', id: 'd1' } },
    { id: 'x', title: 'Anders', at: 11, link: { app: 'flows', id: 'd1' } },
  ],
  hub: { ...emptyProjectHub(), tasks: [task] },
  projectApp: 'projecthub',
  ...over,
})

describe('relatedTo', () => {
  it('links a deadline to its project, its Project Hub task and the Inbox items about it', () => {
    expect(relatedTo('d1', input())).toEqual([
      { label: 'Project', title: 'Labo', app: 'projecthub', id: 'p1' },
      { label: 'Taak in Project Hub', title: 'Schrijven', app: 'projecthub', id: 'p1' },
      { label: 'Melding', title: 'Deadline binnen een dag: Verslag', app: 'inbox', id: 'deadline:d1@100' },
    ])
  })

  it('opens the project in the Agenda when the Project Hub is off', () => {
    expect(relatedTo('d1', input({ hub: null, projectApp: 'agenda' }))[0]).toEqual({ label: 'Project', title: 'Labo', app: 'agenda', id: 'p1' })
  })

  it('lists open deadlines, open tasks, files and Inbox items of a project, not done or deleted ones', () => {
    const related = relatedTo('p1', input({ files: [{ id: 'f1', name: 'opgave.pdf' }] }))
    expect(related.map((r) => `${r.label}:${r.title}`)).toEqual(['Deadline:Verslag', 'Project Hub:1 open taak', 'Bestand:opgave.pdf', 'Melding:Deadline binnen een dag: Verslag'])
  })

  it('returns nothing for an unknown or deleted item', () => {
    expect(relatedTo('nope', input())).toEqual([])
    expect(relatedTo('d3', input())).toEqual([])
  })
})

describe('paymentCalendar', () => {
  const sub = (over: Partial<Subscription>): Subscription => ({ id: 's', name: 'Spotify', amount: 1099, category: 'Abonnementen', cycle: 'monthly', next: '2026-11-05', remindDays: null, createdAt: 0, updatedAt: 0, deletedAt: null, ...over })
  const rec = (over: Partial<RecurringItem>): RecurringItem => ({ id: 'r', name: 'Job', kind: 'income', amount: 25000, category: 'Job', cycle: 'weekly', next: '2026-11-07', createdAt: 0, updatedAt: 0, deletedAt: null, ...over })
  const state = (s: Subscription[], r: RecurringItem[]): FinanceState => ({ ...emptyFinance(), subscriptions: s, recurring: r })

  it('puts subscriptions and fixed amounts on their days with totals in and out', () => {
    const cal = paymentCalendar(state([sub({}), sub({ id: 'gone', deletedAt: 1 })], [rec({}), rec({ id: 'r2', name: 'Huur', kind: 'expense', amount: 30000, cycle: 'monthly', next: '2026-11-01' })]), '2026-11')
    expect(cal.days.map((d) => d.date)).toEqual(['2026-11-01', '2026-11-05', '2026-11-07', '2026-11-14', '2026-11-21', '2026-11-28'])
    expect(cal.days[1].items).toEqual([{ kind: 'subscription', id: 's', name: 'Spotify', category: 'Abonnementen', amount: -1099 }])
    expect(cal.out).toBe(30000 + 1099)
    expect(cal.in).toBe(4 * 25000)
  })

  it('leaves out dates before the next date and shows later months', () => {
    expect(paymentCalendar(state([sub({ next: '2026-12-05' })], []), '2026-11').days).toEqual([])
    expect(paymentCalendar(state([sub({ next: '2026-10-05' })], []), '2027-01').days.map((d) => d.date)).toEqual(['2027-01-05'])
  })

  it('builds a Monday-first grid', () => {
    const grid = monthGrid('2026-11')
    expect(grid[0]).toEqual([null, null, null, null, null, null, '2026-11-01'])
    expect(grid.every((w) => w.length === 7)).toBe(true)
    expect(grid.flat().filter(Boolean)).toHaveLength(30)
  })
})

describe('events', () => {
  const e = (id: string, at: number, correlationId?: string, priority: 'low' | 'high' = 'low') => makeEvent({ id, source: 'deadline', type: 't', at, title: id, priority, ...(correlationId ? { correlationId } : {}) })

  it('keeps correlationId through storage', () => {
    expect(toEvent(JSON.parse(JSON.stringify(e('a', 1, 'deadline:d1'))))?.correlationId).toBe('deadline:d1')
    expect(toEvent({ ...e('a', 1), correlationId: 5 })?.correlationId).toBeUndefined()
  })

  it('groups events about the same thing into chains, newest first', () => {
    const chains = eventChains([e('a', 1, 'x'), e('b', 5, 'x'), e('c', 3, 'y'), e('d', 9, 'z'), e('e', 10, 'z'), e('f', 2)])
    expect(chains.map((c) => [c.correlationId, c.events.map((x) => x.id)])).toEqual([
      ['z', ['d', 'e']],
      ['x', ['a', 'b']],
    ])
  })

  it('counts events per source in the last day', () => {
    const now = 100 * 3_600_000
    expect(eventCounts([e('a', now - 1000, undefined, 'high'), e('b', now - 2000), e('old', 0)], now)).toEqual([{ source: 'deadline', count: 2, high: 1 }])
  })
})

describe('module register', () => {
  const apps = MODULES.filter((m) => m.app).map((m) => ({ id: m.app!, feature: m.feature }))

  it('has a manifest for every switch and no problems', () => {
    expect(MODULES.map((m) => m.feature).sort()).toEqual(FEATURES.map((f) => f.id).sort())
    expect(registryProblems(apps)).toEqual([])
  })

  it('reports missing apps, unknown modules and SQL files the Database-check does not know', () => {
    const broken = MODULES.map((m) => (m.feature === 'vault' ? { ...m, schema: 'nope.sql', uses: ['zzz' as never] } : m))
    const problems = registryProblems(apps.filter((a) => a.id !== 'sentinel'), broken)
    expect(problems).toContain('Sentinel: app sentinel hoort niet bij deze module')
    expect(problems).toContain('Vault: nope.sql staat niet in de Database-check')
    expect(problems).toContain('Vault: gebruikt onbekende module zzz')
  })

  it('turns on by default only modules without SQL that are not for developers', () => {
    expect(STABLE_FEATURES.sort()).toEqual(['bridge', 'controlCenter', 'integration', 'intelligence', 'launcher', 'marketplace', 'offline', 'sentinel', 'timeMachine'])
    for (const id of STABLE_FEATURES) expect(MODULES.find((m) => m.feature === id)?.schema, id).toBeNull()
  })

  it('says which used modules are off', () => {
    const marketplace = moduleStatus({ marketplace: true, devHub: false }).find((m) => m.manifest.feature === 'marketplace')!
    expect(marketplace).toMatchObject({ on: true, missingUses: ['devHub'] })
  })
})

describe('platformHealth', () => {
  it('puts problems first', () => {
    const checks = platformHealth({ online: true, signedIn: true, channels: [{ label: 'Notities', pending: 0, error: 'stuk' }], registryProblems: [], missingUses: [], storageBytes: 4.8 * 1024 * 1024, highEvents: 0 })
    expect(checks.slice(0, 2).map((c) => [c.id, c.level])).toEqual([
      ['sync', 'bad'],
      ['storage', 'bad'],
    ])
    expect(checks.at(-1)?.level).toBe('ok')
  })
})

describe('refLink', () => {
  it('leads a notification to its record', async () => {
    const { refLink } = await import('./integration')
    expect(refLink('deadline:d1@100-60')).toEqual({ app: 'agenda', id: 'd1' })
    expect(refLink('appointment:a1@100-15')).toEqual({ app: 'agenda', id: 'a1' })
    expect(refLink('flow:f1|e1|0')).toEqual({ app: 'flows', id: 'f1' })
    expect(refLink('subscription:s1@2026-11-05')).toEqual({ app: 'finance' })
    expect(refLink('dagstart:2026-11-03')).toEqual({ app: 'agenda' })
    expect(refLink('nexus-push')).toBeNull()
    expect(refLink('reminder-123')).toBeNull()
  })
})
