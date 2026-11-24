import { desktopAppName, isDesktopApp } from '../platform/desktop'
import { DISCORD_CLIENT_ID, setDiscordSettings, useDiscord } from './discord'

/** Instellingen › Discord: what you play in Gaming Companion as your status on Discord. */
export function DiscordSettings() {
  const { settings, problem } = useDiscord()
  return (
    <fieldset className="space-y-2 border-t border-nx-border pt-4 text-sm">
      <legend className="mb-2 text-sm font-semibold text-nx-muted">Discord</legend>
      <p className="text-nx-muted">Discord-status: start je de Gaming-timer in Gaming Companion, ook vanaf je gsm of horloge, dan zien je vrienden op Discord wat je speelt en hoe lang al. Stop je, dan verdwijnt het.</p>
      {!isDesktopApp ? (
        <p>Dit werkt in de Windows- of Linux-app, als Discord op die computer open staat. Een website kan Discord niet bereiken.</p>
      ) : !DISCORD_CLIENT_ID ? (
        <p className="text-nx-muted">Nog niet beschikbaar in deze versie van de {desktopAppName}.</p>
      ) : (
        <>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.on} onChange={(e) => setDiscordSettings({ on: e.target.checked })} className="accent-[var(--nx-accent)]" />
            Mijn gamingstatus op Discord tonen
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.showGame} disabled={!settings.on} onChange={(e) => setDiscordSettings({ showGame: e.target.checked })} className="accent-[var(--nx-accent)]" />
            Tonen welke game (anders alleen "Aan het gamen")
          </label>
          {problem && settings.on && <p className="text-nx-muted">{problem} NEXUS probeert het elke minuut opnieuw.</p>}
        </>
      )}
    </fieldset>
  )
}
