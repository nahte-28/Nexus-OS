/**
 * NEXUS Sentinel (Next Frontier B): one clear security centre for your account, devices, sessions
 * and what you allowed (NEXUS AI, extensions, teams, Bridge). Each warning says what was seen, why
 * it matters and what you can do. Sentinel claims no malware detection or endpoint protection: it
 * only shows what NEXUS itself knows. Pure logic.
 */
import type { AppId } from './windows'
import type { DevicePlatform } from './connect'

export type CheckLevel = 'ok' | 'warn' | 'info'

export interface SecurityCheck {
  id: string
  level: CheckLevel
  title: string
  detail: string
  /** Where to fix it: a Sentinel tab or another app. */
  action?: { label: string; tab?: SentinelTab; app?: AppId }
}

export type SentinelTab = 'Overzicht' | 'Apparaten' | 'Sessies' | 'Toestemmingen' | 'Activiteit'
export const SENTINEL_TABS: SentinelTab[] = ['Overzicht', 'Apparaten', 'Sessies', 'Toestemmingen', 'Activiteit']

export interface SentinelDevice {
  id: string
  name: string
  platform: DevicePlatform
  lastSeenAt: number
  createdAt: number
  revoked: boolean
  isThisDevice: boolean
}

export interface SecurityInput {
  /** Supabase is set up for this NEXUS. */
  cloud: boolean
  signedIn: boolean
  devices: SentinelDevice[]
  /** NEXUS AI actions that run without asking. */
  aiAlwaysAllowed: string[]
  /** NEXUS AI modules switched off in "Wat NEXUS AI mag zien". */
  aiModulesOff: number
  aiModulesTotal: number
  extensions: Array<{ name: string; permissions: string[] }>
  /** Teams that see when you are gaming. */
  sharedTeams: number
  autoClipboard: boolean
  /** Browser notification permission. */
  notifications: 'granted' | 'denied' | 'default' | 'unsupported'
  now: number
}

/** A device not seen for this long gets a warning: maybe it is lost, sold or wiped. */
export const STALE_DEVICE_DAYS = 30
const DAY = 86_400_000

export const staleDevices = (devices: SentinelDevice[], now: number) =>
  devices.filter((d) => !d.revoked && !d.isThisDevice && now - d.lastSeenAt > STALE_DEVICE_DAYS * DAY)

/** The checklist on the Overzicht tab, warnings first. */
export function securityChecks(i: SecurityInput): SecurityCheck[] {
  const out: SecurityCheck[] = []
  if (!i.cloud || !i.signedIn) {
    out.push({
      id: 'account',
      level: 'info',
      title: 'Geen account op dit apparaat',
      detail: 'Alles staat alleen hier. Met een account syncen je gegevens via een beveiligde verbinding en kun je apparaten koppelen en intrekken.',
      action: i.cloud ? { label: 'Aanmelden', app: 'account' } : undefined,
    })
  } else {
    out.push({ id: 'account', level: 'ok', title: 'Aangemeld', detail: 'Je gegevens syncen met je account; elke tabel laat alleen jou bij je eigen rijen (RLS).' })
  }

  const active = i.devices.filter((d) => !d.revoked)
  const stale = staleDevices(i.devices, i.now)
  if (stale.length > 0) {
    out.push({
      id: 'stale-devices',
      level: 'warn',
      title: stale.length === 1 ? `${stale[0].name} is al ${STALE_DEVICE_DAYS} dagen niet gezien` : `${stale.length} apparaten al ${STALE_DEVICE_DAYS} dagen niet gezien`,
      detail: 'Een apparaat dat je niet meer gebruikt, kan nog berichten van NEXUS Connect ontvangen. Trek het in als je het kwijt bent of niet meer hebt.',
      action: { label: 'Apparaten bekijken', tab: 'Apparaten' },
    })
  } else if (i.signedIn) {
    out.push({ id: 'devices', level: 'ok', title: `${active.length} ${active.length === 1 ? 'apparaat' : 'apparaten'} gekoppeld`, detail: 'Allemaal de laatste 30 dagen nog gezien.', action: { label: 'Apparaten bekijken', tab: 'Apparaten' } })
  }

  if (i.aiAlwaysAllowed.length > 0) {
    out.push({
      id: 'ai-always',
      level: 'warn',
      title: `${i.aiAlwaysAllowed.length} ${i.aiAlwaysAllowed.length === 1 ? 'actie' : 'acties'} van NEXUS AI zonder vragen`,
      detail: 'Je koos ooit "altijd toestaan". Die acties lopen zonder dat je ze nog goedkeurt.',
      action: { label: 'Toestemmingen bekijken', tab: 'Toestemmingen' },
    })
  }
  if (i.aiModulesOff < i.aiModulesTotal) {
    out.push({
      id: 'ai-modules',
      level: 'info',
      title: `NEXUS AI mag ${i.aiModulesTotal - i.aiModulesOff} van ${i.aiModulesTotal} onderdelen zien`,
      detail: 'Alleen wanneer je NEXUS AI iets vraagt. Je kiest per onderdeel wat het mag lezen.',
      action: { label: 'Toestemmingen bekijken', tab: 'Toestemmingen' },
    })
  }
  if (i.extensions.length > 0) {
    out.push({
      id: 'extensions',
      level: 'info',
      title: `${i.extensions.length} ${i.extensions.length === 1 ? 'eigen widget' : 'eigen widgets'} geïnstalleerd`,
      detail: 'Ze draaien afgeschermd en krijgen alleen de permissies die je bij het installeren goedkeurde.',
      action: { label: 'Toestemmingen bekijken', tab: 'Toestemmingen' },
    })
  }
  if (i.sharedTeams > 0) {
    out.push({ id: 'teams', level: 'info', title: `${i.sharedTeams} ${i.sharedTeams === 1 ? 'team ziet' : 'teams zien'} wanneer je gamet`, detail: 'Alleen de game en sinds wanneer, zolang de Gaming-timer loopt.', action: { label: 'Toestemmingen bekijken', tab: 'Toestemmingen' } })
  }
  if (i.autoClipboard) {
    out.push({ id: 'clipboard', level: 'info', title: 'Bridge zet tekst meteen op je klembord', detail: 'Handig, maar wat je van een ander apparaat stuurt, overschrijft dan je klembord.', action: { label: 'Bridge openen', app: 'bridge' } })
  }
  if (i.notifications === 'denied') {
    out.push({ id: 'notifications', level: 'warn', title: 'Meldingen staan uit in deze browser', detail: 'Deadlines en waarschuwingen van NEXUS kunnen je hier dan niet bereiken. Zet ze aan in de site-instellingen van je browser.' })
  }
  const order: Record<CheckLevel, number> = { warn: 0, info: 1, ok: 2 }
  return out.sort((a, b) => order[a.level] - order[b.level])
}

