import { useEffect, useState } from 'react'
import { THEMES } from '@nexus/core'
import { BackupSection } from '../backup/BackupSection'
import { ModuleSettings } from '../features/ModuleSettings'
import { startTour } from '../onboarding/Tour'
import { setDeveloperMode, useDeveloperMode } from '../devtools/log'
import { setFlowStudioEnabled, useFlowStudioEnabled } from '../flows/store'
import { isAutostartEnabled, isDesktopApp, setAutostart } from '../platform/desktop'
import { checkForUpdate, installUpdate, useUpdate } from '../platform/update'
import { useTheme } from '../theme/ThemeContext'

export function Settings() {
  const { theme, setTheme } = useTheme()
  return (
    <div className="space-y-4 p-4">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-nx-muted">Thema</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {THEMES.map((t) => (
            <label
              key={t.id}
              className={`flex cursor-pointer flex-col rounded-lg border p-3 ${
                theme === t.id ? 'border-nx-accent bg-nx-surface-2' : 'border-nx-border'
              }`}
            >
              <span className="flex items-center gap-2 font-medium">
                <input
                  type="radio"
                  name="theme"
                  value={t.id}
                  checked={theme === t.id}
                  onChange={() => setTheme(t.id)}
                  className="accent-[var(--nx-accent)]"
                />
                {t.label}
              </span>
              <span className="mt-1 text-sm text-nx-muted">{t.description}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-sm text-nx-muted">Je keuze wordt bewaard en geldt direct, zonder dat open vensters sluiten.</p>
      {isDesktopApp && <WindowsSettings />}
      <fieldset className="space-y-2 border-t border-nx-border pt-4 text-sm">
        <legend className="mb-2 text-sm font-semibold text-nx-muted">Rondleiding</legend>
        <p className="text-nx-muted">De eerste stappen opnieuw: aanmelden, meldingen, gsm en horloge, lesrooster.</p>
        <button type="button" onClick={startTour} className="rounded-lg border border-nx-border px-3 py-1.5 hover:bg-nx-surface-2">
          Rondleiding starten
        </button>
      </fieldset>
      <BackupSection />
      <BetaSettings />
      <ModuleSettings />
      <DeveloperSettings />
    </div>
  )
}

function WindowsSettings() {
  const [autostart, setAutostartState] = useState<boolean | null>(null)
  useEffect(() => {
    void isAutostartEnabled().then(setAutostartState)
  }, [])
  return (
    <fieldset className="space-y-2 border-t border-nx-border pt-4">
      <legend className="mb-2 text-sm font-semibold text-nx-muted">Windows</legend>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          disabled={autostart === null}
          checked={autostart ?? false}
          onChange={(e) => {
            const next = e.target.checked
            void setAutostart(next).then(() => setAutostartState(next))
          }}
          className="accent-[var(--nx-accent)]"
        />
        Starten met Windows (in het systeemvak)
      </label>
      <p className="text-sm text-nx-muted">
        Sluit je het venster, dan blijft NEXUS in het systeemvak draaien zodat meldingen binnenkomen. Afsluiten doe je via
        het NEXUS-icoon in het systeemvak.
      </p>
      <UpdateSettings />
    </fieldset>
  )
}

function UpdateSettings() {
  const update = useUpdate()
  return (
    <div className="flex flex-wrap items-center gap-2 pt-2 text-sm">
      <span className="flex-1">
        {update.status === 'idle' && 'Updates voor de Windows-app'}
        {update.status === 'checking' && 'Zoeken naar updates…'}
        {update.status === 'current' && 'Je hebt de nieuwste versie.'}
        {update.status === 'available' && `Versie ${update.update.version} is beschikbaar.`}
        {update.status === 'installing' && `Versie ${update.update.version} wordt geïnstalleerd; NEXUS start zo opnieuw.`}
        {update.status === 'error' && <span className="text-red-500">Updates zoeken lukte niet: {update.error}</span>}
      </span>
      {update.status === 'available' ? (
        <button type="button" onClick={() => void installUpdate()} className="rounded-lg bg-nx-accent px-3 py-1.5 font-medium text-nx-accent-text">
          Nu bijwerken
        </button>
      ) : (
        <button
          type="button"
          disabled={update.status === 'checking' || update.status === 'installing'}
          onClick={() => void checkForUpdate()}
          className="rounded-lg border border-nx-border px-3 py-1.5 hover:bg-nx-surface-2 disabled:opacity-60"
        >
          Zoeken naar updates
        </button>
      )}
    </div>
  )
}

function BetaSettings() {
  const flows = useFlowStudioEnabled()
  return (
    <fieldset className="space-y-2 border-t border-nx-border pt-4">
      <legend className="mb-2 text-sm font-semibold text-nx-muted">Beta</legend>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={flows} onChange={(e) => setFlowStudioEnabled(e.target.checked)} className="accent-[var(--nx-accent)]" />
        Flow Studio: automatiseringen met een trigger, voorwaarden en acties. Uit betekent ook dat geen enkele flow loopt.
      </label>
    </fieldset>
  )
}

function DeveloperSettings() {
  const developer = useDeveloperMode()
  return (
    <fieldset className="space-y-2 border-t border-nx-border pt-4">
      <legend className="mb-2 text-sm font-semibold text-nx-muted">Ontwikkelaar</legend>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={developer}
          onChange={(e) => setDeveloperMode(e.target.checked)}
          className="accent-[var(--nx-accent)]"
        />
        Ontwikkelaarsmodus: toont de app Ontwikkelaar met logboek, systeeminfo en AI-verbruik
      </label>
    </fieldset>
  )
}
