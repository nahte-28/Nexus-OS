/**
 * NEXUS Bridge (blueprint fase 4): text and links to one of your own devices. Everything travels
 * as an end-to-end encrypted NEXUS Connect message, so the server never sees the content. Each
 * device keeps its own list of transfers. Pure logic; the web app sends and receives.
 */

export type BridgeType = 'text' | 'link' | 'file' | 'resume'

/**
 * Bridge 2.0: a file travels encrypted through your own private storage. The key only travels
 * inside the end-to-end encrypted Connect message, so storage and server see only ciphertext.
 */
export interface BridgeFile {
  name: string
  size: number
  mediaType: string
  /** Where the ciphertext waits in your private storage. */
  path: string
  /** AES-GCM key and nonce, base64. Removed here once the transfer is over. */
  key: string
  iv: string
}

/** Bridge 2.0: pick up on the other device where you were, e.g. the same note. */
export interface BridgeResume {
  app: string
  id?: string
  /** What it is, e.g. "Notitie Wiskunde". */
  title: string
}

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
  /** Bridge 2.0: text that came from the clipboard of the sender. */
  clip?: boolean
  file?: BridgeFile
  resume?: BridgeResume
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
  clip?: boolean
  file?: BridgeFile
  resume?: BridgeResume
}

export interface BridgeSettings {
  /** Devices that may not send to this one. */
  blocked: string[]
  /** How long a transfer stays available, in hours. */
  expiryHours: number
  /** Bridge 2.0: text from another clipboard goes straight to this clipboard when it can. */
  autoClipboard: boolean
}

export interface BridgeState {
  transfers: Transfer[]
  settings: BridgeSettings
}

export const BRIDGE_MAX_CONTENT = 4000
export const BRIDGE_EXPIRY_CHOICES = [1, 24, 168]
export const BRIDGE_MAX_TRANSFERS = 100
export const BRIDGE_KEEP_MS = 30 * 86_400_000

/** The private storage bucket takes 10 MB per object; the ciphertext is 16 bytes longer. */
export const BRIDGE_MAX_FILE = 10 * 1024 * 1024 - 1024

export const emptyBridge = (): BridgeState => ({ transfers: [], settings: { blocked: [], expiryHours: 24, autoClipboard: false } })

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

const B64 = /^[A-Za-z0-9+/]+={0,2}$/

/** [stored]: from this device's own list, where a finished transfer has no key any more. */
function parseFile(v: unknown, stored = false): BridgeFile | null {
  if (!isObject(v)) return null
  const { name, size, mediaType, path, key, iv } = v
  if (typeof name !== 'string' || !name.trim() || !isNum(size) || size < 0 || size > BRIDGE_MAX_FILE) return null
  // Only a path inside someone's own bridge folder; the storage rules decide whose.
  if (typeof path !== 'string' || !/^[0-9a-f-]{36}\/bridge\/[A-Za-z0-9_-]{1,100}\.bin$/.test(path)) return null
  const okKey = (x: unknown, max: number) => typeof x === 'string' && x.length <= max && (B64.test(x) || (stored && x === ''))
  if (!okKey(key, 64) || !okKey(iv, 32)) return null
  return { name: name.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 200), size, mediaType: typeof mediaType === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(mediaType) ? mediaType : 'application/octet-stream', path, key: key as string, iv: iv as string }
}

function parseResume(v: unknown): BridgeResume | null {
  if (!isObject(v) || typeof v.app !== 'string' || !/^[a-z]{2,20}$/.test(v.app) || typeof v.title !== 'string' || !v.title.trim()) return null
  return { app: v.app, ...(typeof v.id === 'string' && v.id && v.id.length <= 100 ? { id: v.id } : {}), title: v.title.slice(0, 120) }
}

