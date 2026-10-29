/**
 * NEXUS Bridge (blueprint fase 4): text and links to one of your own devices. Everything travels
 * as an end-to-end encrypted NEXUS Connect message, so the server never sees the content. Each
 * device keeps its own list of transfers. Pure logic; the web app sends and receives.
 */

export type BridgeType = 'text' | 'link'

/** sending → sent → delivered → opened; or declined, expired, cancelled, failed. */
export type TransferStatus = 'sending' | 'sent' | 'delivered' | 'opened' | 'declined' | 'expired' | 'cancelled' | 'failed'

export type DeclineReason = 'blocked' | 'off' | 'expired'

/** A transfer as it travels, inside the encrypted Connect message. */
export interface BridgePayload {
  v: 1
  kind: 'bridge'
  transferId: string
  type: BridgeType
  content: string
  senderName: string
  sentAt: number
  expiresAt: number
}

/** What happened to a transfer, sent back by the receiver (delivered, opened, declined) or by the sender (cancel). */
export interface BridgeStatusPayload {
  v: 1
  kind: 'bridge_status'
  transferId: string
  status: 'delivered' | 'opened' | 'declined' | 'cancel'
  reason?: DeclineReason
  at: number
}

export type BridgeMessage = BridgePayload | BridgeStatusPayload

export interface Transfer {
  id: string
  direction: 'out' | 'in'
  /** The other device: the receiver of an outgoing transfer, the sender of an incoming one. */
  deviceId: string
  deviceName: string
  type: BridgeType
  /** Emptied once an incoming transfer expires or is cancelled. */
  content: string
  sentAt: number
  expiresAt: number
  status: TransferStatus
  updatedAt: number
  reason?: DeclineReason
  error?: string
}

export interface BridgeSettings {
  /** Devices that may not send to this one. */
  blocked: string[]
  /** How long a transfer stays available, in hours. */
  expiryHours: number
}

export interface BridgeState {
  transfers: Transfer[]
  settings: BridgeSettings
}

export const BRIDGE_MAX_CONTENT = 4000
export const BRIDGE_EXPIRY_CHOICES = [1, 24, 168]
export const BRIDGE_MAX_TRANSFERS = 100
export const BRIDGE_KEEP_MS = 30 * 86_400_000

export const emptyBridge = (): BridgeState => ({ transfers: [], settings: { blocked: [], expiryHours: 24 } })

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const STATUSES: TransferStatus[] = ['sending', 'sent', 'delivered', 'opened', 'declined', 'expired', 'cancelled', 'failed']
const REASONS: DeclineReason[] = ['blocked', 'off', 'expired']

/** The address when [text] is one web link and nothing else; only http and https ever open. */
export function safeLink(text: string): string | null {
  const t = text.trim()
  if (!t || /\s/.test(t)) return null
  try {
    const url = new URL(t)
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) return null
    return url.href
  } catch {
    return null
  }
}

export const bridgeType = (text: string): BridgeType => (safeLink(text) ? 'link' : 'text')

/** A received Connect message, when it is one for Bridge. Anything malformed is dropped. */
export function parseBridge(value: unknown): BridgeMessage | null {
  if (!isObject(value) || value.v !== 1 || typeof value.transferId !== 'string' || !value.transferId || value.transferId.length > 100) return null
  if (value.kind === 'bridge') {
    if (typeof value.content !== 'string' || !isNum(value.sentAt) || !isNum(value.expiresAt)) return null
    const content = value.content.slice(0, BRIDGE_MAX_CONTENT)
    if (!content.trim()) return null
    // The receiver decides what a link is, so a "link" that is not a web address shows as text.
    return {
      v: 1,
      kind: 'bridge',
      transferId: value.transferId,
      type: bridgeType(content),
      content,
      senderName: typeof value.senderName === 'string' ? value.senderName.slice(0, 80) : '',
      sentAt: value.sentAt,
      expiresAt: value.expiresAt,
    }
  }
  if (value.kind === 'bridge_status') {
    const status = value.status
    if (status !== 'delivered' && status !== 'opened' && status !== 'declined' && status !== 'cancel') return null
    if (!isNum(value.at)) return null
    return { v: 1, kind: 'bridge_status', transferId: value.transferId, status, ...(REASONS.includes(value.reason as DeclineReason) ? { reason: value.reason as DeclineReason } : {}), at: value.at }
  }
  return null
}

