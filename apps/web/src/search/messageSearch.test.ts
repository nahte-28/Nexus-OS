import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { SearchableMessage } from '@nexus/core'
import { useMessageSearch, type MessageSource } from './messageSearch'

const at = Date.parse('2030-01-10T14:00:00Z')
const team: SearchableMessage = { id: 'm1', kind: 'team', where: 'Projectgroep', open: 'chat:g1', from: 'Zoë', text: 'Het verslag moet vrijdag binnen', at }
const dm: SearchableMessage = { id: 'm2', kind: 'dm', where: 'Lars', open: 'dm:f1', from: 'Lars', text: 'Stuur je het verslag?', at: at + 1 }

describe('Berichten in Zoeken', () => {
  it('finds teamchat and privéberichten, and opens privéberichten only once', async () => {
    const source: MessageSource = { team: vi.fn(async () => [team]), dms: vi.fn(async () => [dm]) }
    const { result, rerender } = renderHook(({ q }) => useMessageSearch(q, { team: true, dm: true }, source), { initialProps: { q: 'verslag' } })
    await waitFor(() => expect(result.current.map((r) => r.id)).toEqual(['dm:f1:m2', 'chat:g1:m1']))
    expect(source.team).toHaveBeenCalledWith('verslag')
    rerender({ q: 'verslag vrijdag' })
    await waitFor(() => expect(result.current.map((r) => r.id)).toEqual(['chat:g1:m1']))
    expect(source.dms).toHaveBeenCalledTimes(1)
  })

  it('stays quiet for one letter or with Teams and Vrienden off', async () => {
    const source: MessageSource = { team: vi.fn(async () => [team]), dms: vi.fn(async () => [dm]) }
    renderHook(() => useMessageSearch('v', { team: true, dm: true }, source))
    renderHook(() => useMessageSearch('verslag', { team: false, dm: false }, source))
    await new Promise((r) => setTimeout(r, 400))
    expect(source.team).not.toHaveBeenCalled()
    expect(source.dms).not.toHaveBeenCalled()
  })
})
