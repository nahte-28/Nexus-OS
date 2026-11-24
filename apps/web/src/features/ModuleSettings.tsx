import { APP_GROUPS, APP_GROUP, CAPABILITY_INFO, FEATURES, appOn, canSwitchApp, featureOn, type AppGroupId, type Capability, type FeatureInfo } from '@nexus/core'
import { APPS, type AppDefinition } from '../apps/registry'
import { capabilities } from '../platform/capabilities'
import { setAppOn, setFeature, useAppSwitches, useFeatureSwitches } from './store'

/** The apps you can switch: not the way back (Profielen, Instellingen, Help, Account) and not the ones with their own case. */
const switchable = (a: AppDefinition) => canSwitchApp(a.id) && !a.beta && !a.developer && !a.admin && !a.linux

/** Modules without an app of their own: they change other apps (Launcher in Ctrl+K, Vault in Bestanden, Integratie). */
const EXTRAS: FeatureInfo[] = FEATURES.filter((f) => !APPS.some((a) => a.feature === f.id))

/**
 * Instellingen › Apps aan/uit: one list with every app and module, in the sidebar's groups. Off
 * means the app is gone everywhere (sidebar, search, dashboard), in every profile; its data stays.
 */
export function ModuleSettings() {
  const features = useFeatureSwitches()
  const apps = useAppSwitches()
  const groups = APP_GROUPS.map((g) => ({ ...g, apps: APPS.filter((a) => switchable(a) && APP_GROUP[a.id] === g.id) })).filter((g) => g.apps.length > 0)
  const on = (a: AppDefinition) => (a.feature ? featureOn(features, a.feature) : appOn(apps, a.id))
  const set = (a: AppDefinition, value: boolean) => (a.feature ? setFeature(a.feature, value) : setAppOn(a.id, value))
  return (
    <fieldset className="space-y-3 border-t border-nx-border pt-4 text-sm">
      <legend className="mb-2 text-sm font-semibold text-nx-muted">Apps aan/uit</legend>
      <p className="text-nx-muted">
        Zet uit wat je niet gebruikt. Een app die uit staat, verdwijnt uit de zijbalk, het zoeken en het dashboard, in elk profiel. Je gegevens blijven bewaard en zijn terug zodra je de app weer aanzet. Profielen, Instellingen, Help en Account blijven altijd. Met een account gelden je keuzes op al je toestellen.
      </p>
      {groups.map((g) => (
        <Group key={g.id} id={g.id} title={g.title}>
          {g.apps.map((a) => {
            const info = a.feature ? FEATURES.find((f) => f.id === a.feature) : undefined
            return <Switch key={a.id} title={a.title} description={info?.description} defaultOff={info ? !info.defaultOn : false} checked={on(a)} onChange={(v) => set(a, v)} />
          })}
        </Group>
      ))}
      {EXTRAS.length > 0 && (
        <Group id="extra" title="Extra functies">
          {EXTRAS.map((f) => (
            <Switch key={f.id} title={f.title} description={f.description} defaultOff={!f.defaultOn} checked={featureOn(features, f.id)} disabled={!f.available} onChange={(v) => setFeature(f.id, v)} />
          ))}
        </Group>
      )}
      <p className="text-nx-muted">Werkt een app niet, kijk dan in Account › Database-check of haar SQL is uitgevoerd.</p>
      <details className="pt-1">
        <summary className="cursor-pointer text-nx-muted">Wat dit toestel kan</summary>
        <ul className="mt-2 space-y-1">
          {(Object.keys(CAPABILITY_INFO) as Capability[]).map((c) => (
            <li key={c}>
              {capabilities[c] ? '✓' : '–'} {CAPABILITY_INFO[c].title}
              {!capabilities[c] && <span className="text-nx-muted">: {CAPABILITY_INFO[c].missing}</span>}
            </li>
          ))}
        </ul>
      </details>
    </fieldset>
  )
}

function Group({ id, title, children }: { id: AppGroupId | 'extra'; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`apps-${id}`} className="space-y-2">
      <h3 id={`apps-${id}`} className="text-xs font-semibold text-nx-muted">
        {title}
      </h3>
      <ul className="space-y-2">{children}</ul>
    </section>
  )
}

function Switch({ title, description, defaultOff, checked, disabled = false, onChange }: { title: string; description?: string; defaultOff: boolean; checked: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <li>
      <label className={`flex items-start gap-2 ${disabled ? 'opacity-60' : ''}`}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-1 accent-[var(--nx-accent)]" />
        <span>
          <span className="font-medium">{title}</span>
          {disabled && <span className="ml-2 text-xs text-nx-muted">binnenkort</span>}
          {!disabled && defaultOff && <span className="ml-2 text-xs text-nx-muted">standaard uit</span>}
          {description && <span className="block text-nx-muted">{description}</span>}
        </span>
      </label>
    </li>
  )
}
