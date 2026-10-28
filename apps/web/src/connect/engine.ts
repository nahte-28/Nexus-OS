import type { Session, SupabaseClient } from '@supabase/supabase-js'
import {
  decryptWith,
  defaultDeviceName,
  encryptFor,
  exportPublicKey,
  fingerprint,
  generateDeviceKeyPair,
  notificationPopsUp,
  parseAction,
  parsePayload,
  type ActionPayload,
  trimInbox,
  type ConnectPayload,
  type PlanPayload,
  type Device,
  type InboxItem,
} from '@nexus/core'
import { getAll, getValue, update } from '../state/db'
import { isDesktopApp, notifyDesktop } from '../platform/desktop'
import { errorText } from '../sync/engine'
import { ConnectSetupError, type ConnectRemote, type PlannedPush, type PushSubscriptionKeys } from './remote'
import { logEvent } from '../devtools/log'
import { profilesStore } from '../profiles/store'

export type ConnectStatus =
  | 'unconfigured' // no Supabase project: Connect needs an account
  | 'signed-out'
  | 'starting'
  | 'ready'
  | 'revoked' // this device was revoked from another device
  | 'setup-needed' // the v0.4 migration is missing on the server
  | 'error'

export interface DeviceView extends Device {
  fingerprint: string
  isThisDevice: boolean
}

export interface ConnectState {
  status: ConnectStatus
  device: { id: string; name: string; fingerprint: string } | null
  devices: DeviceView[]
  inbox: InboxItem[]
  unread: number
  error: string | null
}

/** This browser's identity. The private key is non-extractable and never leaves IndexedDB. */
interface Identity {
  userId: string
  deviceId: string
  name: string
  publicKey: string
  privateKey: CryptoKey
}

/**
 * The phones NEXUS sends notifications to: the companion app, and NEXUS in Chrome on a phone that
 * allowed web push (it shows them also when NEXUS is closed there).
 */
export function phonesOf(state: ConnectState): DeviceView[] {
  if (state.status !== 'ready') return []
  return state.devices.filter((d) => !d.revokedAt && !d.isThisDevice && (d.platform === 'android' || d.push))
}

/** Push messages may be 4 KB; with encryption and JSON this keeps a notification well within it. */
const MAX_PUSH_TEXT = 300

const IDENTITY_KEY = 'identity'
const MAX_INBOX = 500
const POLL_MS = 60_000

/**
 * Registers this browser as a device, receives end-to-end encrypted notifications from the
 * user's other devices, and keeps them only in this browser's inbox.
 */
export class ConnectEngine {
  private state: ConnectState
  private listeners = new Set<() => void>()
  private session: Session | null = null
  private identity: Identity | null = null
  private cleanups: Array<() => void> = []
  private stopListening: (() => void) | null = null
  private receiving: Promise<void> | null = null
  private again = false

  constructor(
    private client: SupabaseClient | null,
    private remote: ConnectRemote | null,
    private notify: (item: InboxItem) => void = showSystemNotification,
    /** Something done on another device, e.g. a deadline ticked off on the watch. */
    private onAction: (action: ActionPayload) => void | Promise<void> = () => undefined,
  ) {
    this.state = {
      status: client && remote ? 'signed-out' : 'unconfigured',
      device: null,
      devices: [],
      inbox: [],
      unread: 0,
      error: null,
    }
  }

  start(): () => void {
    void this.loadInbox()
    const { client } = this
    if (!client || !this.remote) return () => this.stop()

    void client.auth.getSession().then(({ data }) => this.setSession(data.session))
    const { data } = client.auth.onAuthStateChange((_event, session) => this.setSession(session))
    this.cleanups.push(() => data.subscription.unsubscribe())

    const refresh = () => {
      if (this.state.status !== 'ready') return
      void this.receive()
      void this.refreshDevices()
    }
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', onVisible)
    const poll = setInterval(refresh, POLL_MS)
    this.cleanups.push(() => {
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(poll)
    })
    return () => this.stop()
  }

