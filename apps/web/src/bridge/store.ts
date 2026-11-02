import { useSyncExternalStore } from 'react'
import {
  applyBridgeStatus,
  changeTransfer,
  checkFile,
  expireTransfers,
  filesToClean,
  forget,
  newTransfer,
  parseBridgeState,
  receiveTransfer,
  toPayload,
  transferTitle,
  upsertTransfer,
  type BridgeMessage,
  type BridgeResume,
  type BridgeSettings,
  type BridgeState,
  type BridgeStatusPayload,
  type Transfer,
  type TransferExtra,
} from '@nexus/core'
import type { BridgeBatch, ConnectState } from '../connect/engine'
import { logEvent } from '../devtools/log'
import { eventBus } from '../events/bus'
import { readStorage, writeStorage } from '../state/storage'
import { bridgePath, bridgeStorage, decryptFile, encryptFile, type BridgeStorage } from './files'

const KEY = 'nexus.bridge'

/** Bridge on this device: its own transfers (sent and received) and who may send to it. Never synced. */
export class BridgeStore {
  private state: BridgeState
  private listeners = new Set<() => void>()

  constructor(private persist = true) {
    let raw: unknown = null
    try {
      raw = persist ? JSON.parse(readStorage(KEY) ?? 'null') : null
    } catch {
      raw = null
    }
    this.state = parseBridgeState(raw)
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): BridgeState => this.state

  update(change: (s: BridgeState) => BridgeState): void {
    const next = change(this.state)
    if (next === this.state) return
    this.state = next
    if (this.persist) writeStorage(KEY, JSON.stringify(next))
    this.listeners.forEach((l) => l())
  }

  setSettings(patch: Partial<BridgeSettings>): void {
    this.update((s) => ({ ...s, settings: { ...s.settings, ...patch } }))
  }

  /** Lets [deviceId] send to this device again, or not. */
  setBlocked(deviceId: string, blocked: boolean): void {
    this.update((s) => ({ ...s, settings: { ...s.settings, blocked: blocked ? [...new Set([...s.settings.blocked, deviceId])] : s.settings.blocked.filter((d) => d !== deviceId) } }))
  }
}

export const bridgeStore = new BridgeStore(typeof window !== 'undefined')

export function useBridge(): BridgeState {
  return useSyncExternalStore(bridgeStore.subscribe, bridgeStore.getSnapshot)
}

/** The part of the Connect engine Bridge uses, so tests can pass a fake. */
export interface BridgeLink {
  getSnapshot(): ConnectState
  sendBridge(deviceId: string, message: BridgeMessage): Promise<void>
  pushNotice(deviceId: string, title: string, text: string | undefined, ref: string): Promise<void>
}

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `br-${Date.now()}-${Math.random().toString(36).slice(2)}`)
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

/**
 * The devices Bridge can send to: your other active devices. NEXUS in a browser or the Windows app
 * keeps the transfer in its list; the companion app and the watch show it as a notification.
 */
export function bridgeTargets(state: ConnectState) {
  if (state.status !== 'ready') return []
  return state.devices.filter((d) => !d.revokedAt && !d.isThisDevice)
}

/**
 * Files and "verdergaan" only go to NEXUS itself (browser or Windows app): the companion app and
 * the watch show a transfer as a notification and cannot save a file or open an app.
 */
export function richTargets(state: ConnectState) {
  return bridgeTargets(state).filter((d) => d.platform !== 'android')
}

const preview = (t: Transfer) => (t.content.length > 120 ? `${t.content.slice(0, 119)}…` : t.content)

async function sendOne(link: BridgeLink, t: Transfer, senderName: string, store: BridgeStore, now: number): Promise<void> {
  try {
    await link.sendBridge(t.deviceId, toPayload(t, senderName))
    store.update((s) => changeTransfer(s, t.id, 'out', { status: 'sent', error: undefined }, now))
  } catch (err) {
    store.update((s) => changeTransfer(s, t.id, 'out', { status: 'failed', error: errorText(err) }, now))
    return
  }
  // A phone with web push also gets a notification, so it sees the transfer with NEXUS closed.
  try {
    await link.pushNotice(t.deviceId, `${transferTitle(t)} van ${senderName}`, t.type === 'file' || t.type === 'resume' ? 'Open NEXUS Bridge.' : preview(t), `bridge:${t.id}`)
  } catch (err) {
    logEvent('connect', `Bridge-melding als push mislukt: ${errorText(err)}`)
  }
}

