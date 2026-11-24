/**
 * Workspace Studio 2.0: a free grid for the dashboard of each profile. Every widget gets a width
 * (1 to 6 columns) and a height (1 to 4 rows); the order is the profile's widget list. Pure
 * logic; the web app draws the grid, with drag, resize and a phone preview. On a large screen the
 * grid has more columns, and widgets stretch into the empty cells next to and under them, so the
 * dashboard fills the screen.
 */
import type { WidgetId } from './profiles'

export interface WidgetSize {
  w: 1 | 2 | 3 | 4 | 5 | 6
  h: 1 | 2 | 3 | 4
}

export type WidgetLayout = Partial<Record<WidgetId, WidgetSize>>

export const WIDGET_TITLES: Record<WidgetId, string> = {
  next_class: 'Volgende les',
  deadlines: 'Deadlines en afspraken',
  klashub: 'KlasHub',
  ai_study: 'AI Study',
  notes: 'Notities',
  notifications: 'Meldingen',
  devices: 'Apparaten',
  finance: 'Financiën',
  gaming: 'Gaming',
  profile: 'Profielkaart',
  habits: 'Gewoontes vandaag',
  quick_note: 'Snelle notitie',
  clock: 'Klok',
  shortcuts: 'Snelkoppelingen',
  agenda_week: 'Agenda deze week',
  today: 'Mijn dag',
}

export const WIDGET_IDS = Object.keys(WIDGET_TITLES) as WidgetId[]
export const MAX_COLUMNS = 6
export const MAX_ROWS = 4
export const DEFAULT_SIZE: WidgetSize = { w: 1, h: 1 }

/** The size a widget has until you change it: the busy ones start bigger. */
export const WIDGET_DEFAULT_SIZES: Partial<Record<WidgetId, WidgetSize>> = {
  profile: { w: 2, h: 1 },
  deadlines: { w: 2, h: 2 },
  notes: { w: 1, h: 2 },
  notifications: { w: 1, h: 2 },
  habits: { w: 1, h: 2 },
  quick_note: { w: 2, h: 1 },
  shortcuts: { w: 2, h: 1 },
  agenda_week: { w: 4, h: 2 },
  today: { w: 6, h: 1 },
}

export const defaultSizeOf = (id: WidgetId): WidgetSize => WIDGET_DEFAULT_SIZES[id] ?? DEFAULT_SIZE

const clampW = (n: number) => Math.min(MAX_COLUMNS, Math.max(1, Math.round(n))) as WidgetSize['w']
const clampH = (n: number) => Math.min(MAX_ROWS, Math.max(1, Math.round(n))) as WidgetSize['h']

export const sizeOf = (layout: WidgetLayout | undefined, id: WidgetId): WidgetSize => layout?.[id] ?? defaultSizeOf(id)

/** A stored layout: known widgets only, sizes within the grid. */
export function parseLayout(raw: unknown): WidgetLayout {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const out: WidgetLayout = {}
  for (const id of WIDGET_IDS) {
    const v = (raw as Record<string, unknown>)[id]
    if (typeof v !== 'object' || v === null) continue
    const { w, h } = v as { w?: unknown; h?: unknown }
    if (typeof w === 'number' && typeof h === 'number' && Number.isFinite(w) && Number.isFinite(h)) out[id] = { w: clampW(w), h: clampH(h) }
  }
  return out
}

/** Sets a size, kept within the grid; the default size is not stored. */
export function setSize(layout: WidgetLayout, id: WidgetId, size: { w: number; h: number }): WidgetLayout {
  const next: WidgetSize = { w: clampW(size.w), h: clampH(size.h) }
  const { [id]: _old, ...rest } = layout
  const base = defaultSizeOf(id)
  return next.w === base.w && next.h === base.h ? rest : { ...rest, [id]: next }
}

export const resizeBy = (layout: WidgetLayout, id: WidgetId, dw: number, dh: number): WidgetLayout => {
  const s = sizeOf(layout, id)
  return setSize(layout, id, { w: s.w + dw, h: s.h + dh })
}

/**
 * The size a drag on the resize handle ends in: the start size plus the distance in whole grid
 * cells (half a cell counts as one).
 */
export function sizeFromDrag(start: WidgetSize, dx: number, dy: number, cell: { width: number; height: number }): WidgetSize {
  return { w: clampW(start.w + dx / Math.max(1, cell.width)), h: clampH(start.h + dy / Math.max(1, cell.height)) }
}

