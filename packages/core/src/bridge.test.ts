import { describe, expect, it } from 'vitest'
import {
  applyBridgeStatus,
  BRIDGE_MAX_FILE,
  checkFile,
  fileSize,
  transferTitle,
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
    const blocked = { ...emptyBridge(), settings: { blocked: ['pc'], expiryHours: 24, autoClipboard: false } }
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
    expect(back.settings).toEqual({ blocked: ['d'], expiryHours: 24, autoClipboard: false })
  })

  it('Bridge 2.0: accepts a file only with a bridge path and a key, and a resume only with an app', () => {
    const base = { v: 1, kind: 'bridge', transferId: 't', content: 'x', senderName: 'Pc', sentAt: 1, expiresAt: 2 }
    const file = { name: 'a/b.pdf', size: 10, mediaType: 'application/pdf', path: '0b6f8e2a-1c3d-4e5f-8a9b-0c1d2e3f4a5b/bridge/t.bin', key: 'AAAA', iv: 'BBBB' }
    expect(parseBridge({ ...base, type: 'file', file })).toMatchObject({ type: 'file', content: 'a_b.pdf', file: { name: 'a_b.pdf', key: 'AAAA' } })
    expect(parseBridge({ ...base, type: 'file', file: { ...file, path: '../../etc/passwd' } })).toBeNull()
    expect(parseBridge({ ...base, type: 'file', file: { ...file, path: 'someone/files/x.bin' } })).toBeNull()
    expect(parseBridge({ ...base, type: 'file', file: { ...file, key: '' } })).toBeNull()
    expect(parseBridge({ ...base, type: 'file', file: { ...file, size: BRIDGE_MAX_FILE + 1 } })).toBeNull()
    expect(parseBridge({ ...base, type: 'resume', resume: { app: 'notes', id: 'n1', title: 'Notitie' } })).toMatchObject({ type: 'resume', content: 'Notitie', resume: { app: 'notes', id: 'n1' } })
    expect(parseBridge({ ...base, type: 'resume', resume: { app: 'javascript:alert(1)', title: 'x' } })).toBeNull()
    expect(parseBridge({ ...base, clip: true })).toMatchObject({ type: 'text', clip: true })
    expect(checkFile({ name: 'x', size: 0 })).toMatch(/leeg/)
    expect(fileSize(3_400_000)).toBe('3,4 MB')
    expect(transferTitle({ type: 'text', clip: true, content: 'x' })).toBe('Klembord')
  })

  it('Bridge 2.0: forgets the key of a received file when it expires or is cancelled', () => {
    const file = { name: 'a.pdf', size: 1, mediaType: 'application/pdf', path: '0b6f8e2a-1c3d-4e5f-8a9b-0c1d2e3f4a5b/bridge/f.bin', key: 'AAAA', iv: 'BBBB' }
    const state = { ...emptyBridge(), transfers: [{ id: 'f', direction: 'in' as const, deviceId: 'pc', deviceName: 'Pc', type: 'file' as const, content: 'a.pdf', sentAt: 0, expiresAt: 10, status: 'delivered' as const, updatedAt: 0, file }] }
    expect(expireTransfers(state, 11).transfers[0]).toMatchObject({ content: '', status: 'expired', file: { key: '', iv: '', name: 'a.pdf' } })
    expect(applyBridgeStatus(state, { v: 1, kind: 'bridge_status', transferId: 'f', status: 'cancel', at: 5 }, 'pc', 5).transfers[0].file?.key).toBe('')
    const stored = parseBridgeState(JSON.parse(JSON.stringify(expireTransfers(state, 11))))
    expect(stored.transfers[0].file).toMatchObject({ name: 'a.pdf', key: '' })
  })
})
