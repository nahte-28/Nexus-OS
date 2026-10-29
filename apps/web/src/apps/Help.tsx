import { useState } from 'react'
import { HELP } from '../help/topics'
import { useVisibleApps } from './registry'

/** Help: what each app is for, with a few how-tos, searchable. */
export function Help() {
  const apps = useVisibleApps()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const shown = apps.filter((app) => {
    if (!q) return true
    const topic = HELP[app.id]
    return [app.title, topic.summary, ...topic.tips].some((text) => text.toLowerCase().includes(q))
  })

  return (
    <div className="space-y-3 p-4 text-sm">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Zoek een app of een woord"
        aria-label="Zoeken in Help"
        className="w-full rounded-lg border border-nx-border bg-nx-surface px-3 py-2"
      />
      {shown.length === 0 && <p className="text-nx-muted">Niets gevonden voor “{query.trim()}”.</p>}
      <ul className="space-y-2">
        {shown.map((app) => {
          const topic = HELP[app.id]
          const Icon = app.icon
          return (
            <li key={app.id}>
              <details open={!!q} className="rounded-lg border border-nx-border bg-nx-surface/60 px-3 py-2">
                <summary className="flex cursor-pointer items-center gap-2 font-medium">
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  {app.title}
                </summary>
                <p className="mt-2">{topic.summary}</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-nx-muted">
                  {topic.tips.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              </details>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