/** Sends [content] to each of [deviceIds]; one transfer per device, each with its own status. */
export async function sendTransfer(
  link: BridgeLink,
  deviceIds: string[],
  content: string,
  { store = bridgeStore, now = Date.now(), extra = {} }: { store?: BridgeStore; now?: number; extra?: Pick<TransferExtra, 'clip' | 'resume'> } = {},
): Promise<Transfer[]> {
  const state = link.getSnapshot()
  const senderName = state.device?.name ?? 'NEXUS'
  const targets = (extra.resume ? richTargets(state) : bridgeTargets(state)).filter((d) => deviceIds.includes(d.id))
  if (targets.length === 0) throw new Error('Kies een toestel om naar te sturen.')
  const transfers = targets.map((d) => newTransfer({ id: newId(), deviceId: d.id, deviceName: d.name, content, now, expiryHours: store.getSnapshot().settings.expiryHours, ...extra }))
  store.update((s) => transfers.reduce((acc, t) => upsertTransfer(acc, t, now), s))
  await Promise.all(transfers.map((t) => sendOne(link, t, senderName, store, now)))
  return transfers.map((t) => store.getSnapshot().transfers.find((x) => x.id === t.id && x.direction === 'out') ?? t)
}

/** Sends a failed, expired, cancelled or declined transfer again, as a new transfer to the same device. */
export async function retryTransfer(link: BridgeLink, t: Transfer, opts: { store?: BridgeStore; now?: number } = {}): Promise<Transfer[]> {
  return sendTransfer(link, [t.deviceId], t.content, { ...opts, extra: { ...(t.clip ? { clip: true } : {}), ...(t.resume ? { resume: t.resume } : {}) } })
}

/** Bridge 2.0: asks the other device to open the same app or item, e.g. the note you were writing. */
export function sendResume(link: BridgeLink, deviceIds: string[], resume: BridgeResume, opts: { store?: BridgeStore; now?: number } = {}): Promise<Transfer[]> {
  return sendTransfer(link, deviceIds, resume.title, { ...opts, extra: { resume } })
}

/**
 * Bridge 2.0: sends a file. It is encrypted here and its ciphertext goes to your private storage,
 * once per device; the key goes along in the encrypted Connect message.
 */
export async function sendFile(
  link: BridgeLink,
  deviceIds: string[],
  file: Blob & { name: string },
  { store = bridgeStore, now = Date.now(), storage = bridgeStorage }: { store?: BridgeStore; now?: number; storage?: BridgeStorage } = {},
): Promise<Transfer[]> {
  const problem = checkFile(file)
  if (problem) throw new Error(problem)
  const state = link.getSnapshot()
  const senderName = state.device?.name ?? 'NEXUS'
  const targets = richTargets(state).filter((d) => deviceIds.includes(d.id))
  if (targets.length === 0) throw new Error('Kies een toestel met NEXUS om naar te sturen.')
  const userId = await storage.userId()
  if (!userId) throw new Error('Bestanden sturen werkt met een account. Meld je aan in Account.')
  const data = await file.arrayBuffer()
  const out: Transfer[] = []
  for (const d of targets) {
    const id = newId()
    const sealed = await encryptFile(data)
    const meta = { name: file.name, size: file.size, mediaType: file.type || 'application/octet-stream', path: bridgePath(userId, id), key: sealed.key, iv: sealed.iv }
    const t = newTransfer({ id, deviceId: d.id, deviceName: d.name, content: file.name, now, expiryHours: store.getSnapshot().settings.expiryHours, file: meta })
    store.update((s) => upsertTransfer(s, t, now))
    try {
      await storage.upload(meta.path, sealed.cipher)
    } catch (err) {
      store.update((s) => changeTransfer(s, id, 'out', { status: 'failed', error: errorText(err), file: forget(meta) }, now))
      out.push(store.getSnapshot().transfers.find((x) => x.id === id && x.direction === 'out') ?? t)
      continue
    }
    await sendOne(link, t, senderName, store, now)
    out.push(store.getSnapshot().transfers.find((x) => x.id === id && x.direction === 'out') ?? t)
  }
  return out
}

/**
 * Fetches and decrypts a received file. The ciphertext leaves your storage right away and the key
 * is forgotten here, so it can be saved once; the sender sees "geopend".
 */
export async function receiveFile(link: BridgeLink, t: Transfer, { store = bridgeStore, now = Date.now(), storage = bridgeStorage }: { store?: BridgeStore; now?: number; storage?: BridgeStorage } = {}): Promise<Blob> {
  if (t.direction !== 'in' || !t.file?.key) throw new Error('Dit bestand is er niet meer.')
  const cipher = await storage.download(t.file.path)
  const plain = await decryptFile(await cipher.arrayBuffer(), t.file.key, t.file.iv)
  try {
    await storage.remove(t.file.path)
  } catch (err) {
    logEvent('connect', `Bridge: bestand uit de opslag halen mislukt: ${errorText(err)}`)
  }
  store.update((s) => changeTransfer(s, t.id, 'in', { file: forget(t.file!) }, now))
  await markOpened(link, t, { store, now })
  return new Blob([plain], { type: t.file.mediaType })
}

/** Takes a transfer back while the other device has not fetched it yet. */
export async function cancelTransfer(link: BridgeLink, t: Transfer, { store = bridgeStore, now = Date.now() } = {}): Promise<void> {
  await link.sendBridge(t.deviceId, { v: 1, kind: 'bridge_status', transferId: t.id, status: 'cancel', at: now })
  store.update((s) => changeTransfer(s, t.id, 'out', { status: 'cancelled' }, now))
}

