/**
 * Workspace Studio 2.0: a free grid for the dashboard of each profile. Every widget gets a width
 * (1 to 3 columns) and a height (1 or 2 rows); the order is the profile's widget list. Pure
 * logic; the web app draws the grid, with drag, resize and a phone preview.
 */
import type { WidgetId } from './profiles'

export interface WidgetSize {
  w: 1 | 2 | 3
  h: 1 | 2
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
}

export const WIDGET_IDS = Object.keys(WIDGET_TITLES) as WidgetId[]
export const MAX_COLUMNS = 3
export const MAX_ROWS = 2
export const DEFAULT_SIZE: WidgetSize = { w: 1, h: 1 }

const clampW = (n: number) => Math.min(MAX_COLUMNS, Math.max(1, Math.round(n))) as WidgetSize['w']
const clampH = (n: number) => Math.min(MAX_ROWS, Math.max(1, Math.round(n))) as WidgetSize['h']

export const sizeOf = (layout: WidgetLayout | undefined, id: WidgetId): WidgetSize => layout?.[id] ?? DEFAULT_SIZE

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
  return next.w === DEFAULT_SIZE.w && next.h === DEFAULT_SIZE.h ? rest : { ...rest, [id]: next }
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

/** Columns of the dashboard grid for a width in pixels, as the CSS breakpoints sm (640) and lg (1024). */
export const columnsFor = (width: number) => (width >= 1024 ? 3 : width >= 640 ? 2 : 1)
