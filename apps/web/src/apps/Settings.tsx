import { THEMES } from '@nexus/core'
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
    </div>
  )
}
