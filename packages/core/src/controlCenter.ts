/**
 * Control Center: one panel with how NEXUS is doing right now (status cards), quick switches and
 * your favourite apps. Pure logic: the web app gathers the state and draws the cards.
 */
import type { AppId } from './windows'

export type CardTone = 'ok' | 'warn' | 'error' | 'off'

export interface StatusCard {
  id: string
  title: string
  value: string
  detail: string
  tone: CardTone
  /** The app that opens when you pick the card. */
  app: AppId
}

/** Everything the cards need, taken from the stores of the web app. */
export interface ControlInput {
  now: number
  online: boolean
  sync: { status: 'unconfigured' | 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error'; pending: number; lastSyncedAt: number | null; error: string | null }
  connect: { status: string; devices: number; unread: number }
  profile: { name: string; scheduled: boolean }
  flows: { enabled: boolean; paused: boolean; quiet: boolean; active: number; failedToday: number }
  inbox: { unread: number } | null
  deadlines: { overdue: number; today: number }
  focus: { endsAt: number | null; phase: string }
  update: { status: string; version?: string }
}

const plural = (n: number, one: string, more: string) => `${n} ${n === 1 ? one : more}`
const minutesAgo = (now: number, at: number) => {
  const m = Math.max(0, Math.round((now - at) / 60_000))
  return m < 1 ? 'net' : m < 60 ? `${m} min geleden` : `${Math.round(m / 60)} uur geleden`
}

function syncCard({ sync, online, now }: ControlInput): StatusCard {
  const base = { id: 'sync', title: 'Sync', app: 'account' as AppId }
  if (sync.status === 'unconfigured') return { ...base, value: 'Alleen dit apparaat', detail: 'Deze versie heeft geen account.', tone: 'off' }
  if (sync.status === 'signed-out') return { ...base, value: 'Afgemeld', detail: 'Meld je aan om te syncen.', tone: 'warn' }
  if (!online || sync.status === 'offline') return { ...base, value: 'Offline', detail: sync.pending > 0 ? `${plural(sync.pending, 'wijziging wacht', 'wijzigingen wachten')}.` : 'Alles staat op dit apparaat.', tone: 'warn' }
  if (sync.status === 'error') return { ...base, value: 'Probleem', detail: sync.error ?? 'Syncen lukt niet.', tone: 'error' }
  if (sync.status === 'syncing') return { ...base, value: 'Bezig', detail: 'Wijzigingen gaan naar je account.', tone: 'ok' }
  return { ...base, value: 'Bijgewerkt', detail: sync.lastSyncedAt ? `Laatst ${minutesAgo(now, sync.lastSyncedAt)}.` : 'Alles is gesynct.', tone: 'ok' }
}

function connectCard({ connect }: ControlInput): StatusCard {
  const base = { id: 'connect', title: 'Apparaten', app: 'devices' as AppId }
  if (connect.status === 'ready') {
    const others = Math.max(0, connect.devices - 1)
    return { ...base, value: others === 0 ? 'Alleen dit' : plural(others, 'ander apparaat', 'andere apparaten'), detail: connect.unread > 0 ? `${plural(connect.unread, 'nieuwe melding', 'nieuwe meldingen')}.` : 'NEXUS Connect staat aan.', tone: 'ok' }
  }
  if (connect.status === 'starting') return { ...base, value: 'Starten…', detail: 'NEXUS Connect maakt verbinding.', tone: 'ok' }
  if (connect.status === 'error' || connect.status === 'revoked' || connect.status === 'setup-needed') return { ...base, value: connect.status === 'revoked' ? 'Ingetrokken' : 'Probleem', detail: 'Bekijk Apparaten.', tone: 'error' }
  return { ...base, value: 'Uit', detail: 'Connect werkt met een account.', tone: 'off' }
}

function flowsCard({ flows }: ControlInput): StatusCard {
  const base = { id: 'flows', title: 'Flows', app: 'flows' as AppId }
  if (!flows.enabled) return { ...base, value: 'Uit', detail: 'Flow Studio staat uit in Instellingen.', tone: 'off' }
  if (flows.paused) return { ...base, value: 'Gepauzeerd', detail: 'Er loopt niets tot je hervat.', tone: 'warn' }
  if (flows.failedToday > 0) return { ...base, value: `${flows.active} actief`, detail: `${plural(flows.failedToday, 'run mislukte', 'runs mislukten')} vandaag.`, tone: 'error' }
  return { ...base, value: `${flows.active} actief`, detail: flows.quiet ? 'Stille uren: geen meldingen.' : 'Alles loopt.', tone: 'ok' }
}

function deadlinesCard({ deadlines }: ControlInput): StatusCard {
  const base = { id: 'deadlines', title: 'Deadlines', app: 'agenda' as AppId }
  if (deadlines.overdue > 0) return { ...base, value: `${deadlines.overdue} te laat`, detail: deadlines.today > 0 ? `En ${deadlines.today} vandaag.` : 'Bekijk ze in de Agenda.', tone: 'error' }
  if (deadlines.today > 0) return { ...base, value: `${deadlines.today} vandaag`, detail: 'Niets te laat.', tone: 'warn' }
  return { ...base, value: 'Niets vandaag', detail: 'Niets te laat.', tone: 'ok' }
}

function focusCard({ focus, now }: ControlInput): StatusCard {
  const base = { id: 'focus', title: 'Focus', app: 'study' as AppId }
  if (focus.endsAt !== null && focus.endsAt > now) {
    const left = Math.ceil((focus.endsAt - now) / 60_000)
    return { ...base, value: focus.phase === 'focus' ? 'Focus loopt' : 'Pauze', detail: `Nog ${left} min.`, tone: 'ok' }
  }
  return { ...base, value: 'Geen timer', detail: 'Start een focusblok in Studie.', tone: 'off' }
}

function updateCard({ update }: ControlInput): StatusCard {
  const base = { id: 'update', title: 'Updates', app: 'about' as AppId }
  if (update.status === 'available' || update.status === 'installing') return { ...base, value: update.version ? `Versie ${update.version}` : 'Nieuwe versie', detail: update.status === 'installing' ? 'Wordt geïnstalleerd.' : 'Klaar om te installeren.', tone: 'warn' }
  if (update.status === 'error') return { ...base, value: 'Niet gelukt', detail: 'Zoeken naar updates mislukte.', tone: 'error' }
  return { ...base, value: 'Up-to-date', detail: update.status === 'checking' ? 'Even kijken…' : 'Je hebt de nieuwste versie.', tone: 'ok' }
}

/** The status cards, in a fixed order; Inbox only when that module is on. */
export function statusCards(input: ControlInput): StatusCard[] {
  const cards = [
    syncCard(input),
    connectCard(input),
    { id: 'profile', title: 'Profiel', value: input.profile.name, detail: input.profile.scheduled ? 'Volgens je uurrooster.' : 'Zelf gekozen of standaard.', tone: 'ok' as CardTone, app: 'profiles' as AppId },
    deadlinesCard(input),
    flowsCard(input),
    focusCard(input),
    updateCard(input),
  ]
  if (input.inbox) {
    cards.splice(4, 0, { id: 'inbox', title: 'Inbox', value: input.inbox.unread > 0 ? `${input.inbox.unread} ongelezen` : 'Alles gelezen', detail: 'Wat NEXUS je wil laten weten.', tone: input.inbox.unread > 0 ? 'warn' : 'ok', app: 'inbox' })
  }
  return cards
}

/** The card that most needs you: the first error, otherwise the first warning. */
export function attention(cards: StatusCard[]): StatusCard | null {
  return cards.find((c) => c.tone === 'error') ?? cards.find((c) => c.tone === 'warn') ?? null
}

export const FAVORITES_MAX = 12

/** Adds or removes a favourite app; new ones go last, at most [FAVORITES_MAX]. */
export function toggleFavorite(list: AppId[], id: AppId): AppId[] {
  if (list.includes(id)) return list.filter((x) => x !== id)
  return list.length >= FAVORITES_MAX ? list : [...list, id]
}

/** Moves a favourite one place earlier (-1) or later (+1). */
export function moveFavorite(list: AppId[], id: AppId, by: -1 | 1): AppId[] {
  const i = list.indexOf(id)
  const j = i + by
  if (i < 0 || j < 0 || j >= list.length) return list
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

/** Favourites from storage: known apps only, no doubles. */
export function parseFavorites(raw: unknown, known: (id: string) => boolean): AppId[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  return raw.filter((x): x is AppId => typeof x === 'string' && known(x) && !seen.has(x) && Boolean(seen.add(x))).slice(0, FAVORITES_MAX)
}
