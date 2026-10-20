import type { AccentId, ThemeId } from '@nexus/core'

/** Accent colours per theme: deeper on the light Focus theme, brighter on the dark Pulse theme. */
export const ACCENTS: Record<AccentId, { label: string; focus: [string, string]; pulse: [string, string] }> = {
  blue: { label: 'Blauw', focus: ['#2f5bd3', '#ffffff'], pulse: ['#60a5fa', '#04121a'] },
  cyan: { label: 'Cyaan', focus: ['#0e7490', '#ffffff'], pulse: ['#22d3ee', '#04121a'] },
  violet: { label: 'Paars', focus: ['#6d28d9', '#ffffff'], pulse: ['#a78bfa', '#0f0a1f'] },
  green: { label: 'Groen', focus: ['#15803d', '#ffffff'], pulse: ['#4ade80', '#04140a'] },
  orange: { label: 'Oranje', focus: ['#c2410c', '#ffffff'], pulse: ['#fb923c', '#1a0b02'] },
  pink: { label: 'Roze', focus: ['#be185d', '#ffffff'], pulse: ['#f472b6', '#1a0410'] },
}

/** Sets the profile's accent over the theme's own, or clears it again. */
export function applyAccent(accent: AccentId | null, theme: ThemeId, root: HTMLElement = document.documentElement): void {
  if (!accent) {
    root.style.removeProperty('--nx-accent')
    root.style.removeProperty('--nx-accent-text')
    return
  }
  const [color, text] = ACCENTS[accent][theme]
  root.style.setProperty('--nx-accent', color)
  root.style.setProperty('--nx-accent-text', text)
}