  private stop(): void {
    this.stopListening?.()
    this.stopListening = null
    for (const c of this.cleanups.splice(0)) c()
  }

  private setSession(session: Session | null): void {
    const previous = this.session?.user.id
    this.session = session
    if (!session) {
      this.stopListening?.()
      this.stopListening = null
      this.identity = null
      if (this.client) this.set({ status: 'signed-out', device: null, devices: [] })
      return
    }
    if (session.user.id !== previous) void this.connect()
  }

  /** Makes sure this browser is a registered, active device, then starts receiving. */
  private async connect(): Promise<void> {
    const remote = this.remote!
    const userId = this.session!.user.id
    this.set({ status: 'starting', error: null })
    try {
      let identity = await getValue<Identity>('connect', IDENTITY_KEY)
      if (identity && identity.userId !== userId) identity = undefined
      const devices = await remote.listDevices()
      const own = identity && devices.find((d) => d.id === identity!.deviceId)
      if (own?.revokedAt) {
        this.identity = null
        await this.showDevices(devices, null)
        this.set({ status: 'revoked', device: null })
        return
      }
      if (!identity) identity = await this.createIdentity(userId)
      if (!own) {
        await remote.registerDevice({ id: identity.deviceId, name: identity.name, platform: isDesktopApp ? 'desktop' : 'web', publicKey: identity.publicKey })
      } else {
        await remote.updateDevice(identity.deviceId, { seen: true })
      }
      this.identity = identity
      this.set({
        status: 'ready',
        device: { id: identity.deviceId, name: own?.name ?? identity.name, fingerprint: await fingerprint(identity.publicKey) },
      })
      this.stopListening?.()
      this.stopListening = remote.listen(identity.deviceId, () => void this.receive())
      await Promise.all([this.refreshDevices(), this.receive()])
    } catch (err) {
      this.fail(err)
    }
  }

  private async createIdentity(userId: string): Promise<Identity> {
    const pair = await generateDeviceKeyPair()
    const identity: Identity = {
      userId,
      deviceId: crypto.randomUUID(),
      name: isDesktopApp ? 'NEXUS voor Windows' : defaultDeviceName(navigator.userAgent),
      publicKey: await exportPublicKey(pair.publicKey),
      privateKey: pair.privateKey,
    }
    await update('connect', { put: [identity], key: IDENTITY_KEY })
    return identity
  }

  /** After a revocation the user can register this browser again, with a new key. */
  async reconnect(): Promise<void> {
    await update('connect', { remove: [IDENTITY_KEY] })
    await this.connect()
  }

  private fail(err: unknown): void {
    if (err instanceof ConnectSetupError) {
      this.set({ status: 'setup-needed', error: null })
      return
    }
    this.set({ status: 'error', error: errorText(err) })
  }

  async refreshDevices(): Promise<void> {
    if (!this.remote || !this.session) return
    try {
      const devices = await this.remote.listDevices()
      const own = this.identity && devices.find((d) => d.id === this.identity!.deviceId)
      if (this.identity && own?.revokedAt) {
        this.identity = null
        this.stopListening?.()
        this.stopListening = null
        this.set({ status: 'revoked', device: null })
      }
      await this.showDevices(devices, this.identity?.deviceId ?? null)
      if (own && this.state.device && own.name !== this.state.device.name) {
        this.set({ device: { ...this.state.device, name: own.name } })
      }
    } catch (err) {
      this.fail(err)
    }
  }

  private async showDevices(devices: Device[], ownId: string | null): Promise<void> {
    const views = await Promise.all(
      devices.map(async (d) => ({ ...d, fingerprint: await fingerprint(d.publicKey), isThisDevice: d.id === ownId })),
    )
    this.set({ devices: views })
  }

  /** Fetches, decrypts and stores everything waiting for this device, then removes it from the server. */
  receive(): Promise<void> {
    if (this.receiving) {
      this.again = true
      return this.receiving
    }
    this.receiving = this.receiveOnce().finally(() => {
      this.receiving = null
      if (this.again) {
        this.again = false
        void this.receive()
      }
    })
    return this.receiving
  }