// Activity log ---------------------------------------------------------------------------------------

export type AuditAction =
  | 'signed_in'
  | 'signed_out'
  | 'device_added'
  | 'device_revoked'
  | 'signout_others'
  | 'signout_everywhere'
  | 'ai_always_removed'
  | 'extension_removed'
  | 'team_share_off'

export const AUDIT_LABELS: Record<AuditAction, string> = {
  signed_in: 'Aangemeld',
  signed_out: 'Afgemeld',
  device_added: 'Nieuw apparaat gekoppeld',
  device_revoked: 'Apparaat ingetrokken',
  signout_others: 'Afgemeld op andere apparaten',
  signout_everywhere: 'Overal afgemeld',
  ai_always_removed: 'NEXUS AI vraagt weer toestemming',
  extension_removed: 'Widget verwijderd',
  team_share_off: 'Team ziet je gamen niet meer',
}

export interface AuditEvent {
  id: string
  at: number
  action: AuditAction
  /** A name to recognise it by (device, widget, team); never a secret or content. */
  target: string
  outcome: 'ok' | 'failed'
}

export const MAX_AUDIT = 300
const ACTIONS = Object.keys(AUDIT_LABELS) as AuditAction[]

export function parseAudit(raw: unknown): AuditEvent[] {
  if (!Array.isArray(raw)) return []
  return raw
    .flatMap((x): AuditEvent[] => {
      if (typeof x !== 'object' || x === null) return []
      const e = x as Record<string, unknown>
      if (typeof e.id !== 'string' || typeof e.at !== 'number' || !ACTIONS.includes(e.action as AuditAction)) return []
      return [{ id: e.id, at: e.at, action: e.action as AuditAction, target: typeof e.target === 'string' ? e.target.slice(0, 120) : '', outcome: e.outcome === 'failed' ? 'failed' : 'ok' }]
    })
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_AUDIT)
}

/** Adds an event on top. The log only grows (the oldest fall off at MAX_AUDIT); nothing edits it. */
export function addAudit(log: AuditEvent[], e: AuditEvent): AuditEvent[] {
  if (log.some((x) => x.id === e.id)) return log
  return [e, ...log].sort((a, b) => b.at - a.at).slice(0, MAX_AUDIT)
}

/**
 * What changed in the device list since the last look: devices added (a login on a new device) and
 * devices revoked. The first look only remembers, so you are not told about every old device.
 */
export function deviceChanges(known: Record<string, 'active' | 'revoked'> | null, devices: SentinelDevice[]): { added: SentinelDevice[]; revoked: SentinelDevice[]; next: Record<string, 'active' | 'revoked'> } {
  const next: Record<string, 'active' | 'revoked'> = {}
  for (const d of devices) next[d.id] = d.revoked ? 'revoked' : 'active'
  if (known === null) return { added: [], revoked: [], next }
  const added = devices.filter((d) => !d.revoked && !d.isThisDevice && known[d.id] === undefined)
  const revoked = devices.filter((d) => d.revoked && known[d.id] === 'active')
  return { added, revoked, next }
}
