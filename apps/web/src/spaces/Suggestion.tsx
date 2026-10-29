import { useEffect, useRef, useState } from 'react'
import { suggestedSpace, type Space } from '@nexus/core'
import { useFeature } from '../features/store'
import { useProfiles } from '../profiles/store'
import { useWindows } from '../state/WindowsContext'
import { switchToSpace } from './actions'
import { spacesStore, getCurrentSpace } from './store'

/** When a profile turns on (also by School Mode), offers the Space last used in it. Never opens it by itself. */
export function SpaceSuggestion() {
  const on = useFeature('spaces')
  const { active } = useProfiles()
  const { dispatch } = useWindows()
  const previous = useRef(active.id)
  const [offer, setOffer] = useState<Space | null>(null)

  useEffect(() => {
    if (previous.current === active.id) return
    previous.current = active.id
    const space = on ? suggestedSpace(spacesStore.getSnapshot(), active.id) : null
    setOffer(space && space.id !== getCurrentSpace() ? space : null)
  }, [active.id, on])

  if (!offer) return null
  return (
    <div role="status" className="nx-glass absolute top-3 left-1/2 z-[60] flex max-w-[90%] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-nx-border px-4 py-2 text-sm shadow-lg">
      <span>
        Profiel {active.name} staat aan. Je Space {offer.icon} {offer.name} openen?
      </span>
      <button
        type="button"
        className="rounded-lg border border-nx-border px-3 py-1 hover:bg-nx-surface-2"
        onClick={() => {
          switchToSpace(offer, dispatch)
          setOffer(null)
        }}
      >
        Openen
      </button>
      <button type="button" className="rounded-lg px-3 py-1 text-nx-muted hover:bg-nx-surface-2" onClick={() => setOffer(null)}>
        Nee
      </button>
    </div>
  )
}
