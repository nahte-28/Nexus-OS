import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../theme/ThemeContext'
import { CircuitFlow } from './CircuitFlow'
import { setCircuitMotion } from './circuitSetting'

let reduce = false
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1920)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(1032)
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') && reduce, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  reduce = false
  setCircuitMotion(true)
})

const draw = () => render(<ThemeProvider><CircuitFlow /></ThemeProvider>).container

describe('CircuitFlow', () => {
  it('draws the traces and pads behind everything, hidden from screen readers and the mouse', () => {
    const box = draw().querySelector('[data-testid="circuit-flow"]')!
    expect(box.getAttribute('aria-hidden')).toBe('true')
    expect(box.className).toContain('pointer-events-none')
    expect(box.querySelectorAll('.nx-circuit-traces path').length).toBeGreaterThanOrEqual(3)
    expect(box.querySelectorAll('.nx-circuit-pads circle').length).toBeGreaterThanOrEqual(3)
    expect(box.querySelectorAll('.nx-circuit-pulse').length).toBeGreaterThan(0)
  })

  it('keeps the traces but stops the pulses when switched off or with reduce motion', () => {
    act(() => setCircuitMotion(false))
    expect(draw().querySelectorAll('.nx-circuit-pulse')).toHaveLength(0)
    cleanup()
    act(() => setCircuitMotion(true))
    reduce = true
    const c = draw()
    expect(c.querySelectorAll('.nx-circuit-pulse')).toHaveLength(0)
    expect(c.querySelectorAll('.nx-circuit-traces path').length).toBeGreaterThanOrEqual(3)
  })
})
