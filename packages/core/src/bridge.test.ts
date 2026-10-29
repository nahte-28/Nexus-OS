import { describe, expect, it } from 'vitest'
import {
  applyBridgeStatus,
  bridgeType,
  canCancel,
  canRetry,
  checkContent,
  emptyBridge,
  expireTransfers,
  newTransfer,
  parseBridge,
  parseBridgeState,
  receiveTransfer,
  safeLink,
  toPayload,
  upsertTransfer,
  type BridgeState,
} from './bridge'

const hour = 3_600_000
const pc = { id: 'pc', name: 'Pc' }

describe('Bridge', () => {
  it('only treats a single web address as a link', () => {
    expect(safeLink(' https://ap.be/rooster ')).toBe('https://ap.be/rooster')
    expect(safeLink('javascript:alert(1)')).toBeNull()
    expect(safeLink('https://user:pw@ap.be')).toBeNull()
    expect(safeLink('kijk https://ap.be')).toBeNull()
    expect(bridgeType('http://example.com')).toBe('link')
    expect(bridgeType('Lokaal B2.14')).toBe('text')
    expect(checkContent('  ')).toMatch(/Typ of plak/)
    expect(checkContent('x'.repeat(4001))).toMatch(/4000/)
  })

  it('reads only well-formed messages, and decides itself what is a link', () => {
    expect(parseBridge({ v: 1, kind: 'bridge', transferId: 't', type: 'link', content: 'javascript:x', senderName: 'Pc', sentAt: 1, expiresAt: 2 })).toMatchObject({ type: 'text' })
    expect(parseBridge({ v: 1, kind: 'bridge', transferId: 't', content: '', sentAt: 1, expiresAt: 2 })).toBeNull()
    expect(parseBridge({ v: 1, kind: 'bridge_status', transferId: 't', status: 'opened', at: 3 })).toEqual({ v: 1, kind: 'bridge_status', transferId: 't', status: 'opened', at: 3 })
    expect(parseBridge({ v: 1, kind: 'bridge_status', transferId: 't', status: 'deleted', at: 3 })).toBeNull()
    expect(parseBridge({ v: 1, kind: 'notification' })).toBeNull()
  })

  it('goes from sent to delivered to opened on the sender, never back', () => {
    const t = { ...newTransfer({ id: 't1', deviceId: 'gsm', deviceName: 'Gsm', content: 'https://ap.be', now: 0, expiryHours: 24 }), status: 'sent' as const }
    let s: BridgeState = upsertTransfer(emptyBridge(), t, 0)
    s = applyBridgeStatus(s, { v: 1, kind: 'bridge_status', transferId: 't1', status: 'opened', at: 2 }, 'gsm', 2)
    s = applyBridgeStatus(s, { v: 1, kind: 'bridge_status', transferId: 't1', status: 'delivered', at: 1 }, 'gsm', 3)
    expect(s.transfers[0].status).toBe('opened')
    // A status from another device than the receiver is ignored.
    expect(applyBridgeStatus(s, { v: 1, kind: 'bridge_status', transferId: 't1', status: 'declined', at: 4 }, 'pc', 4)).toBe(s)
  })

  it('receives once, and declines when blocked, switched off or expired', () => {
    const p = toPayload(newTransfer({ id: 't1', deviceId: 'gsm', deviceName: 'Gsm', content: 'Lokaal B2.14', now: 0, expiryHours: 1 }), 'Pc')
    const first = receiveTransfer(emptyBridge(), p, pc, 10, true)
    expect(first.answer?.status).toBe('delivered')
    expect(first.state.transfers[0]).toMatchObject({ direction: 'in', deviceId: 'pc', content: 'Lokaal B2.14', status: 'delivered' })
    expect(receiveTransfer(first.state, p, pc, 11, true).answer).toBeNull()
    expect(receiveTransfer(emptyBridge(), p, pc, 10, false).answer).toMatchObject({ status: 'declined', reason: 'off' })
    const blocked = { ...emptyBridge(), settings: { blocked: ['pc'], expiryHours: 24 } }
    expect(receiveTransfer(blocked, p, pc, 10, true).answer).toMatchObject({ status: 'declined', reason: 'blocked' })
    expect(receiveTransfer(emptyBridge(), p, pc, 2 * hour, true).answer).toMatchObject({ status: 'declined', reason: 'expired' })
  })

  it('cancels and expires: content goes, the sender can try again', () => {
    const out = { ...newTransfer({ id: 't1', deviceId: 'gsm', deviceName: 'Gsm', content: 'geheim', now: 0, expiryHours: 1 }), status: 'sent' as const }
    expect(canCancel(out, 10)).toBe(true)
    const received = receiveTransfer(emptyBridge(), toPayload(out, 'Pc'), pc, 10, true).state
    const cancelled = applyBridgeStatus(received, { v: 1, kind: 'bridge_status', transferId: 't1', status: 'cancel', at: 20 }, 'pc', 20)
    expect(cancelled.transfers[0]).toMatchObject({ status: 'cancelled', content: '' })

    const sender = expireTransfers(upsertTransfer(emptyBridge(), out, 0), 2 * hour)
    expect(sender.transfers[0].status).toBe('expired')
    expect(canRetry(sender.transfers[0])).toBe(true)
    const receiver = expireTransfers(received, 2 * hour)
    expect(receiver.transfers[0]).toMatchObject({ status: 'expired', content: '' })
  })

  it('reads back stored state', () => {
    const s = upsertTransfer(emptyBridge(), newTransfer({ id: 'a', deviceId: 'd', deviceName: 'D', content: 'x', now: 1, expiryHours: 24 }), 1)
    const back = parseBridgeState(JSON.parse(JSON.stringify({ ...s, settings: { blocked: ['d', 3], expiryHours: 5 } })))
    expect(back.transfers[0].id).toBe('a')
    expect(back.settings).toEqual({ blocked: ['d'], expiryHours: 24 })
  })
})
