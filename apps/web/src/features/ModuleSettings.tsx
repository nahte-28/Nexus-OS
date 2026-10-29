import { CAPABILITY_INFO, FEATURES, featureOn, type Capability } from '@nexus/core'
import { capabilities } from '../platform/capabilities'
import { setFeature, useFeatureSwitches } from './store'

/** Instellingen > Nieuwe modules: a switch per blueprint module, and what this device can do. */
export function ModuleSettings() {
  const switches = useFeatureSwitches()
  return (
    <fieldset className="space-y-2 border-t border-nx-border pt-4 text-sm">
      <legend className="mb-2 text-sm font-semibold text-nx-muted">Nieuwe modules</legend>
      <p className="text-nx-muted">Modules uit de blueprint komen hier één voor één bij. Uit betekent dat de module helemaal verdwijnt.</p>
      <ul className="space-y-2">
        {FEATURES.map((f) => (
          <li key={f.id}>
            <label className={`flex items-start gap-2 ${f.available ? '' : 'opacity-60'}`}>
              <input
                type="checkbox"
                checked={featureOn(switches, f.id)}
                disabled={!f.available}
                onChange={(e) => setFeature(f.id, e.target.checked)}
                className="mt-1 accent-[var(--nx-accent)]"
              />
              <span>
                <span className="font-medium">{f.title}</span>
                {!f.available && <span className="ml-2 text-xs text-nx-muted">binnenkort</span>}
                <span className="block text-nx-muted">{f.description}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
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
