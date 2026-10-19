/** The two NEXUS design identities: calm "Focus" and command-centre "Pulse". */
export type ThemeId = 'focus' | 'pulse'

export const THEMES: ReadonlyArray<{ id: ThemeId; label: string; description: string }> = [
  { id: 'focus', label: 'NEXUS Focus', description: 'Rustig, minimalistisch en professioneel.' },
  { id: 'pulse', label: 'NEXUS Pulse', description: 'Futuristisch commandocentrum met accenten.' },
]

export const DEFAULT_THEME: ThemeId = 'focus'

export function isThemeId(value: unknown): value is ThemeId {
  return value === 'focus' || value === 'pulse'
}
