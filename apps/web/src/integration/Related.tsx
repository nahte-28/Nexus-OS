import { useSyncExternalStore } from 'react'
import { filesLinkedTo, relatedTo, type AppId } from '@nexus/core'
import { useFeature } from '../features/store'
import { filesStore } from '../files/store'
import { useInbox } from '../inbox/store'
import { lifeStore } from '../life/store'
import { useProjectHub } from '../projecthub/store'
import { openApp } from '../shell/openApp'
import { useVault } from '../vault/store'

/** Integratie: what belongs to one Agenda item (project, task, Inbox items, files), one tap away. */
export function Related({ itemId, hide }: { itemId: string; /** Leaves out links to this app (the one showing it). */ hide?: AppId }) {
  const on = useFeature('integration')
  const hubOn = useFeature('projectHub')
  const vaultOn = useFeature('vault')
  const inboxOn = useFeature('inbox')
  const life = useSyncExternalStore(lifeStore.subscribe, lifeStore.getSnapshot)
  const inbox = useInbox()
  const hub = useProjectHub()
  const vault = useVault()
  const files = useSyncExternalStore(filesStore.subscribe, filesStore.getSnapshot)
  if (!on) return null
  const links = relatedTo(itemId, {
    life,
    inbox: inboxOn ? inbox.filter((i) => i.archivedAt === null) : [],
    hub: hubOn ? hub : null,
    files: vaultOn ? filesLinkedTo(vault, files, 'project', itemId).map((f) => ({ id: f.id, name: f.name })) : [],
    projectApp: hubOn ? 'projecthub' : 'agenda',
  }).filter((l) => l.app !== hide)
  if (links.length === 0) return null
  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs text-nx-muted">Hoort erbij</p>
      <ul className="flex flex-wrap gap-1" aria-label="Hoort erbij">
        {links.map((l, i) => (
          <li key={`${l.app}:${l.id ?? ''}:${i}`}>
            <button type="button" onClick={() => openApp(l.app, l.id)} className="rounded-md border border-nx-border px-2 py-0.5 text-xs hover:bg-nx-surface-2">
              <span className="text-nx-muted">{l.label}:</span> {l.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