/** Opened or copied here: the sender sees "geopend". Nothing is sent twice. */
export async function markOpened(link: BridgeLink, t: Transfer, { store = bridgeStore, now = Date.now() } = {}): Promise<void> {
  if (t.direction !== 'in' || t.status !== 'delivered') return
  store.update((s) => changeTransfer(s, t.id, 'in', { status: 'opened' }, now))
  try {
    await link.sendBridge(t.deviceId, { v: 1, kind: 'bridge_status', transferId: t.id, status: 'opened', at: now })
  } catch (err) {
    logEvent('connect', `Bridge: "geopend" terugmelden mislukt: ${errorText(err)}`)
  }
}

/**
 * Handles what Connect received for Bridge: new transfers (answered with delivered or declined)
 * and status changes. A cancel in the same batch as its transfer wins.
 */
export async function receiveBatch(
  link: BridgeLink,
  batch: BridgeBatch,
  {
    store = bridgeStore,
    now = Date.now(),
    enabled = true,
    notify = (_t: Transfer) => {},
    clipboard,
  }: { store?: BridgeStore; now?: number; enabled?: boolean; notify?: (t: Transfer) => void; clipboard?: (text: string) => Promise<boolean> } = {},
): Promise<void> {
  const names = new Map(link.getSnapshot().devices.map((d) => [d.id, d.name]))
  const answers: Array<{ to: string; answer: BridgeStatusPayload }> = []
  const added: Transfer[] = []
  for (const { from, message } of batch) {
    if (message.kind !== 'bridge') continue
    let result: ReturnType<typeof receiveTransfer> | null = null
    store.update((s) => {
      result = receiveTransfer(s, message, { id: from, name: names.get(from) ?? '' }, now, enabled)
      return result.state
    })
    const r = result as ReturnType<typeof receiveTransfer> | null
    if (r?.added) added.push(r.added)
    if (r?.answer) answers.push({ to: from, answer: r.answer })
  }
  for (const { from, message } of batch) if (message.kind === 'bridge_status') store.update((s) => applyBridgeStatus(s, message, from, now))
  const cancelled = new Set(store.getSnapshot().transfers.filter((t) => t.direction === 'in' && t.status === 'cancelled').map((t) => t.id))
  for (const { to, answer } of answers) {
    if (cancelled.has(answer.transferId)) continue
    try {
      await link.sendBridge(to, answer)
    } catch (err) {
      logEvent('connect', `Bridge: antwoord aan de afzender mislukt: ${errorText(err)}`)
    }
  }
  for (const t of added) {
    if (cancelled.has(t.id)) continue
    eventBus.publish({
      id: `bridge:${t.id}`,
      source: 'bridge',
      type: 'bridge.received',
      at: now,
      title: `${transferTitle(t)} van ${t.deviceName || 'een ander toestel'}`,
      body: t.type === 'file' ? 'Open Bridge om het op te slaan.' : preview(t),
      link: { app: 'bridge', id: t.id },
    })
    notify(t)
    // Bridge 2.0: clipboard text goes straight to this clipboard when that is switched on and allowed.
    if (t.clip && clipboard && store.getSnapshot().settings.autoClipboard && (await clipboard(t.content).catch(() => false))) await markOpened(link, t, { store, now })
  }
}

/** Writes to the clipboard of this device; false when the browser does not allow it right now. */
export async function writeClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText || (typeof document !== 'undefined' && !document.hasFocus())) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Removes ciphertext of outgoing files whose transfer is over (the receiver normally did it already). */
export async function cleanFiles({ store = bridgeStore, now = Date.now(), storage = bridgeStorage }: { store?: BridgeStore; now?: number; storage?: BridgeStorage } = {}): Promise<number> {
  let done = 0
  for (const t of filesToClean(store.getSnapshot(), now)) {
    try {
      await storage.remove(t.file!.path)
    } catch (err) {
      // Already gone (the receiver took it) counts as done; anything else is tried next time.
      if (!/niet meer in de opslag/.test(errorText(err))) continue
    }
    store.update((s) => changeTransfer(s, t.id, 'out', { file: forget(t.file!) }, now))
    done++
  }
  return done
}

/** Lets Bridge receive through Connect, and expires transfers now and then. */
export function startBridge(
  link: BridgeLink & { setBridgeHandler(handler: ((batch: BridgeBatch) => Promise<void>) | null): void },
  enabled: () => boolean,
  notify: (t: Transfer) => void,
): () => void {
  link.setBridgeHandler((batch) => receiveBatch(link, batch, { enabled: enabled(), notify, clipboard: writeClipboard }))
  const tick = () => {
    bridgeStore.update((s) => expireTransfers(s, Date.now()))
    if (filesToClean(bridgeStore.getSnapshot(), Date.now()).length > 0) void cleanFiles().catch(() => {})
  }
  tick()
  const timer = setInterval(tick, 60_000)
  return () => {
    clearInterval(timer)
    link.setBridgeHandler(null)
  }
}
