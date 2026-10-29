import { installedVersion } from '@nexus/core'
import { SandboxFrame } from './SandboxFrame'
import { useDevHub } from './store'

/** The widget library on the dashboard: installed Developer Hub widgets, each in its own sandbox. */
export function ExtensionWidgets() {
  const hub = useDevHub()
  const widgets = hub.installs.map((i) => installedVersion(hub, i.projectId)).filter((w) => w !== null)
  if (widgets.length === 0) return null
  return (
    <section aria-label="Je widgets" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {widgets.map(({ install, version }) => (
        <div key={install.projectId} className="nx-glass rounded-2xl border border-nx-border p-4">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-nx-muted uppercase">{version.manifest.name}</h2>
          <SandboxFrame extId={install.projectId} name={version.manifest.name} code={version.code} granted={install.permissions} title={`Widget ${version.manifest.name}`} height={140} framed={false} />
        </div>
      ))}
    </section>
  )
}