function parseTransfer(v: unknown): Transfer | null {
  if (!isObject(v) || typeof v.id !== 'string' || typeof v.deviceId !== 'string' || !isNum(v.sentAt) || !isNum(v.expiresAt)) return null
  return {
    id: v.id,
    direction: v.direction === 'in' ? 'in' : 'out',
    deviceId: v.deviceId,
    deviceName: typeof v.deviceName === 'string' ? v.deviceName : '',
    type: v.type === 'link' ? 'link' : 'text',
    content: typeof v.content === 'string' ? v.content.slice(0, BRIDGE_MAX_CONTENT) : '',
    sentAt: v.sentAt,
    expiresAt: v.expiresAt,
    status: STATUSES.includes(v.status as TransferStatus) ? (v.status as TransferStatus) : 'failed',
    updatedAt: isNum(v.updatedAt) ? v.updatedAt : v.sentAt,
    ...(REASONS.includes(v.reason as DeclineReason) ? { reason: v.reason as DeclineReason } : {}),
    ...(typeof v.error === 'string' ? { error: v.error.slice(0, 300) } : {}),
  }
}

export function parseBridgeState(raw: unknown): BridgeState {
  if (!isObject(raw)) return emptyBridge()
  const s = isObject(raw.settings) ? raw.settings : {}
  return {
    transfers: (Array.isArray(raw.transfers) ? raw.transfers : []).map(parseTransfer).filter((t): t is Transfer => t !== null),
    settings: {
      blocked: Array.isArray(s.blocked) ? s.blocked.filter((x): x is string => typeof x === 'string') : [],
      expiryHours: BRIDGE_EXPIRY_CHOICES.includes(s.expiryHours as number) ? (s.expiryHours as number) : 24,
    },
  }
}

/** Newest first, at most 100, nothing older than 30 days. */
function keep(transfers: Transfer[], now: number): Transfer[] {
  return transfers
    .filter((t) => now - t.sentAt < BRIDGE_KEEP_MS)
    .sort((a, b) => b.sentAt - a.sentAt)
    .slice(0, BRIDGE_MAX_TRANSFERS)
}

/** Checks what someone wants to send; a Dutch message when it cannot go. */
export function checkContent(text: string): string | null {
  if (!text.trim()) return 'Typ of plak eerst wat je wilt sturen.'
  if (text.length > BRIDGE_MAX_CONTENT) return `Bridge stuurt hoogstens ${BRIDGE_MAX_CONTENT} tekens.`
  return null
}

export function newTransfer(input: { id: string; deviceId: string; deviceName: string; content: string; now: number; expiryHours: number }): Transfer {
  return {
    id: input.id,
    direction: 'out',
    deviceId: input.deviceId,
    deviceName: input.deviceName,
    type: bridgeType(input.content),
    content: input.content,
    sentAt: input.now,
    expiresAt: input.now + input.expiryHours * 3_600_000,
    status: 'sending',
    updatedAt: input.now,
  }
}

export const toPayload = (t: Transfer, senderName: string): BridgePayload => ({
  v: 1,
  kind: 'bridge',
  transferId: t.id,
  type: t.type,
  content: t.content,
  senderName,
  sentAt: t.sentAt,
  expiresAt: t.expiresAt,
})

export function upsertTransfer(state: BridgeState, t: Transfer, now: number): BridgeState {
  return { ...state, transfers: keep([t, ...state.transfers.filter((x) => !(x.id === t.id && x.direction === t.direction))], now) }
}

export function changeTransfer(state: BridgeState, id: string, direction: Transfer['direction'], patch: Partial<Transfer>, now: number): BridgeState {
  return { ...state, transfers: state.transfers.map((t) => (t.id === id && t.direction === direction ? { ...t, ...patch, updatedAt: now } : t)) }
}

/**
 * An incoming transfer. Returns what to answer the sender: delivered, declined (with why), or
 * nothing when it is a copy of one already here.
 */