  private async receiveOnce(): Promise<void> {
    const identity = this.identity
    if (!identity || !this.remote) return
    try {
      const messages = await this.remote.fetchMessages(identity.deviceId)
      if (messages.length === 0) return
      const items: InboxItem[] = []
      const actions: ActionPayload[] = []
      for (const m of messages) {
        try {
          const plaintext = await decryptWith(identity.privateKey, identity.publicKey, identity.deviceId, m)
          const json: unknown = JSON.parse(plaintext)
          const action = parseAction(json)
          if (action) {
            actions.push(action)
            continue
          }
          const payload = parsePayload(json)
          if (payload) {
            items.push({ ...payload, id: m.id, fromDeviceId: m.senderDeviceId, receivedAt: Date.now(), read: false })
          }
        } catch {
          // Not decryptable for this key (e.g. sent to an older key): it can never be read, so drop it.
        }
      }
      await this.addToInbox(items)
      for (const action of actions) {
        try {
          await this.onAction(action)
        } catch (err) {
          logEvent('connect', `Actie van een ander apparaat mislukt: ${err instanceof Error ? err.message : err}`, true)
        }
      }
      await this.remote.deleteMessages(messages.map((m) => m.id))
      logEvent('connect', `${items.length} melding(en) ontvangen, ${messages.length - items.length} onleesbaar`)
      // With web push on, the service worker already shows notifications that carry a ref.
      const pushHere = this.state.devices.some((d) => d.isThisDevice && d.push)
      for (const item of items) if (!(pushHere && item.ref)) this.notify(item)
    } catch (err) {
      this.fail(err)
    }
  }

  private async loadInbox(): Promise<void> {
    const stored = await getAll<InboxItem>('inbox')
    this.setInbox(trimInbox([...stored, ...this.state.inbox.filter((i) => !stored.some((s) => s.id === i.id))], MAX_INBOX))
  }

  private async addToInbox(items: InboxItem[]): Promise<void> {
    if (items.length === 0) return
    const known = new Set(this.state.inbox.map((i) => i.id))
    const fresh = items.filter((i) => !known.has(i.id))
    const next = trimInbox([...fresh, ...this.state.inbox], MAX_INBOX)
    const kept = new Set(next.map((i) => i.id))
    await update('inbox', { put: fresh.filter((i) => kept.has(i.id)), remove: this.state.inbox.filter((i) => !kept.has(i.id)).map((i) => i.id) })
    this.setInbox(next)
  }

  private setInbox(inbox: InboxItem[]): void {
    this.set({ inbox, unread: inbox.filter((i) => !i.read).length })
  }

  async markAllRead(): Promise<void> {
    const changed = this.state.inbox.filter((i) => !i.read).map((i) => ({ ...i, read: true }))
    if (changed.length === 0) return
    await update('inbox', { put: changed })
    this.setInbox(this.state.inbox.map((i) => (i.read ? i : { ...i, read: true })))
  }

  async removeFromInbox(ids: string[]): Promise<void> {
    await update('inbox', { remove: ids })
    const gone = new Set(ids)
    this.setInbox(this.state.inbox.filter((i) => !gone.has(i.id)))
  }

  /** Sends an encrypted test notification to one of the user's devices (this one included). */
  async sendTest(deviceId: string): Promise<void> {
    const identity = this.requireIdentity()
    const title = `Testmelding van ${this.state.device?.name ?? identity.name}`
    const text = 'Als je dit leest, werkt NEXUS Connect. De inhoud was onderweg versleuteld.'
    const ref = `test:${crypto.randomUUID()}`
    await this.deliver(deviceId, { kind: 'test', title, text, ref })
    await this.pushNow(deviceId, title, text, ref)
  }

