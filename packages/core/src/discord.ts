/**
 * Discord-status: while the Gaming timer runs, Discord shows what you play, through the Windows- or
 * Linux-app (Discord Rich Presence on that computer). Pure logic; the app talks to Discord.
 */
import type { GamingState } from './gaming'

export interface DiscordSettings {
  on: boolean
  /** Show the game's name; off shows only "Aan het gamen". */
  showGame: boolean
}

export const DEFAULT_DISCORD: DiscordSettings = { on: true, showGame: true }

export function parseDiscordSettings(raw: unknown): DiscordSettings {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  return { on: typeof r.on === 'boolean' ? r.on : DEFAULT_DISCORD.on, showGame: typeof r.showGame === 'boolean' ? r.showGame : DEFAULT_DISCORD.showGame }
}

export interface DiscordActivity {
  details: string
  status: string
  startMs: number
}

/** What Discord shows for the running Gaming timer, or null when nothing (or nothing to show) runs. */
export function discordActivity(s: GamingState, settings: DiscordSettings): DiscordActivity | null {
  if (!settings.on || !s.active) return null
  const game = s.games.find((g) => g.id === s.active!.gameId)
  if (!settings.showGame || !game) return { details: 'Aan het gamen', status: 'via NEXUS', startMs: s.active.startedAt }
  return { details: `Speelt ${game.name}`.slice(0, 128), status: game.platform.trim() ? `op ${game.platform.trim()}`.slice(0, 128) : 'via NEXUS', startMs: s.active.startedAt }
}

/** Same activity, so no new call to Discord is needed. */
export const sameActivity = (a: DiscordActivity | null, b: DiscordActivity | null) => a === b || (!!a && !!b && a.details === b.details && a.status === b.status && a.startMs === b.startMs)
