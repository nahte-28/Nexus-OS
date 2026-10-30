import type { Dispatch } from 'react'
import { changeSpace, createSpace, markUsed, type ProfileId, type Space, type SpaceWindow, type WindowAction, type WindowsState } from '@nexus/core'
import { APPS } from '../apps/registry'
import { chooseFor, profilesStore } from '../profiles/store'
import { eventBus } from '../events/bus'
import { setCurrentSpace, spacesStore } from './store'

/** The open windows as a Space stores them; the Spaces app itself is left out. */
export function openLayout(state: WindowsState): SpaceWindow[] {
  return [...state.windows]
    .sort((a, b) => a.z - b.z)
    .filter((w) => w.appId !== 'spaces')
    .map((w) => ({ appId: w.appId, rect: w.rect, minimized: w.minimized, maximized: w.maximized }))
}

/** Opens [space]: its windows replace the open ones (notes and other apps save as you type). */
export function switchToSpace(space: Space, dispatch: Dispatch<WindowAction>, now = Date.now()): void {
  if (profilesStore.getSnapshot().active.id !== space.profileId) chooseFor(space.profileId, 'until-change', now)
  dispatch({
    type: 'restore',
    windows: space.windows.flatMap((w) => {
      // An app this version does not know (or a website app) is skipped, not an error.
      const app = APPS.find((a) => a.id === w.appId)
      return app && !app.launch ? [{ ...w, title: app.title }] : []
    }),
  })
  setCurrentSpace(space.id)
  spacesStore.update((s) => markUsed(s, space, now))
  eventBus.publish({ id: `space:${space.id}@${now}`, source: 'system', type: 'space.opened', at: now, title: `Space ${space.name} geopend`, priority: 'low', link: { app: 'spaces', id: space.id } })
}

export function saveLayout(id: string, windows: SpaceWindow[], now = Date.now()): void {
  spacesStore.update((s) => changeSpace(s, id, { windows }, now))
}

/** With [current], the new Space holds exactly what is open: it is the one in use now, also for School Mode's offer later. */
export function newSpace(input: { name: string; icon?: string; profileId: ProfileId; windows: SpaceWindow[] }, now = Date.now(), current = false): string {
  const id = crypto.randomUUID()
  spacesStore.update((s) => createSpace(s, { id, ...input }, now))
  if (current) {
    setCurrentSpace(id)
    const space = spacesStore.getSnapshot().spaces.find((x) => x.id === id)
    if (space) spacesStore.update((s) => markUsed(s, space, now))
  }
  return id
}
