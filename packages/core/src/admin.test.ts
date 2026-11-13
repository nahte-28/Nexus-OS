import { describe, expect, it } from 'vitest'
import { deviceSummary, parseAdminOverview, sortAdminTeams } from './admin'

describe('beheeroverzicht', () => {
  it('leest het antwoord van de database, ook met ontbrekende delen', () => {
    const o = parseAdminOverview({
      at: '2026-11-13T15:00:00Z',
      accounts: { total: 5, new7d: '2' },
      online: [{ name: 'Bram', state: 'busy', lastSeen: '2026-11-13T14:59:00Z' }, { state: 'raar' }],
      devices: { web: 3, android: 1 },
      teams: [{ name: '1IT3', members: 4, online: 1 }],
      errors: { count7d: 1, latest: [{ at: '2026-11-13T10:00:00Z', app: 'Agenda', message: 'Kapot', note: '', version: '1.0', name: 'Bram' }] },
    })
    expect(o.accounts).toEqual({ total: 5, new7d: 2, signedIn7d: 0, active24h: 0, active7d: 0 })
    expect(o.online).toEqual([
      { name: 'Bram', state: 'busy', lastSeen: Date.parse('2026-11-13T14:59:00Z') },
      { name: 'Zonder naam', state: 'available', lastSeen: null },
    ])
    expect(o.teams[0]).toEqual({ name: '1IT3', members: 4, online: 1, messages7d: 0, createdAt: 0 })
    expect(o.activity.directMessages7d).toBe(0)
    expect(o.errors.latest[0].note).toBeNull()
    expect(parseAdminOverview(null).online).toEqual([])
  })

  it('vat toestellen en teams samen', () => {
    expect(deviceSummary({ android: 1, web: 3, desktop: 0 })).toBe('3 browser, 1 gsm-app')
    expect(deviceSummary({})).toBe('geen')
    const t = (name: string, online: number, messages7d: number) => ({ name, members: 3, online, messages7d, createdAt: 0 })
    expect(sortAdminTeams([t('B', 0, 5), t('A', 0, 5), t('C', 2, 0)]).map((x) => x.name)).toEqual(['C', 'A', 'B'])
  })
})
