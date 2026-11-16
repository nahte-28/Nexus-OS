import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { Profiles } from '../apps/Profiles'
import { useVisibleApps } from '../apps/registry'
import { profilesStore } from './store'

describe('Apps per profiel', () => {
  afterEach(() => {
    cleanup()
    profilesStore.update((s) => ({ ...s, override: null, profiles: { ...s.profiles, personal: { ...s.profiles.personal, hidden: [] } } }))
  })

  it('hides a module in one profile only and lists every app that is on', () => {
    profilesStore.update((s) => ({ ...s, override: { profile: 'personal', mode: 'until-manual', windowOpenAtStart: true, setAt: Date.now() } }))
    render(<Profiles />)
    fireEvent.click(screen.getByRole('tab', { name: 'Apps & widgets' }))
    const select = screen.queryByLabelText('Profiel') as HTMLSelectElement | null
    if (select) fireEvent.change(select, { target: { value: 'personal' } })
    const list = screen.getByRole('list', { name: 'Apps' })
    // Apps that were missing from this list before, modules included.
    expect(within(list).getByRole('checkbox', { name: 'Studie' })).toBeTruthy()
    const darts = within(list).getByRole('checkbox', { name: 'Darts' }) as HTMLInputElement
    expect(darts.checked).toBe(true)
    const visible = renderHook(() => useVisibleApps().map((a) => a.id))
    expect(visible.result.current).toContain('darts')
    act(() => {
      fireEvent.click(darts)
    })
    expect(profilesStore.getSnapshot().state.profiles.personal.hidden).toContain('darts')
    expect(profilesStore.getSnapshot().state.profiles.gaming.hidden ?? []).not.toContain('darts')
    expect(visible.result.current).not.toContain('darts')
    act(() => {
      fireEvent.click(within(screen.getByRole('list', { name: 'Apps' })).getByRole('checkbox', { name: 'Darts' }))
    })
    expect(visible.result.current).toContain('darts')
  })
})