  /** Sends a NEXUS notification, e.g. to the phone, which shows it there and on the watch. */
  async sendNotification(deviceId: string, title: string, text?: string, ref?: string): Promise<void> {
    const cleanTitle = title.trim().slice(0, 120)
    const cleanText = text?.trim().slice(0, 1000) || undefined
    if (!cleanTitle) throw new Error('Geef de melding een titel.')
    await this.deliver(deviceId, { kind: 'notification', title: cleanTitle, text: cleanText, ...(ref ? { ref } : {}) })
  }

  /** Sends the phone its safety net: the notifications it should show itself if NEXUS cannot. */
  async sendPlan(deviceId: string, items: PlanPayload['items']): Promise<void> {
    await this.send(deviceId, { v: 1, kind: 'plan', items, sentAt: Date.now() })
  }

  /**
   * Sends a notification to every phone: through Connect, and for a phone with web push also as a
   * push, so it appears there when NEXUS is closed. A push that was planned already (same ref) is not
   * sent twice.
   */
  async notifyPhones(title: string, text?: string, ref?: string): Promise<void> {
    const phones = phonesOf(this.state)
    if (this.state.status !== 'ready') throw new Error('NEXUS Connect is niet verbonden, dus de gsm kreeg ze niet.')
    if (phones.length === 0) throw new Error('Geen gsm gekoppeld.')
    await Promise.all(phones.map((p) => this.sendToPhone(p.id, title, text, ref)))
  }

  /** One phone: through Connect and, when it has web push, as a push too. */
  async sendToPhone(deviceId: string, title: string, text?: string, ref?: string): Promise<void> {
    const pushed = this.state.devices.some((d) => d.id === deviceId && d.push)
    const sharedRef = ref ?? (pushed ? `live:${crypto.randomUUID()}` : undefined)
    await this.sendNotification(deviceId, title, text, sharedRef)
    if (sharedRef) await this.pushNow(deviceId, title.trim(), text?.trim(), sharedRef)
  }

  /** A push for right now (the database sends it within a minute); only for a phone with web push. */
  private async pushNow(deviceId: string, title: string, text: string | undefined, ref: string): Promise<void> {
    if (!this.state.devices.some((d) => d.id === deviceId && d.push && !d.isThisDevice) || !this.remote?.addPushes) return
    await this.remote.addPushes([await this.pushFor(deviceId, { ref, at: Date.now(), title, ...(text ? { text } : {}) })])
  }

  /** Plans the coming days' notifications for a phone with web push; the database sends each one when due. */
  async sendPushPlan(deviceId: string, items: PlanPayload['items']): Promise<void> {
    const identity = this.requireIdentity()
    if (!this.remote!.replacePushPlan) throw new Error('Web-push wordt hier niet ondersteund.')
    const pushes = await Promise.all(items.map((item) => this.pushFor(deviceId, item)))
    await this.remote!.replacePushPlan(identity.deviceId, deviceId, pushes)
    const name = this.state.devices.find((d) => d.id === deviceId)?.name ?? deviceId
    logEvent('connect', `${pushes.length} meldingen versleuteld gepland voor ${name} (web-push)`)
  }

  private async pushFor(deviceId: string, item: PlanPayload['items'][number]): Promise<PlannedPush> {
    const identity = this.requireIdentity()
    const target = this.state.devices.find((d) => d.id === deviceId && !d.revokedAt)
    if (!target) throw new Error('Dit apparaat is niet meer actief.')
    const text = item.text?.trim().slice(0, MAX_PUSH_TEXT) || undefined
    const payload: ConnectPayload = {
      v: 1,
      app: 'nexus',
      appName: 'NEXUS',
      kind: 'notification',
      title: item.title.trim().slice(0, 120) || 'Herinnering',
      ...(text ? { text } : {}),
      postedAt: item.at,
      ref: item.ref,
    }
    const envelope = await encryptFor(target.publicKey, target.id, JSON.stringify(payload))
    return { ...envelope, senderDeviceId: identity.deviceId, recipientDeviceId: target.id, ref: item.ref, at: item.at }
  }