/** The size of a file for people: 900 B, 12 kB, 3,4 MB. */
export function fileSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} kB`
  return `${(bytes / 1_000_000).toFixed(1).replace('.', ',')} MB`
}

/** Checks a file before it goes; a Dutch message when it cannot. */
export function checkFile(file: { name: string; size: number }): string | null {
  if (!file.name.trim()) return 'Dit bestand heeft geen naam.'
  if (file.size === 0) return 'Dit bestand is leeg.'
  if (file.size > BRIDGE_MAX_FILE) return `Bridge stuurt bestanden tot 10 MB; dit is ${fileSize(file.size)}.`
  return null
}

/** One line for a list or a notification. */
export function transferTitle(t: Pick<Transfer, 'type' | 'clip' | 'file' | 'resume' | 'content'>): string {
  if (t.type === 'file') return `Bestand ${t.file?.name ?? t.content}`
  if (t.type === 'resume') return `Verdergaan: ${t.resume?.title ?? t.content}`
  if (t.clip) return 'Klembord'
  return t.type === 'link' ? 'Link' : 'Tekst'
}

/** A received Connect message, when it is one for Bridge. Anything malformed is dropped. */
export function parseBridge(value: unknown): BridgeMessage | null {
  if (!isObject(value) || value.v !== 1 || typeof value.transferId !== 'string' || !value.transferId || value.transferId.length > 100) return null
  if (value.kind === 'bridge') {
    if (typeof value.content !== 'string' || !isNum(value.sentAt) || !isNum(value.expiresAt)) return null
    const content = value.content.slice(0, BRIDGE_MAX_CONTENT)
    if (!content.trim()) return null
    const base = { v: 1 as const, kind: 'bridge' as const, transferId: value.transferId, content, senderName: typeof value.senderName === 'string' ? value.senderName.slice(0, 80) : '', sentAt: value.sentAt, expiresAt: value.expiresAt }
    if (value.type === 'file') {
      const file = parseFile(value.file)
      return file ? { ...base, type: 'file', content: file.name, file } : null
    }
    if (value.type === 'resume') {
      const resume = parseResume(value.resume)
      return resume ? { ...base, type: 'resume', content: resume.title, resume } : null
    }
    // The receiver decides what a link is, so a "link" that is not a web address shows as text.
    return { ...base, type: bridgeType(content), ...(value.clip === true ? { clip: true } : {}) }
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
    type: v.type === 'link' || v.type === 'file' || v.type === 'resume' ? v.type : 'text',
    ...(v.clip === true ? { clip: true } : {}),
    ...(v.type === 'file' && parseFile(v.file, true) ? { file: parseFile(v.file, true)! } : {}),
    ...(v.type === 'resume' && parseResume(v.resume) ? { resume: parseResume(v.resume)! } : {}),
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
      autoClipboard: s.autoClipboard === true,
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

export interface TransferExtra {
  clip?: boolean
  file?: BridgeFile
  resume?: BridgeResume
}

export function newTransfer(input: { id: string; deviceId: string; deviceName: string; content: string; now: number; expiryHours: number } & TransferExtra): Transfer {
  const type: BridgeType = input.file ? 'file' : input.resume ? 'resume' : bridgeType(input.content)
  return {
    id: input.id,
    direction: 'out',
    deviceId: input.deviceId,
    deviceName: input.deviceName,
    type,
    ...(input.clip && (type === 'text' || type === 'link') ? { clip: true } : {}),
    ...(input.file ? { file: input.file } : {}),
    ...(input.resume ? { resume: input.resume } : {}),
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
  ...(t.clip ? { clip: true } : {}),
  ...(t.file ? { file: t.file } : {}),
  ...(t.resume ? { resume: t.resume } : {}),
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
    ...(p.clip ? { clip: true } : {}),
    ...(p.file ? { file: p.file } : {}),
    ...(p.resume ? { resume: p.resume } : {}),
  }
  return { state: upsertTransfer(state, added, now), added, answer: { v: 1, kind: 'bridge_status', transferId: p.transferId, status: 'delivered', at: now } }
}

const RANK: Partial<Record<TransferStatus, number>> = { sending: 0, sent: 1, delivered: 2, opened: 3 }

/** A status from the other device. Only moves forward; a cancelled or failed transfer stays so. */
export function applyBridgeStatus(state: BridgeState, s: BridgeStatusPayload, fromDeviceId: string, now: number): BridgeState {
  if (s.status === 'cancel') {
    const t = state.transfers.find((x) => x.id === s.transferId && x.direction === 'in' && x.deviceId === fromDeviceId)
    if (!t || t.status === 'cancelled') return state
    return changeTransfer(state, t.id, 'in', { status: 'cancelled', content: '', ...(t.file ? { file: forget(t.file) } : {}) }, now)
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

/** A file whose transfer is over keeps its name and size, but not the key. */
export const forget = (f: BridgeFile): BridgeFile => ({ ...f, key: '', iv: '' })

/** Past their expiry: an outgoing one nobody received is expired; an incoming one loses its content. */
export function expireTransfers(state: BridgeState, now: number): BridgeState {
  let changed = false
  const transfers = state.transfers.map((t) => {
    if (t.expiresAt > now) return t
    if (t.direction === 'out' && (t.status === 'sent' || t.status === 'sending')) {
      changed = true
      return { ...t, status: 'expired' as const, updatedAt: now }
    }
    if (t.direction === 'in' && (t.content || t.file?.key)) {
      changed = true
      return { ...t, content: '', ...(t.file ? { file: forget(t.file) } : {}), status: t.status === 'delivered' ? ('expired' as const) : t.status, updatedAt: now }
    }
    return t
  })
  return changed ? { ...state, transfers: keep(transfers, now) } : state
}

/** Whether the sender can still take a transfer back: only while it waits on the other device. */
export const canCancel = (t: Transfer, now: number) => t.direction === 'out' && t.status === 'sent' && t.expiresAt > now
export const canRetry = (t: Transfer) => t.direction === 'out' && t.type !== 'file' && (t.status === 'failed' || t.status === 'expired' || t.status === 'cancelled' || t.status === 'declined') && t.content !== ''

/**
 * Outgoing files whose ciphertext can go from storage: the transfer is over (fetched, declined,
 * cancelled, expired or failed). The receiver removes it itself after saving; this is the backup.
 */
export function filesToClean(state: BridgeState, now: number): Transfer[] {
  return state.transfers.filter((t) => t.direction === 'out' && t.file?.key && (t.status === 'opened' || t.status === 'declined' || t.status === 'cancelled' || t.status === 'failed' || t.status === 'expired' || t.expiresAt <= now))
}

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
