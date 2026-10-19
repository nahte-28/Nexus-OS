import { useEffect, useState } from 'react'
import { THEMES } from '@nexus/core'
import { isAutostartEnabled, isDesktopApp, setAutostart } from '../platform/desktop'
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
    </fieldset>
  )
}
