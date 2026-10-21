import type { ConnectEngine } from '../connect/engine'
import { logEvent } from '../devtools/log'
import { apiBase, isDesktopApp } from '../platform/desktop'

/**
 * Web push for NEXUS in a browser, meant for a phone without the companion app: the pc plans the
 * coming notifications encrypted for this browser, and the server wakes it when one is due, also
 * when NEXUS is closed. The service worker (public/push-sw.js) opens and shows them.
 */

type Engine = Pick<ConnectEngine, 'getSnapshot' | 'subscribe' | 'enablePush' | 'disablePush'>

export function pushSupported(): boolean {
  return (
    !isDesktopApp &&
    typeof window !== 'undefined' &&
    typeof Notification !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

/** Whether this browser is set up to be woken by push. */
export function pushOnHere(state: ReturnType<Engine['getSnapshot']>): boolean {
  return state.status === 'ready' && state.devices.some((d) => d.isThisDevice && d.push === true)
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function sameBytes(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.length) return false
  const view = new Uint8Array(a)
  return view.every((v, i) => v === b[i])
}

async function serverKey(fetchFn: typeof fetch): Promise<Uint8Array<ArrayBuffer>> {
  let response: Response
  try {
    response = await fetchFn(`${apiBase}/api/push`, { cache: 'no-store' })
  } catch {
    throw new Error('De NEXUS-server is niet bereikbaar. Probeer het opnieuw als je online bent.')
  }
  const body = (await response.json().catch(() => ({}))) as { publicKey?: string; error?: string }
  if (!response.ok || !body.publicKey) throw new Error(body.error ?? 'Web-push is nog niet ingesteld op de server.')
  return fromBase64Url(body.publicKey)
}

/** The browser's subscription for the server's current key; a subscription for an old key is replaced. */
async function subscription(fetchFn: typeof fetch): Promise<PushSubscription> {
  const key = await serverKey(fetchFn)
  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  if (existing && sameBytes(existing.options.applicationServerKey, key)) return existing
  await existing?.unsubscribe()
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
}

function keysOf(sub: PushSubscription) {
  const json = sub.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('Deze browser gaf geen bruikbaar push-adres.')
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth }
}

/** Asks permission and lets this browser be woken by push. */
export async function enableWebPush(engine: Engine, fetchFn: typeof fetch = fetch): Promise<void> {
  if (!pushSupported()) throw new Error('Deze browser kan geen pushmeldingen ontvangen.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Meldingen zijn niet toegestaan. Zet ze aan in de site-instellingen van Chrome en probeer opnieuw.')
  }
  await engine.enablePush(keysOf(await subscription(fetchFn)))
  logEvent('connect', 'Web-push aangezet op dit toestel')
}

export async function disableWebPush(engine: Engine): Promise<void> {
  const registration = await navigator.serviceWorker?.getRegistration()
  await (await registration?.pushManager.getSubscription())?.unsubscribe()
  await engine.disablePush()
  logEvent('connect', 'Web-push uitgezet op dit toestel')
}

/**
 * Once per start: when push is on for this browser, make sure the server has its current address
 * (browsers renew it now and then, and a new server key needs a new subscription).
 */
export function startWebPush(engine: Engine, fetchFn: typeof fetch = fetch): () => void {
  if (!pushSupported()) return () => {}
  let done = false
  const check = () => {
    if (done || !pushOnHere(engine.getSnapshot()) || Notification.permission !== 'granted') return
    done = true
    void subscription(fetchFn)
      .then((sub) => engine.enablePush(keysOf(sub)))
      .catch((err) => logEvent('connect', `Web-push vernieuwen mislukt: ${err instanceof Error ? err.message : err}`, true))
  }
  const unsubscribe = engine.subscribe(check)
  check()
  return unsubscribe
}
