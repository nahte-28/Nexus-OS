/**
 * NEXUS Circuit Flow (Visual Identity 2.0, phase 2): the copper traces on the desktop board. Pure
 * layout: given the size of the desktop, a fixed set of traces on the same 18px grid as the holes of
 * the wallpaper, with straight segments, 90° bends, a few branches and a solder pad at each end.
 * Seeded, so the board looks the same every time at the same size. The web layer draws them and
 * sends small pulses along them (apps/web/src/desktop/CircuitFlow.tsx).
 */

/** Distance between holes in the wallpaper (index.css, .nx-wallpaper). */
export const CIRCUIT_GRID = 18
/** Holes sit in the middle of each cell. */
const OFFSET = CIRCUIT_GRID / 2

export interface CircuitPoint {
  x: number
  y: number
}

export interface CircuitTrace {
  id: string
  /** Corners in px, first to last; every segment is horizontal or vertical. */
  points: CircuitPoint[]
  /** Length in px. */
  length: number
}

export interface CircuitLayout {
  traces: CircuitTrace[]
  /** Solder pads: where a trace ends. */
  pads: CircuitPoint[]
}

/** Small deterministic random generator (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Cell = [col: number, row: number]
const DIRS: Cell[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
]

const px = ([c, r]: Cell): CircuitPoint => ({ x: OFFSET + c * CIRCUIT_GRID, y: OFFSET + r * CIRCUIT_GRID })

function lengthOf(points: CircuitPoint[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y)
  return total
}

/**
 * Traces for a desktop of [width] × [height] px. Few enough to leave most of the board empty:
 * about one main trace per 180,000 px² (12 on a 1920 × 1080 screen), between 3 and 14.
 */
export function circuitLayout(width: number, height: number, seed = 7): CircuitLayout {
  const cols = Math.floor(width / CIRCUIT_GRID)
  const rows = Math.floor(height / CIRCUIT_GRID)
  if (cols < 8 || rows < 8) return { traces: [], pads: [] }
  const random = seededRandom(seed)
  const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1))
  const count = Math.max(3, Math.min(14, Math.round((width * height) / 180_000)))

  // Cells in use, with a margin of one cell around every trace, so traces never touch or cross.
  const taken = new Set<string>()
  const key = (c: number, r: number) => `${c},${r}`
  const free = (c: number, r: number) => c >= 1 && r >= 1 && c <= cols - 2 && r <= rows - 2 && !taken.has(key(c, r))
  const claim = (cells: Cell[]) => {
    for (const [c, r] of cells) for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) taken.add(key(c + dc, r + dr))
  }

  /**
   * Walks from the head of [body] in [dir] for up to [steps] cells, stopping before another trace's
   * margin, the board's edge, or its own earlier cells (so a trace never folds back onto itself).
   */
  const walk = (body: Cell[], dir: Cell, steps: number): Cell[] => {
    const index = new Map(body.map(([c, r], i) => [key(c, r), i]))
    const out: Cell[] = []
    let [c, r] = body[body.length - 1]
    for (let i = 0; i < steps; i++) {
      c += dir[0]
      r += dir[1]
      if (!free(c, r)) break
      const head = body.length + out.length - 1
      let touches = false
      for (let dc = -1; dc <= 1 && !touches; dc++)
        for (let dr = -1; dr <= 1 && !touches; dr++) {
          const j = index.get(key(c + dc, r + dr))
          if (j !== undefined && j < head - 1) touches = true
        }
      if (touches) break
      out.push([c, r])
      index.set(key(c, r), head + 1)
    }
    return out
  }

  const traces: CircuitTrace[] = []
  const pads: CircuitPoint[] = []

  /** One trace from [start]: 2 to 4 straight runs with 90° bends. Null when it is too short. */
  const route = (start: Cell, firstDir: Cell, runs: number): Cell[] | null => {
    const cells: Cell[] = [start]
    let dir = firstDir
    for (let run = 0; run < runs; run++) {
      const step = walk(cells, dir, int(4, 14))
      if (step.length < 3) break
      cells.push(...step)
      // Turn left or right, never back.
      dir = random() < 0.5 ? [dir[1], -dir[0]] : [-dir[1], dir[0]]
    }
    return cells.length >= 6 ? cells : null
  }

  /** Only the corners of a run of cells: the start, every bend and the end. */
  const corners = (cells: Cell[]): CircuitPoint[] => {
    const out: CircuitPoint[] = [px(cells[0])]
    for (let i = 1; i < cells.length - 1; i++) {
      const [a, b, c] = [cells[i - 1], cells[i], cells[i + 1]]
      if (b[0] - a[0] !== c[0] - b[0] || b[1] - a[1] !== c[1] - b[1]) out.push(px(b))
    }
    out.push(px(cells[cells.length - 1]))
    return out
  }

  for (let attempt = 0; attempt < count * 8 && traces.length < count; attempt++) {
    const start: Cell = [int(1, cols - 2), int(1, rows - 2)]
    if (!free(start[0], start[1])) continue
    const cells = route(start, DIRS[int(0, 3)], int(2, 4))
    if (!cells) continue
    claim(cells)
    const points = corners(cells)
    traces.push({ id: `t${traces.length}`, points, length: lengthOf(points) })
    pads.push(points[0], points[points.length - 1])

    // Some traces fork: a short side branch from the middle of a run, ending on its own pad.
    if (random() < 0.35 && cells.length > 8) {
      const at = cells[Math.floor(cells.length / 2)]
      const prev = cells[Math.floor(cells.length / 2) - 1]
      const along: Cell = [at[0] - prev[0], at[1] - prev[1]]
      const side: Cell = random() < 0.5 ? [along[1], -along[0]] : [-along[1], along[0]]
      // The branch starts inside the margin of its own trace, so it walks from one cell further out.
      const first: Cell = [at[0] + side[0] * 2, at[1] + side[1] * 2]
      if (free(first[0], first[1])) {
        const rest = walk([first], side, int(2, 5))
        const branch = [at, first, ...rest]
        if (branch.length >= 4) {
          claim(branch.slice(1))
          const bp = corners(branch)
          traces.push({ id: `t${traces.length}`, points: bp, length: lengthOf(bp) })
          pads.push(bp[bp.length - 1])
        }
      }
    }
  }
  return { traces, pads }
}

/** SVG path data for a trace. */
export function tracePath(trace: CircuitTrace): string {
  return trace.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ')
}
