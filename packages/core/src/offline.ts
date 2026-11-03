/**
 * NEXUS Offline-centrum (Next Frontier E): what works without internet per module, what still
 * waits to be sent, what NEXUS merged when two devices changed the same thing, and a history of
 * sync rounds. Every module already works offline-first (IndexedDB or localStorage with a queue);
 * this only makes it visible. Pure logic.
 */
import type { AppId } from './windows'

export type OfflineLevel = 'full' | 'partial' | 'online'

export interface OfflineModule {
  app: AppId
  title: string
  level: OfflineLevel
  /** What works offline, and what waits for a connection. */
  detail: string
}

/** Per module what you can do without internet. Kept by hand next to the code that does it. */
export const OFFLINE_MODULES: OfflineModule[] = [
  { app: 'notes', title: 'Notities', level: 'full', detail: 'Lezen, schrijven en verwijderen. Wijzigingen wachten in de wachtrij tot je weer online bent.' },
  { app: 'agenda', title: 'Agenda', level: 'full', detail: 'Deadlines, afspraken en projecten bekijken en wijzigen; meldingen vooraf blijven komen.' },
  { app: 'reminders', title: 'Herinneringen', level: 'full', detail: 'Zetten en afgaan op dit apparaat. Naar gsm en horloge gaan ze zodra er verbinding is.' },
  { app: 'study', title: 'Studie', level: 'full', detail: 'Focustimer, planner en examens. De planner gebruikt het lesrooster dat al binnen was.' },
  { app: 'files', title: 'Bestanden', level: 'partial', detail: 'Bestanden die al op dit apparaat staan openen en nieuwe toevoegen. Bestanden die alleen in je account staan, wachten op verbinding.' },
  { app: 'profiles', title: 'Profielen', level: 'full', detail: 'Wisselen en het lesrooster volgen met wat al binnen was. Het rooster opnieuw ophalen wacht.' },
  { app: 'flows', title: 'Flow Studio', level: 'full', detail: 'Flows lopen op dit apparaat. Flows op de server lopen apart, ook als dit apparaat uit staat.' },
  { app: 'grades', title: 'Cijfers', level: 'full', detail: 'Alles, met sync achteraf.' },
  { app: 'habits', title: 'Gewoontes', level: 'full', detail: 'Alles, met sync achteraf.' },
  { app: 'flashcards', title: 'Leerkaarten', level: 'partial', detail: 'Oefenen en kaarten maken. Kaarten laten maken door NEXUS AI wacht op verbinding.' },
  { app: 'finance', title: 'Financiën', level: 'full', detail: 'Alles behalve AI-advies, met sync achteraf.' },
  { app: 'journal', title: 'Dagboek', level: 'full', detail: 'Alles, met sync achteraf.' },
  { app: 'assistant', title: 'NEXUS AI', level: 'online', detail: 'Heeft altijd internet nodig.' },
  { app: 'devices', title: 'Apparaten en meldingen', level: 'online', detail: 'NEXUS Connect heeft internet nodig; wat binnenkwam, blijft leesbaar.' },
  { app: 'bridge', title: 'Bridge', level: 'online', detail: 'Versturen heeft internet nodig; ontvangen gebeurt zodra je weer online bent.' },
  { app: 'teams', title: 'Teams', level: 'online', detail: 'Studiegroepen en gedeelde projecten werken live en hebben internet nodig.' },
]

export const OFFLINE_LEVEL_LABELS: Record<OfflineLevel, string> = { full: 'Werkt offline', partial: 'Deels offline', online: 'Alleen online' }

/** One thing that syncs, as the Offline-centrum shows it. */
export interface ChannelStatus {
  id: string
  label: string
  /** Changes on this device that the account does not have yet. */
  pending: number
  /** Last time a round succeeded, or null. */
  lastOkAt: number | null
  /** The last problem, while it lasts. */
  error: string | null
}

export type SyncOutcome = 'ok' | 'failed' | 'merged'

export interface SyncRun {
  id: string
  at: number
  channel: string
  label: string
  outcome: SyncOutcome
  /** What happened, in words; never content. */
  detail: string
}

export const MAX_SYNC_RUNS = 200
const OUTCOMES: SyncOutcome[] = ['ok', 'failed', 'merged']

export function parseSyncRuns(raw: unknown): SyncRun[] {
  if (!Array.isArray(raw)) return []
  return raw
    .flatMap((x): SyncRun[] => {
      const r = x as Record<string, unknown>
      if (typeof r?.id !== 'string' || typeof r.at !== 'number' || typeof r.channel !== 'string' || !OUTCOMES.includes(r.outcome as SyncOutcome)) return []
      return [{ id: r.id, at: r.at, channel: r.channel.slice(0, 40), label: typeof r.label === 'string' ? r.label.slice(0, 60) : r.channel, outcome: r.outcome as SyncOutcome, detail: typeof r.detail === 'string' ? r.detail.slice(0, 300) : '' }]
    })
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_SYNC_RUNS)
}

/**
 * Adds a round on top. A failure that repeats the channel's last entry exactly is left out, so a
 * device that stays offline does not fill the history with the same line.
 */
export function addSyncRun(runs: SyncRun[], run: SyncRun): SyncRun[] {
  const last = runs.find((r) => r.channel === run.channel)
  if (last && run.outcome === 'failed' && last.outcome === 'failed' && last.detail === run.detail) return runs
  return [run, ...runs].slice(0, MAX_SYNC_RUNS)
}

export interface OfflineSummary {
  pending: number
  failing: number
  /** Rounds where two devices changed the same document and NEXUS merged them, last 7 days. */
  merges: number
  lastOkAt: number | null
}

export function offlineSummary(channels: ChannelStatus[], runs: SyncRun[], now: number): OfflineSummary {
  const week = now - 7 * 86_400_000
  const oks = channels.map((c) => c.lastOkAt).filter((t): t is number => t !== null)
  return {
    pending: channels.reduce((n, c) => n + c.pending, 0),
    failing: channels.filter((c) => c.error).length,
    merges: runs.filter((r) => r.outcome === 'merged' && r.at >= week).length,
    lastOkAt: oks.length ? Math.max(...oks) : null,
  }
}

/** "net", "3 min geleden", "2 u geleden", or a date. */
export function agoText(at: number | null, now: number): string {
  if (at === null) return 'nog nooit'
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 60) return 'net'
  if (s < 3600) return `${Math.round(s / 60)} min geleden`
  if (s < 86_400) return `${Math.round(s / 3600)} u geleden`
  return new Date(at).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })
}