/** Moves [id] to position [to] among [shown], keeping the widgets that are not shown where they were. */
export function moveWidget(all: WidgetId[], shown: WidgetId[], id: WidgetId, to: number): WidgetId[] {
  const from = shown.indexOf(id)
  if (from < 0) return all
  const target = Math.max(0, Math.min(shown.length - 1, to))
  if (target === from) return all
  const order = shown.filter((w) => w !== id)
  order.splice(target, 0, id)
  let i = 0
  return all.map((w) => (shown.includes(w) ? order[i++] : w))
}

/** How many columns a widget takes on a grid of [columns]: a phone shows everything full width. */
export const spanOn = (size: WidgetSize, columns: number) => Math.min(size.w, Math.max(1, columns))

/**
 * Columns of the dashboard grid for the width of the dashboard itself in pixels: one on a phone,
 * two on a tablet, four on a laptop and six on a large (full-HD) screen.
 */
export const columnsFor = (width: number) => (width >= 1400 ? 6 : width >= 1000 ? 4 : width >= 600 ? 2 : 1)

/** Where a widget sits in the grid: column and row from 0, width and height in cells. */
export interface Placement {
  id: WidgetId
  x: number
  y: number
  w: number
  h: number
}

/**
 * Places the widgets in order on a grid of [columns], each in the first free spot where it fits
 * (like CSS grid's dense flow), so a small widget fills a hole that a bigger one left.
 */
export function packWidgets(items: Array<{ id: WidgetId; size: WidgetSize }>, columns: number): Placement[] {
  const cols = Math.max(1, columns)
  const taken: boolean[][] = []
  const free = (x: number, y: number) => !taken[y]?.[x]
  const fits = (x: number, y: number, w: number, h: number) => {
    for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) if (!free(c, r)) return false
    return true
  }
  const out: Placement[] = []
  for (const { id, size } of items) {
    const w = spanOn(size, cols)
    const h = size.h
    let placed: Placement | null = null
    for (let y = 0; !placed; y++) {
      for (let x = 0; x + w <= cols; x++) {
        if (fits(x, y, w, h)) {
          placed = { id, x, y, w, h }
          break
        }
      }
    }
    for (let r = placed.y; r < placed.y + h; r++) {
      taken[r] ??= []
      for (let c = placed.x; c < placed.x + w; c++) taken[r][c] = true
    }
    out.push(placed)
  }
  return out
}

/** The number of rows the placements use. */
export const rowsOf = (placements: Placement[]) => placements.reduce((n, p) => Math.max(n, p.y + p.h), 0)

/**
 * Lets widgets grow into the empty cells right of them and then under them, so no holes are left
 * on a big screen. The stored sizes stay as they are; this is only how the grid is drawn.
 */
export function fillGaps(placements: Placement[], columns: number): Placement[] {
  const rows = rowsOf(placements)
  const owner: Array<Array<number>> = Array.from({ length: rows }, () => Array<number>(columns).fill(-1))
  placements.forEach((p, i) => {
    for (let r = p.y; r < p.y + p.h; r++) for (let c = p.x; c < p.x + p.w; c++) owner[r][c] = i
  })
  const out = placements.map((p) => ({ ...p }))
  const emptyCol = (c: number, y: number, h: number) => c < columns && owner.slice(y, y + h).every((row) => row[c] === -1)
  const emptyRow = (r: number, x: number, w: number) => r < rows && owner[r].slice(x, x + w).every((v) => v === -1)
  out.forEach((p, i) => {
    while (emptyCol(p.x + p.w, p.y, p.h)) {
      for (let r = p.y; r < p.y + p.h; r++) owner[r][p.x + p.w] = i
      p.w++
    }
  })
  out.forEach((p, i) => {
    while (emptyRow(p.y + p.h, p.x, p.w)) {
      for (let c = p.x; c < p.x + p.w; c++) owner[p.y + p.h][c] = i
      p.h++
    }
  })
  return out
}

/** The widget whose cell holds the point [col], [row] of the grid, or null. */
export function widgetAt(placements: Placement[], col: number, row: number): WidgetId | null {
  return placements.find((p) => col >= p.x && col < p.x + p.w && row >= p.y && row < p.y + p.h)?.id ?? null
}
