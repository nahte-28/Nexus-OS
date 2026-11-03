import { describe, expect, it } from 'vitest'
import { emptyDevHub } from './extensions'
import { FLOW_TEMPLATES } from './flows'
import { emptyMarket, installMarketWidget, isInstalled, MARKET_ITEMS, markInstalled, markRemoved, marketItem, marketView, parseMarket, removeMarketWidget, reviewMarketWidget, widgetProjectId } from './marketplace'

describe('marketplace', () => {
  it('only lists widgets that pass the same review as your own', () => {
    const widgets = MARKET_ITEMS.filter((i) => i.kind === 'widget')
    expect(widgets.length).toBeGreaterThan(0)
    for (const w of widgets) expect(reviewMarketWidget(w).filter((c) => !c.ok), w.id).toEqual([])
  })

  it('has unique ids and every Flow Studio recipe', () => {
    expect(new Set(MARKET_ITEMS.map((i) => i.id)).size).toBe(MARKET_ITEMS.length)
    expect(marketView('flow', '').length).toBe(FLOW_TEMPLATES.length)
    expect(marketView('all', 'deadline').every((i) => `${i.title} ${i.description}`.toLowerCase().includes('deadline'))).toBe(true)
  })

  it('installs a widget with exactly its permissions, reinstalls cleanly and removes it', () => {
    const item = marketItem('widget-volgende-deadline')!
    let s = installMarketWidget(emptyDevHub(), item, 1)
    s = installMarketWidget(s, item, 2)
    expect(s.projects.filter((p) => p.id === widgetProjectId(item))).toHaveLength(1)
    expect(s.installs).toEqual([{ projectId: widgetProjectId(item), version: '1.0.0', permissions: ['agenda.read'], installedAt: 2 }])
    s = removeMarketWidget(s, item)
    expect(s).toEqual(emptyDevHub())
  })

  it('remembers what was added and drops unknown items', () => {
    const item = marketItem('theme-arcade')!
    let m = markInstalled(emptyMarket(), item, 5)
    expect(isInstalled(m, 'theme-arcade')).toBe(true)
    expect(parseMarket({ installed: [...m.installed, { itemId: 'evil', version: '1', at: 1 }] })).toEqual(m)
    m = markRemoved(m, 'theme-arcade')
    expect(m.installed).toEqual([])
  })
})
