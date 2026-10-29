import { describe, expect, it } from 'vitest'
import type { BridgeMessage } from '@nexus/core'
import type { ConnectState, DeviceView } from '../connect/engine'
import { BridgeStore, cancelTransfer, markOpened, receiveBatch, retryTransfer, sendTransfer, type BridgeLink } from './store'

const device = (id: string, patch: Partial<DeviceView> = {}): DeviceView => ({
  id,
  name: id === 'pc' ? 'Pc' : id === 'gsm' ? 'Gsm' : id,
  platform: 'web',
  publicKey: 'k',
  createdAt: '',
  lastSeenAt: '',
  revokedAt: null,
  fingerprint: 'F',
  isThisDevice: false,
  ...patch,
})

/** Two devices on one fake Connect: what one sends, the other gets in its next batch. */
function pair() {
  const queues: Record<string, Array<{ from: string; message: BridgeMessage }>> = { pc: [], gsm: [] }
  const pushes: string[] = []
  const link = (self: string, other: string, opts: { failTo?: boolean; push?: boolean } = {}): BridgeLink => ({
    getSnapshot: () =>
      ({ status: 'ready', device: { id: self, name: self === 'pc' ? 'Pc' : 'Gsm', fingerprint: 'F' }, devices: [device(self, { isThisDevice: true }), device(other, { push: opts.push }), device('watch', { platform: 'android' })], inbox: [], unread: 0, error: null }) as ConnectState,
    async sendBridge(to, message) {
      if (opts.failTo) throw new Error('Geen verbinding')
      queues[to].push({ from: self, message })
    },
    async pushNotice(to, title) {
      if (opts.push) pushes.push(`${to}:${title}`)
    },
  })
  const take = (id: string) => queues[id].splice(0)
  return { link, take, pushes }
}

describe('Bridge between two devices', () => {
  it('delivers text, reports delivered and opened back, and pushes to a phone', async () => {
    const { link, take, pushes } = pair()
    const pc = new BridgeStore(false)
    const gsm = new BridgeStore(false)
    const pcLink = link('pc', 'gsm', { push: true })
    const gsmLink = link('gsm', 'pc')

    const [t] = await sendTransfer(pcLink, ['gsm', 'watch'], 'https://ap.be/rooster', { store: pc, now: 1000 })
    expect(t.status).toBe('sent')
    expect(pc.getSnapshot().transfers).toHaveLength(1)
    expect(pushes).toEqual(['gsm:Link van Pc'])

    const shown: string[] = []
    await receiveBatch(gsmLink, take('gsm'), { store: gsm, now: 2000, notify: (x) => shown.push(x.content) })
    expect(shown).toEqual(['https://ap.be/rooster'])
    const received = gsm.getSnapshot().transfers[0]
    expect(received).toMatchObject({ direction: 'in', deviceName: 'Pc', type: 'link', status: 'delivered' })

    await receiveBatch(pcLink, take('pc'), { store: pc, now: 3000 })
    expect(pc.getSnapshot().transfers[0].status).toBe('delivered')
    await markOpened(gsmLink, received, { store: gsm, now: 4000 })
    await receiveBatch(pcLink, take('pc'), { store: pc, now: 5000 })
    expect(pc.getSnapshot().transfers[0].status).toBe('opened')
  })

  it('a cancel that arrives with the transfer wins, and nothing is shown', async () => {
    const { link, take } = pair()
    const pc = new BridgeStore(false)
    const gsm = new BridgeStore(false)
    const [t] = await sendTransfer(link('pc', 'gsm'), ['gsm'], 'geheim', { store: pc, now: 1000 })
    await cancelTransfer(link('pc', 'gsm'), t, { store: pc, now: 1500 })
    expect(pc.getSnapshot().transfers[0].status).toBe('cancelled')
    const shown: string[] = []
    await receiveBatch(link('gsm', 'pc'), take('gsm'), { store: gsm, now: 2000, notify: (x) => shown.push(x.id) })
    expect(shown).toEqual([])
    expect(gsm.getSnapshot().transfers[0]).toMatchObject({ status: 'cancelled', content: '' })
    expect(take('pc')).toEqual([])
  })

  it('declines when Bridge is off or the sender is blocked, and marks a failed send', async () => {
    const { link, take } = pair()
    const pc = new BridgeStore(false)
    const gsm = new BridgeStore(false)
    await sendTransfer(link('pc', 'gsm'), ['gsm'], 'hallo', { store: pc, now: 1000 })
    await receiveBatch(link('gsm', 'pc'), take('gsm'), { store: gsm, now: 2000, enabled: false })
    expect(gsm.getSnapshot().transfers).toHaveLength(0)
    await receiveBatch(link('pc', 'gsm'), take('pc'), { store: pc, now: 3000 })
    expect(pc.getSnapshot().transfers[0]).toMatchObject({ status: 'declined', reason: 'off' })

    gsm.setBlocked('pc', true)
    const [again] = await retryTransfer(link('pc', 'gsm'), pc.getSnapshot().transfers[0], { store: pc, now: 4000 })
    await receiveBatch(link('gsm', 'pc'), take('gsm'), { store: gsm, now: 5000 })
    await receiveBatch(link('pc', 'gsm'), take('pc'), { store: pc, now: 6000 })
    expect(pc.getSnapshot().transfers.find((x) => x.id === again.id)).toMatchObject({ status: 'declined', reason: 'blocked' })

    const [failed] = await sendTransfer(link('pc', 'gsm', { failTo: true }), ['gsm'], 'offline', { store: pc, now: 7000 })
    expect(failed).toMatchObject({ status: 'failed', error: 'Geen verbinding' })
  })
})
