import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlannedNotice } from '@nexus/core'
import type { ConnectState } from '../connect/engine'
import { sendPlanIfChanged } from './plan'

const phone = { id: 'p1', name: 'OnePlus 15R', platform: 'android', revokedAt: null }
const plan: PlannedNotice[] = [{ ref: 'reminder:a@1', at: 1, title: 'Labo' }]

const browserPhone = { id: 'p2', name: 'Chrome op Android', platform: 'web', push: true, revokedAt: null }

function connect(devices: object[] = [phone]) {
  return {
    getSnapshot: () => ({ status: 'ready', devices }) as unknown as ConnectState,
    sendPlan: vi.fn(async () => {}),
    sendPushPlan: vi.fn(async () => {}),
  }
}

describe('safety net sending', () => {
  beforeEach(() => localStorage.clear())

  it('sends the phone the plan once, again when it changes or gets old', async () => {
    const c = connect()
    expect(await sendPlanIfChanged(c, plan, 0)).toBe(1)
    expect(await sendPlanIfChanged(c, plan, 60_000)).toBe(0)
    expect(await sendPlanIfChanged(c, [], 120_000)).toBe(1) // the reminder was deleted
    expect(await sendPlanIfChanged(c, [], 13 * 60 * 60_000)).toBe(1)
    expect(c.sendPlan).toHaveBeenLastCalledWith('p1', [])
  })

  it('sends nothing while there is nothing to plan or no phone', async () => {
    const c = connect()
    expect(await sendPlanIfChanged(c, [], 0)).toBe(0)
    expect(await sendPlanIfChanged(connect([]), plan, 0)).toBe(0)
    expect(c.sendPlan).not.toHaveBeenCalled()
  })

  it('plans pushes for a browser phone with web push, not for other browsers or itself', async () => {
    const c = connect([
      browserPhone,
      { id: 'pc', name: 'Chrome op Windows', platform: 'web', revokedAt: null },
      { id: 'me', name: 'Dit', platform: 'web', push: true, isThisDevice: true, revokedAt: null },
    ])
    expect(await sendPlanIfChanged(c, plan, 0)).toBe(1)
    expect(c.sendPushPlan).toHaveBeenCalledWith('p2', plan)
    expect(c.sendPlan).not.toHaveBeenCalled()
  })
})
