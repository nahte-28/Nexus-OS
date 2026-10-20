import { beforeEach, describe, expect, it } from 'vitest'
import { FLOW_TEMPLATES, type FlowContext, type FlowDefinition, type StoredFlow } from '@nexus/core'
import { tickFlows, type FlowEffects } from './runner'
import { FlowsStore, type FlowRun } from './store'
import { claimFlowRun, FlowsSync, fromRunRow, toRunRow, type FlowsRemote, type SyncedSettings } from './sync'

/** The account, with the same rules as the database: newer revisions only, one run per event. */
function fakeAccount() {
  const flows = new Map<string, StoredFlow>()
  let settings: { settings: SyncedSettings; revision: number } | null = null
  const runs = new Map<string, ReturnType<typeof toRunRow>>()
  const remote: FlowsRemote & { online: boolean } = {
    online: true,
    async pullFlows() {
      return structuredClone([...flows.values()])
    },
    async pushFlows(rows) {
      for (const r of rows) if (!flows.has(r.id) || flows.get(r.id)!.revision < r.revision) flows.set(r.id, structuredClone(r))
    },
    async pullSettings() {
      return structuredClone(settings)
    },
    async pushSettings(s, revision) {
      if (!settings || revision > settings.revision) settings = structuredClone({ settings: s, revision })
    },
    async claim(run) {
      if (!this.online) throw new Error('Failed to fetch')
      const row = toRunRow(run, true)
      if ([...runs.values()].some((r) => r.flow_id === row.flow_id && r.event_id === row.event_id)) return false
      runs.set(row.id, row)
      return true
    },
    async pushRuns(list) {
      const done: string[] = []
      for (const run of list) {
        const row = toRunRow(run)
        const dup = [...runs.values()].some((r) => r.id !== row.id && r.flow_id === row.flow_id && r.event_id === row.event_id)
        if (!dup) runs.set(row.id, row)
        done.push(run.id)
      }
      return done
    },
    async pullRuns(limit) {
      return [...runs.values()].filter((r) => r.status !== 'running').map(fromRunRow).slice(0, limit)
    },
    async deleteRuns(before) {
      for (const [id, r] of runs) if (before === undefined || Date.parse(r.started_at) < before) runs.delete(id)
    },
  }
  return { remote, flows, runs, getSettings: () => settings }
}

const now = new Date('2026-10-20T08:31:00+02:00').getTime()
const ctx = (patch: Partial<FlowContext> = {}): FlowContext => ({ now, activeProfile: 'personal', online: true, deadlines: [], devices: [], update: null, ...patch })

function fromTemplate(id: string, patch: Partial<FlowDefinition> = {}): FlowDefinition {
  const t = FLOW_TEMPLATES.find((x) => x.id === id)!
  return { id, enabled: true, version: 1, timeZone: 'Europe/Brussels', createdAt: 0, updatedAt: 0, ...structuredClone(t.flow), ...patch }
}

function effects(sync: FlowsSync, device: string): FlowEffects & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    activateProfile: (p) => void calls.push(`profile:${p}`),
    notify: async (title) => void calls.push(`notify:${title}`),
    prompt: (p) => void calls.push(`prompt:${p.kind}`),
    claim: (run: FlowRun) => claimFlowRun(run, sync),
    deviceName: () => device,
  }
}

describe('flows sync', () => {
  beforeEach(() => localStorage.clear())

  it('brings a flow, its deletion and the settings from the PC to the phone', async () => {
    const account = fakeAccount()
    const pc = new FlowsStore()
    const pcSync = new FlowsSync(account.remote, pc)
    pc.save(fromTemplate('school-start'), 100)
    pc.setSettings({ quiet: { enabled: true, start: '23:00', end: '06:00' } }, 200)
    await pcSync.sync()

    localStorage.clear() // the phone is another device
    const phone = new FlowsStore()
    await new FlowsSync(account.remote, phone).sync()
    expect(phone.getSnapshot().flows.map((f) => f.name)).toEqual(['School Start'])
    expect(phone.getSnapshot().settings.quiet).toEqual({ enabled: true, start: '23:00', end: '06:00' })

    pc.remove('school-start', 300)
    expect(pcSync.hasLocalChange()).toBe(true)
    await pcSync.sync()
    await new FlowsSync(account.remote, phone).sync()
    expect(phone.getSnapshot().flows).toEqual([])
  })

  it('does not overwrite settings someone changed with the defaults of a new device', async () => {
    const account = fakeAccount()
    const pc = new FlowsStore()
    pc.setSettings({ paused: true }, 500)
    await new FlowsSync(account.remote, pc).sync()
    localStorage.clear()
    const phone = new FlowsStore()
    await new FlowsSync(account.remote, phone).sync()
    expect(phone.getSnapshot().settings.paused).toBe(true)
    expect(account.getSettings()?.revision).toBe(500)
  })

  it('runs an event on one device only, and shows that run on the other', async () => {
    const account = fakeAccount()
    const pc = new FlowsStore()
    const pcSync = new FlowsSync(account.remote, pc)
    pc.save(fromTemplate('school-start'))
    await pcSync.sync()
    localStorage.clear()
    const phone = new FlowsStore()
    const phoneSync = new FlowsSync(account.remote, phone)
    await phoneSync.sync()

    const pcFx = effects(pcSync, 'PC')
    const phoneFx = effects(phoneSync, 'OnePlus 15R')
    await tickFlows(ctx(), pcFx, pc)
    await tickFlows(ctx({ now: now + 10_000 }), phoneFx, phone)
    expect(pcFx.calls).toEqual(['profile:school', 'prompt:app'])
    expect(phoneFx.calls).toEqual([])
    expect(phone.getRuns()).toEqual([])

    await pcSync.sync()
    await phoneSync.sync()
    const shared = phone.getRuns()
    expect(shared).toHaveLength(1)
    expect(shared[0]).toMatchObject({ flowName: 'School Start', device: 'PC', status: 'ok', event: 'Op een vast tijdstip', synced: true })
    expect(shared[0].steps.map((s) => s.status)).toEqual(['ok', 'ok'])
  })

  it('still runs without a connection, so a reminder never waits for the network', async () => {
    const account = fakeAccount()
    const pc = new FlowsStore()
    const pcSync = new FlowsSync(account.remote, pc)
    pc.save(fromTemplate('school-start'))
    account.remote.online = false
    const fx = effects(pcSync, 'PC')
    await tickFlows(ctx(), fx, pc)
    expect(fx.calls).toHaveLength(2)
    expect(pc.getRuns()[0].synced).toBeUndefined()
    account.remote.online = true
    await pcSync.sync()
    expect(pc.getRuns()[0].synced).toBe(true)
    expect(account.runs.size).toBe(1)
  })

  it('keeps the titles of deadlines and the text of notifications off the account', () => {
    const row = toRunRow({
      id: 'r1',
      flowId: 'f',
      flowName: 'Deadline Reminder',
      event: 'Labo 3 indienen',
      eventId: 'deadline:x@1',
      trigger: 'deadline.upcoming',
      at: now,
      status: 'ok',
      steps: [{ type: 'notification.send', action: 'Melding: Binnen een uur: Labo 3 indienen', status: 'ok' }],
    })
    expect(JSON.stringify(row)).not.toContain('Labo 3')
  })
})
