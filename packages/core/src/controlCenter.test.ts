import { describe, expect, it } from 'vitest'
import { attention, moveFavorite, parseFavorites, statusCards, toggleFavorite, FAVORITES_MAX, type ControlInput } from './controlCenter'

const NOW = Date.UTC(2026, 10, 2, 9)
const input = (over: Partial<ControlInput> = {}): ControlInput => ({
  now: NOW,
  online: true,
  sync: { status: 'synced', pending: 0, lastSyncedAt: NOW - 5 * 60_000, error: null },
  connect: { status: 'ready', devices: 3, unread: 0 },
  profile: { name: 'School', scheduled: true },
  flows: { enabled: true, paused: false, quiet: false, active: 2, failedToday: 0 },
  inbox: null,
  deadlines: { overdue: 0, today: 0 },
  focus: { endsAt: null, phase: 'focus' },
  update: { status: 'current' },
  ...over,
})
const card = (cards: ReturnType<typeof statusCards>, id: string) => cards.find((c) => c.id === id)!

describe('control center', () => {
  it('shows everything fine when it is', () => {
    const cards = statusCards(input())
    expect(cards.map((c) => c.id)).toEqual(['sync', 'connect', 'profile', 'deadlines', 'flows', 'focus', 'update'])
    expect(card(cards, 'sync')).toMatchObject({ value: 'Bijgewerkt', detail: 'Laatst 5 min geleden.', tone: 'ok' })
    expect(card(cards, 'connect').value).toBe('2 andere apparaten')
    expect(card(cards, 'profile').detail).toBe('Volgens je uurrooster.')
    expect(attention(cards)).toBeNull()
  })

  it('puts the most urgent card first', () => {
    const cards = statusCards(input({ online: false, sync: { status: 'synced', pending: 2, lastSyncedAt: null, error: null }, deadlines: { overdue: 1, today: 2 } }))
    expect(card(cards, 'sync')).toMatchObject({ value: 'Offline', detail: '2 wijzigingen wachten.', tone: 'warn' })
    expect(attention(cards)).toMatchObject({ id: 'deadlines', value: '1 te laat', detail: 'En 2 vandaag.' })
  })

  it('reports flows, focus, inbox and updates', () => {
    const cards = statusCards(input({
      flows: { enabled: true, paused: false, quiet: true, active: 3, failedToday: 1 },
      focus: { endsAt: NOW + 12 * 60_000, phase: 'focus' },
      inbox: { unread: 4 },
      update: { status: 'available', version: '1.0.9' },
    }))
    expect(cards[4]).toMatchObject({ id: 'inbox', value: '4 ongelezen', tone: 'warn' })
    expect(card(cards, 'flows')).toMatchObject({ value: '3 actief', detail: '1 run mislukte vandaag.', tone: 'error' })
    expect(card(cards, 'focus')).toMatchObject({ value: 'Focus loopt', detail: 'Nog 12 min.' })
    expect(card(cards, 'update').value).toBe('Versie 1.0.9')
    expect(card(statusCards(input({ flows: { enabled: true, paused: true, quiet: false, active: 1, failedToday: 0 } })), 'flows').value).toBe('Gepauzeerd')
    expect(card(statusCards(input({ sync: { status: 'unconfigured', pending: 0, lastSyncedAt: null, error: null }, connect: { status: 'unconfigured', devices: 0, unread: 0 } })), 'connect').tone).toBe('off')
  })

  it('keeps favourites unique, ordered and limited', () => {
    expect(toggleFavorite(['notes'], 'agenda')).toEqual(['notes', 'agenda'])
    expect(toggleFavorite(['notes', 'agenda'], 'notes')).toEqual(['agenda'])
    const full = Array.from({ length: FAVORITES_MAX }, () => 'notes' as const)
    expect(toggleFavorite(full, 'agenda')).toHaveLength(FAVORITES_MAX)
    expect(moveFavorite(['notes', 'agenda', 'study'], 'study', -1)).toEqual(['notes', 'study', 'agenda'])
    expect(moveFavorite(['notes', 'agenda'], 'notes', -1)).toEqual(['notes', 'agenda'])
    expect(parseFavorites(['notes', 'notes', 'weg', 3, 'agenda'], (id) => id !== 'weg')).toEqual(['notes', 'agenda'])
    expect(parseFavorites('x', () => true)).toEqual([])
  })
})
