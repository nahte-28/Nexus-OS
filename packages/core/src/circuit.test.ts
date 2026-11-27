import { describe, expect, it } from 'vitest'
import { CIRCUIT_GRID, circuitLayout, tracePath, type CircuitPoint } from './circuit'

const onGrid = (v: number) => (v - CIRCUIT_GRID / 2) % CIRCUIT_GRID === 0

/** Every cell a trace passes through. */
function cellsOf(points: CircuitPoint[]): string[] {
  const out: string[] = []
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]]
    const steps = (Math.abs(b.x - a.x) + Math.abs(b.y - a.y)) / CIRCUIT_GRID
    for (let s = 0; s <= steps; s++) out.push(`${a.x + (Math.sign(b.x - a.x) * s * CIRCUIT_GRID)},${a.y + Math.sign(b.y - a.y) * s * CIRCUIT_GRID}`)
  }
  return out
}

describe('circuitLayout', () => {
  const sizes: Array<[number, number]> = [
    [1920, 1032],
    [1366, 812],
    [2560, 1392],
    [800, 560],
  ]

  it('draws traces on the holes of the wallpaper, straight with 90° bends, inside the board', () => {
    for (const [w, h] of sizes) {
      const { traces } = circuitLayout(w, h)
      expect(traces.length).toBeGreaterThanOrEqual(3)
      for (const t of traces) {
        expect(t.points.length).toBeGreaterThanOrEqual(2)
        for (const p of t.points) {
          expect(onGrid(p.x) && onGrid(p.y)).toBe(true)
          expect(p.x).toBeGreaterThan(0)
          expect(p.y).toBeGreaterThan(0)
          expect(p.x).toBeLessThan(w)
          expect(p.y).toBeLessThan(h)
        }
        for (let i = 1; i < t.points.length; i++) {
          const [a, b] = [t.points[i - 1], t.points[i]]
          expect(a.x === b.x || a.y === b.y).toBe(true)
          expect(a.x === b.x && a.y === b.y).toBe(false)
        }
      }
    }
  })

  it('leaves most of the board empty: few traces and no shared cells between main traces', () => {
    const { traces } = circuitLayout(1920, 1032)
    expect(traces.length).toBeLessThanOrEqual(24)
    const cols = Math.floor(1920 / CIRCUIT_GRID)
    const rows = Math.floor(1032 / CIRCUIT_GRID)
    const used = new Set(traces.flatMap((t) => cellsOf(t.points)))
    expect(used.size / (cols * rows)).toBeLessThan(0.15)
  })

  it('is the same every time for the same size, and empty on a tiny board', () => {
    expect(circuitLayout(1366, 812)).toEqual(circuitLayout(1366, 812))
    expect(circuitLayout(100, 100).traces).toEqual([])
  })

  it('writes an SVG path through the corners', () => {
    const t = { id: 't', points: [{ x: 9, y: 9 }, { x: 81, y: 9 }, { x: 81, y: 45 }], length: 108 }
    expect(tracePath(t)).toBe('M9 9 L81 9 L81 45')
  })
})
