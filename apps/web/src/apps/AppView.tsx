import { Suspense } from 'react'
import type { AppDefinition } from './registry'

/** Renders an app, showing a short notice while its code loads the first time. */
export function AppView({ app }: { app: AppDefinition }) {
  const Component = app.component
  return (
    <Suspense fallback={<p role="status" className="p-4 text-sm text-nx-muted">{app.title} laden…</p>}>
      <Component />
    </Suspense>
  )
}
