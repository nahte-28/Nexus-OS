import { describe, expect, it } from 'vitest'
import { marketItem } from '@nexus/core'
import { capturesStore } from '../capture/hub'
import { devHubStore } from '../devhub/store'
import { flowsStore, flowStudioEnabled } from '../flows/store'
import { profilesStore } from '../profiles/store'
import { addMarketItem, MarketStore, removeMarketItem } from './store'

describe('Marketplace store', () => {
  it('installs and removes a widget in the Developer Hub', () => {
    const store = new MarketStore(false)
    const item = marketItem('widget-profielbadge')!
    addMarketItem(item, 1, store)
    expect(devHubStore.getSnapshot().installs.some((i) => i.projectId === 'market-widget-profielbadge')).toBe(true)
    expect(store.getSnapshot().installed.map((i) => i.itemId)).toEqual(['widget-profielbadge'])
    removeMarketItem(item, store)
    expect(devHubStore.getSnapshot().projects.some((p) => p.id === 'market-widget-profielbadge')).toBe(false)
    expect(store.getSnapshot().installed).toEqual([])
  })

  it('applies a theme to the active profile', () => {
    addMarketItem(marketItem('theme-nacht-violet')!, 1, new MarketStore(false))
    const { active } = profilesStore.getSnapshot()
    expect([active.theme, active.accent]).toEqual(['pulse', 'violet'])
  })

  it('adds a flow recipe switched off, and a capture template', () => {
    const before = flowsStore.getSnapshot().flows.length
    addMarketItem(marketItem('flow-school-start')!, 1, new MarketStore(false))
    const flows = flowsStore.getSnapshot().flows
    expect(flows.length).toBe(before + 1)
    expect(flows.some((f) => f.enabled)).toBe(false)
    expect(flowStudioEnabled()).toBe(true)
    addMarketItem(marketItem('capture-labo')!, 1, new MarketStore(false))
    expect(capturesStore.getSnapshot().templates.some((t) => t.id === 'market-capture-labo')).toBe(true)
  })
})