  /** Lets this browser be woken by web push (the subscription comes from the service worker). */
  async enablePush(keys: PushSubscriptionKeys): Promise<void> {
    const identity = this.requireIdentity()
    if (!this.remote!.savePushSubscription) throw new Error('Web-push wordt hier niet ondersteund.')
    await this.remote!.savePushSubscription(identity.deviceId, keys)
    await this.refreshDevices()
  }

  async disablePush(): Promise<void> {
    const identity = this.requireIdentity()
    await this.remote!.removePushSubscription?.(identity.deviceId)
    await this.refreshDevices()
  }

  private async deliver(deviceId: string, content: Pick<ConnectPayload, 'kind' | 'title' | 'text' | 'ref'>): Promise<void> {
    await this.send(deviceId, { v: 1, app: 'nexus', appName: 'NEXUS', postedAt: Date.now(), ...content })
  }

  private async send(deviceId: string, payload: ConnectPayload | PlanPayload): Promise<void> {
    const identity = this.requireIdentity()
    const target = this.state.devices.find((d) => d.id === deviceId && !d.revokedAt)
    if (!target) throw new Error('Dit apparaat is niet meer actief.')
    const envelope = await encryptFor(target.publicKey, target.id, JSON.stringify(payload))
    await this.remote!.sendMessages([{ ...envelope, senderDeviceId: identity.deviceId, recipientDeviceId: target.id }])
    logEvent('connect', payload.kind === 'plan' ? `Vangnet (${payload.items.length} meldingen) versleuteld verstuurd naar ${target.name}` : `Melding (${payload.kind}) versleuteld verstuurd naar ${target.name}`)
  }

  async rename(deviceId: string, name: string): Promise<void> {
    const trimmed = name.trim().slice(0, 80)
    if (!trimmed) return
    await this.remote!.updateDevice(deviceId, { name: trimmed })
    await this.refreshDevices()
  }

  async revoke(deviceId: string): Promise<void> {
    await this.remote!.updateDevice(deviceId, { revoked: true })
    await this.refreshDevices()
  }

  /** Called just before signing out: this browser stops being a device of the account. */
  async leave(): Promise<void> {
    const identity = this.identity
    if (identity && this.remote) {
      try {
        await this.remote.removePushSubscription?.(identity.deviceId)
        await this.remote.updateDevice(identity.deviceId, { revoked: true })
      } catch {
        // Offline: the device stays listed and can be revoked from another device.
      }
    }
    this.identity = null
    this.stopListening?.()
    this.stopListening = null
    this.setInbox([])
  }

  private requireIdentity(): Identity {
    if (!this.identity || !this.remote) throw new Error('Dit apparaat is nog niet gekoppeld.')
    return this.identity
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): ConnectState => this.state

  private set(patch: Partial<ConnectState>): void {
    if (patch.status && patch.status !== this.state.status) {
      logEvent('connect', `Status: ${patch.status}${patch.error ? ` (${patch.error})` : ''}`, patch.status === 'error')
    }
    this.state = { ...this.state, ...patch }
    for (const l of this.listeners) l()
  }
}

/** Shows a system notification when the tab is in the background and the user allowed it. */
export function showSystemNotification(item: InboxItem): void {
  // A quiet profile (School, Gaming) keeps phone notifications in Meldingen without popping up,
  // except for the apps it lets through.
  if (!notificationPopsUp(profilesStore.getSnapshot().active, item.appName)) return
  if (isDesktopApp) {
    // In the Windows app NEXUS often sits in the tray: notify whenever the window is not in front.
    if (!document.hasFocus()) void notifyDesktop(item.appName, [item.title, item.text].filter(Boolean).join('\n'))
    return
  }
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible') return
  const options: NotificationOptions = { body: [item.title, item.text].filter(Boolean).join('\n'), tag: item.id, icon: '/icon-192.png' }
  // Android Chrome only allows notifications through the service worker.
  void navigator.serviceWorker?.getRegistration().then((reg) => {
    if (reg) return reg.showNotification(item.appName, options)
    new Notification(item.appName, options)
  })
}