export function receiveTransfer(
  state: BridgeState,
  p: BridgePayload,
  from: { id: string; name: string },
  now: number,
  enabled: boolean,
): { state: BridgeState; answer: BridgeStatusPayload | null; added: Transfer | null } {
  if (state.transfers.some((t) => t.id === p.transferId && t.direction === 'in')) return { state, answer: null, added: null }
  const decline = (reason: DeclineReason) => ({ state, added: null, answer: { v: 1 as const, kind: 'bridge_status' as const, transferId: p.transferId, status: 'declined' as const, reason, at: now } })
  if (!enabled) return decline('off')
  if (state.settings.blocked.includes(from.id)) return decline('blocked')
  if (p.expiresAt <= now) return decline('expired')
  const added: Transfer = {
    id: p.transferId,
    direction: 'in',
    deviceId: from.id,
    deviceName: from.name || p.senderName,
    type: p.type,
    content: p.content,
    sentAt: p.sentAt,
    expiresAt: p.expiresAt,
    status: 'delivered',
    updatedAt: now,
  }
  return { state: upsertTransfer(state, added, now), added, answer: { v: 1, kind: 'bridge_status', transferId: p.transferId, status: 'delivered', at: now } }
}

const RANK: Partial<Record<TransferStatus, number>> = { sending: 0, sent: 1, delivered: 2, opened: 3 }

/** A status from the other device. Only moves forward; a cancelled or failed transfer stays so. */
export function applyBridgeStatus(state: BridgeState, s: BridgeStatusPayload, fromDeviceId: string, now: number): BridgeState {
  if (s.status === 'cancel') {
    const t = state.transfers.find((x) => x.id === s.transferId && x.direction === 'in' && x.deviceId === fromDeviceId)
    if (!t || t.status === 'cancelled') return state
    return changeTransfer(state, t.id, 'in', { status: 'cancelled', content: '' }, now)
  }
  const t = state.transfers.find((x) => x.id === s.transferId && x.direction === 'out' && x.deviceId === fromDeviceId)
  if (!t) return state
  if (s.status === 'declined') {
    if (t.status === 'cancelled') return state
    return changeTransfer(state, t.id, 'out', { status: 'declined', ...(s.reason ? { reason: s.reason } : {}) }, now)
  }
  const current = RANK[t.status]
  if (current === undefined || current >= RANK[s.status]!) return state
  return changeTransfer(state, t.id, 'out', { status: s.status }, now)
}

/** Past their expiry: an outgoing one nobody received is expired; an incoming one loses its content. */
export function expireTransfers(state: BridgeState, now: number): BridgeState {
  let changed = false
  const transfers = state.transfers.map((t) => {
    if (t.expiresAt > now) return t
    if (t.direction === 'out' && (t.status === 'sent' || t.status === 'sending')) {
      changed = true
      return { ...t, status: 'expired' as const, updatedAt: now }
    }
    if (t.direction === 'in' && t.content) {
      changed = true
      return { ...t, content: '', status: t.status === 'delivered' ? ('expired' as const) : t.status, updatedAt: now }
    }
    return t
  })
  return changed ? { ...state, transfers: keep(transfers, now) } : state
}

/** Whether the sender can still take a transfer back: only while it waits on the other device. */
export const canCancel = (t: Transfer, now: number) => t.direction === 'out' && t.status === 'sent' && t.expiresAt > now
export const canRetry = (t: Transfer) => t.direction === 'out' && (t.status === 'failed' || t.status === 'expired' || t.status === 'cancelled' || t.status === 'declined') && t.content !== ''

export const STATUS_LABELS: Record<TransferStatus, string> = {
  sending: 'bezig',
  sent: 'verstuurd, wacht op het toestel',
  delivered: 'afgeleverd',
  opened: 'geopend',
  declined: 'geweigerd',
  expired: 'verlopen',
  cancelled: 'geannuleerd',
  failed: 'mislukt',
}

export const REASON_LABELS: Record<DeclineReason, string> = {
  blocked: 'dat toestel laat dit toestel niet toe',
  off: 'Bridge staat uit op dat toestel',
  expired: 'het was al verlopen toen het aankwam',
}
