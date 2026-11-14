import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { useVisibleApps } from '../apps/registry'
import { profilesStore } from '../profiles/store'
import { ModuleSettings } from './ModuleSettings'

describe('ModuleSettings', () => {
  afterEach(() => {
    cleanup()
    profilesStore.update((s) => ({ ...s, appSwitches: {} }))
  })

  it('lists every app and module in groups, all on, except the Developer Hub', () => {
    render(<ModuleSettings />)
    expect(screen.getByText('Apps aan/uit')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'School' })).toBeTruthy()
    const devHub = screen.getByRole('checkbox', { name: /Developer Hub/ }) as HTMLInputElement
    expect(devHub.checked).toBe(false)
    expect((screen.getByRole('checkbox', { name: /^Spaces/ }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: /^Financiën/ }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByRole('checkbox', { name: /^Launcher/ })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: /^Instellingen/ })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: /^Profielen/ })).toBeNull()
    expect(screen.queryAllByText('binnenkort')).toHaveLength(0)
    expect(screen.getByText('Wat dit toestel kan')).toBeTruthy()
  })

  it('hides a switched-off app everywhere and brings it back', () => {
    render(<ModuleSettings />)
    const visible = renderHook(() => useVisibleApps().map((a) => a.id))
    expect(visible.result.current).toContain('finance')
    act(() => {
      fireEvent.click(screen.getByRole('checkbox', { name: /^Financiën/ }))
    })
    expect(profilesStore.getSnapshot().state.appSwitches).toEqual({ finance: false })
    expect(visible.result.current).not.toContain('finance')
    act(() => {
      fireEvent.click(screen.getByRole('checkbox', { name: /^Financiën/ }))
    })
    expect(visible.result.current).toContain('finance')
  })
})
